import { useEffect, useState } from 'react'
import { getUsers, createUser, updateUser, deleteUser } from '../api/users'
import { getRoles } from '../api/roles'
import { getTiendas, getTiendasBySupervisor } from '../api/tiendas'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import useEscapeClose from '../hooks/useEscapeClose'

const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const emptyForm = { name: '', email: '', password: '', roleId: '', supervisedTiendaIds: [], tiendaId: '' }
const EMPTY_FILTERS = { from: '', to: '', name: '', email: '', roleId: '', isActive: '' }
const PAGE_SIZES = [10, 20, 50, 100]

// Mismo mapa de jerarquía que UserService#ROLE_RANK en el backend — se usa SOLO para
// ocultar del selector de alta/edición los roles que el backend igual rechazaría (menor
// rango numérico = más poder; cualquier rol sin entrada aquí, como CASHIER/SELLER o uno
// personalizado, cae por debajo de ADMIN). Es una ayuda de UX, no el control de acceso
// real: aunque este filtro se saltara, el backend igual lo rechaza (ver assertCanAssignRole).
const ROLE_RANK = { SUPER_ADMIN: 0, SUPERVISOR: 1, ADMIN: 2 }
const rankOf = (roleName) => ROLE_RANK[roleName] ?? 3

/**
 * Pantalla "Usuarios": CRUD de los usuarios de la tienda del usuario en sesión (o de todas
 * las tiendas si es `SUPER_ADMIN`, según lo que filtre el backend). Sirve a los roles con
 * la sección `USERS` habilitada (típicamente `ADMIN`/`SUPER_ADMIN`).
 *
 * Incluye filtros de búsqueda por rango de fecha de registro, nombre, email, rol y estado
 * (activo/inactivo), y una tabla con columna de fecha de registro. "Desactivar" un usuario
 * es un borrado suave (el backend marca `isActive=false`, no elimina el registro), por eso
 * la tabla muestra una columna de Estado en vez de que el usuario desaparezca de la lista;
 * los usuarios inactivos siguen apareciendo salvo que el filtro de Estado los excluya.
 *
 * Control de acceso (vía `isAdmin`, solo frontend — el backend es quien realmente lo hace
 * cumplir): cualquiera con la sección `USERS` habilitada puede VER esta pantalla y su
 * listado, pero dar de alta, editar y desactivar usuarios están reservados a ADMIN — antes
 * cualquier rol con acceso a Usuarios (ej. un vendedor) podía hacerlo también.
 *
 * Paginación server-side (mismo patrón que Sales/CashCuts/Inventory): `page`/`size` viajan
 * como query params y el backend responde `{content, page, size, totalElements, totalPages}`.
 * `roles`, en cambio, sigue viniendo del catálogo completo sin paginar (`getRoles`), porque
 * también alimenta el selector de rol del filtro y del formulario de alta/edición — paginarlo
 * ahí ocultaría roles del selector.
 *
 * Filtros: aplican solos al cambiar cualquier campo (mismo patrón que Apartados.jsx/
 * Sales.jsx) — Nombre/Email llevan debounce de 250ms para no pegarle a la API en cada
 * tecla; fecha/rol/estado disparan de inmediato. Cualquier cambio de filtro reinicia a la
 * primera página, para no quedar "atorado" en una página que ya no existe con el nuevo filtro.
 */
// Mismo patrón simple que el resto de la app para validar formato de correo del lado del
// cliente (ver validateUserForm) — no reemplaza al @Email real del backend, solo adelanta
// el error más común sin esperar el viaje redondo al servidor.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Users() {
  const { user, isAdmin, isSuperAdmin, isPlatformActor } = useAuth()
  const { notify, confirmDialog } = useNotify()
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [roles, setRoles] = useState([])
  // Tiendas visibles para el actor (todas si es SUPER_ADMIN, solo las suyas si es
  // SUPERVISOR — el backend ya las filtra así, ver `getTiendas`), cargado solo para
  // actores de plataforma. Alimenta dos selectores distintos del formulario: "¿qué
  // tiendas administra?" cuando el rol elegido es SUPERVISOR (ver showSupervisorPicker),
  // y "mover a qué tienda" para un usuario normal ya existente (ver showMoveTiendaPicker).
  const [allTiendas, setAllTiendas] = useState([])
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState(emptyForm)
  // Error general del modal de usuario (reglas de negocio sin campo asociado, o
  // cualquier fallo que no venga de @Valid/FieldConflictException).
  const [error, setError] = useState('')
  // Errores de validación por campo, { nombreDelCampo: mensaje } — mismo formato que
  // GlobalExceptionHandler ya manda para @Valid y para FieldConflictException (ver
  // UserService#create/#update, "El correo ya está registrado"). Se muestran justo debajo
  // de su input y ponen en rojo el asterisco de "obligatorio" de ese campo.
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  /**
   * Recarga el listado de usuarios usando `page`/`size` y los `filters` vigentes, y el
   * catálogo de roles para el selector del filtro y del formulario. El rango de fecha se
   * expande a inicio/fin de día (`T00:00:00` / `T23:59:59`) para que el filtro "Desde/Hasta"
   * incluya el día completo y no solo el instante exacto de medianoche.
   */
  function load() {
    const params = {
      page,
      size,
      name: filters.name || undefined,
      email: filters.email || undefined,
      roleId: filters.roleId || undefined,
      isActive: filters.isActive || undefined,
      from: filters.from ? `${filters.from}T00:00:00` : undefined,
      to: filters.to ? `${filters.to}T23:59:59` : undefined,
    }
    getUsers(params).then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
    getRoles().then((r) => setRoles(r.data.data ?? []))
    if (isPlatformActor) getTiendas().then((r) => setAllTiendas(r.data.data ?? []))
  }

  // Debounce de 250ms (mismo patrón que Inventory.jsx/POS.jsx) para no pegarle a la API en
  // cada tecla de Nombre/Email; fecha/rol/estado/página disparan igual de rápido, no vale
  // la pena separarlos del resto.
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [page, size, filters])

  // Cierra con ESC el modal de usuario (mismo efecto que "Cancelar"), descartando lo capturado.
  useEscapeClose(showModal, () => setShowModal(false))

  /** Actualiza un filtro y reinicia a la primera página, para no quedar "atorado" en una
   *  página que ya no existe con el nuevo filtro. */
  function setFilter(patch) {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(0)
  }

  /** Limpia todos los filtros y vuelve a la primera página. */
  function handleClearFilters() {
    setFilters(EMPTY_FILTERS)
    setPage(0)
  }

  const hasFilters = filters.from || filters.to || filters.name || filters.email || filters.roleId || filters.isActive

  // Abre el modal en blanco para crear un usuario nuevo. `roleId` arranca vacío a
  // propósito (no se preselecciona el primer rol de la lista): así el select siempre
  // muestra "Selecciona un rol" por default y de verdad obliga a elegir uno — antes
  // quedaba preseleccionado, así que un admin distraído podía crear un usuario con el
  // primer rol de la lista sin haberlo elegido conscientemente.
  function openNew() {
    setEditUser(null)
    setForm({ ...emptyForm })
    setError('')
    setFieldErrors({})
    setShowModal(true)
  }

  // Abre el modal precargado con los datos del usuario a editar. La contraseña se deja
  // vacía a propósito: en edición, un campo vacío significa "no cambiar la contraseña".
  // Si es un SUPERVISOR, precarga además qué tiendas administra hoy (esa info no viaja en
  // el propio usuario — ver getTiendasBySupervisor) para que el selector arranque marcado
  // con lo que ya tiene, no vacío. `tiendaId` precarga la tienda ACTUAL del usuario (o ''
  // para uno de plataforma, que no tiene) — ver showMoveTiendaPicker más abajo.
  function openEdit(u) {
    setEditUser(u)
    setForm({ name: u.name, email: u.email, password: '', roleId: u.role?.id ?? '', supervisedTiendaIds: [], tiendaId: u.tienda?.id ?? '' })
    setError('')
    setFieldErrors({})
    setShowModal(true)
    if (isSuperAdmin && u.role?.name === 'SUPERVISOR') {
      getTiendasBySupervisor(u.id).then((r) => {
        setForm((f) => ({ ...f, supervisedTiendaIds: (r.data.data ?? []).map((t) => t.id) }))
      })
    }
  }

  /**
   * Valida el formulario de usuario del lado del cliente, replicando los límites que ya
   * exige `UserRequest` en el backend (mismos mensajes) — para adelantar el error más
   * común antes de pedir confirmación de guardado (ver `handleSave`), en vez de hacerlo
   * hasta después del viaje redondo al servidor. El backend sigue siendo quien de verdad
   * decide (esto no lo reemplaza).
   *
   * @returns {{[field: string]: string}} vacío si el formulario es válido
   */
  function validateUserForm() {
    const errors = {}
    if (!form.name.trim()) errors.name = 'El nombre es obligatorio'
    else if (form.name.length > 100) errors.name = 'El nombre no puede tener más de 100 caracteres'
    if (!form.email.trim()) errors.email = 'El correo es obligatorio'
    else if (!EMAIL_RE.test(form.email)) errors.email = 'El correo no tiene un formato válido'
    else if (form.email.length > 150) errors.email = 'El correo no puede tener más de 150 caracteres'
    // La contraseña solo se valida si de verdad se va a cambiar (al crear, este campo ni
    // siquiera se muestra — ver el JSX; al editar, vacío significa "no cambiarla").
    if (editUser && form.password && (form.password.length < 6 || form.password.length > 72)) {
      errors.password = 'La contraseña debe tener entre 6 y 72 caracteres'
    }
    if (!form.roleId) errors.roleId = 'Selecciona un rol'
    if (showMoveTiendaPicker && !form.tiendaId) errors.tiendaId = 'Selecciona una tienda'
    return errors
  }

  // Crea o actualiza el usuario según haya o no un `editUser` en edición (previa
  // confirmación explícita, para evitar altas/ediciones accidentales), y recarga el
  // listado (respetando los filtros aplicados). La confirmación solo se pide si el
  // formulario ya pasó `validateUserForm` — no tiene sentido preguntar "¿deseas crear/
  // guardar?" si el backend lo va a rechazar de todas formas.
  async function handleSave(e) {
    e.preventDefault()
    const validationErrors = validateUserForm()
    if (Object.keys(validationErrors).length > 0) {
      // Advertencia de validación local, NO el mismo mensaje que un fallo real del
      // backend (ver el catch de abajo) — aquí todavía no se intentó guardar nada.
      setFieldErrors(validationErrors)
      setError('')
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    const confirmMsg = editUser
      ? `¿Deseas guardar los cambios de "${form.name}"?`
      : `¿Deseas crear el usuario "${form.name}"? Se le enviará una contraseña temporal a ${form.email}.`
    if (!(await confirmDialog(confirmMsg, { confirmText: editUser ? 'Guardar cambios' : 'Crear', danger: false }))) return
    setLoading(true)
    setError('')
    setFieldErrors({})
    try {
      // tiendaId viaja como número solo cuando de verdad hay un selector visible para
      // elegirla (showMoveTiendaPicker) — de lo contrario se manda `undefined` (axios lo
      // omite del JSON) en vez de '' cruda, que el backend rechazaría al no ser un Long válido.
      const payload = { ...form, tiendaId: showMoveTiendaPicker && form.tiendaId ? Number(form.tiendaId) : undefined }
      if (editUser) await updateUser(editUser.id, payload)
      else await createUser(payload)
      setShowModal(false)
      load()
      notify(editUser ? 'Usuario editado correctamente' : 'Usuario agregado correctamente', 'success')
    } catch (err) {
      // Errores de validación (@Valid) y de conflicto por campo (ej. correo duplicado,
      // ver UserService#create/#update) traen { campo: mensaje } en `data` — se reparten a
      // `fieldErrors` para mostrarse justo debajo de cada input. Cualquier otro tipo de
      // error (regla de negocio sin campo asociado, 500, etc.) va al mensaje general.
      const data = err.response?.data?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setFieldErrors(data)
        setError('')
      } else {
        setFieldErrors({})
        setError(err.response?.data?.message ?? 'Error al guardar')
      }
      notify(editUser ? 'Error al guardar el usuario' : 'Error al registrar el usuario', 'error')
    } finally { setLoading(false) }
  }

  /**
   * "Elimina" (desactiva) un usuario tras confirmación explícita. Es un borrado suave:
   * el backend marca `isActive=false` en vez de borrar el registro, por lo que el usuario
   * sigue apareciendo en la tabla (con estado "Inactivo") salvo que el filtro de Estado lo
   * oculte. Por eso el botón de acción en la tabla solo se muestra para usuarios activos
   * (`u.isActive`) — ya no tiene sentido "desactivar" a alguien ya inactivo.
   */
  async function handleDelete(u) {
    if (!(await confirmDialog(`¿Desactivar a "${u.name}"?`, { confirmText: 'Desactivar' }))) return
    await deleteUser(u.id)
    load()
  }

  // Colores de la etiqueta de rol en la tabla; los roles sin color definido (roles
  // personalizados creados por el admin) caen en el gris por default.
  const ROLE_COLORS = { ADMIN: 'bg-purple-100 text-purple-700', CASHIER: 'bg-blue-100 text-blue-700', SELLER: 'bg-green-100 text-green-700' }
  const roleColor = (name) => ROLE_COLORS[name] ?? 'bg-gray-100 text-gray-600'

  const users = pageData.content ?? []
  const totalPages = pageData.totalPages ?? 0
  const totalElements = pageData.totalElements ?? 0
  // Rango "X–Y de Z" mostrado junto al selector de tamaño de página, calculado localmente
  // a partir de la página/tamaño actuales y el total que reporta el backend.
  const from = totalElements === 0 ? 0 : page * size + 1
  const to = Math.min(totalElements, page * size + users.length)

  // Roles que el actor puede asignar al alta/editar (ver ROLE_RANK arriba): estrictamente
  // por debajo del suyo. El filtro de búsqueda de la tabla (más abajo) sigue usando `roles`
  // completo — ahí sí tiene sentido poder filtrar por "ADMIN" aunque no puedas crear uno.
  const assignableRoles = roles.filter((r) => rankOf(r.name) > rankOf(user?.role))

  // Cuando el rol elegido en el formulario es SUPERVISOR (solo un SUPER_ADMIN llega a
  // verlo como opción — ver RoleService#findAll en el backend), se muestra un selector de
  // qué tiendas va a administrar. `supervisedTiendaIds` viaja tal cual en el payload de
  // alta/edición; el backend lo ignora por completo si el rol elegido no es SUPERVISOR.
  //
  // OJO: "SUPERVISOR" no es un nombre único — una tienda puede tener su propio rol
  // personalizado con ese mismo nombre (distinto del rol de plataforma real). El de
  // plataforma es el único sin `tienda` en la respuesta (esa tienda viene omitida del JSON
  // por ser null), así que se distingue por eso, no solo por el nombre.
  const supervisorRoleId = roles.find((r) => r.name === 'SUPERVISOR' && !r.tienda)?.id
  const showSupervisorTiendaPicker = isSuperAdmin && supervisorRoleId != null && String(form.roleId) === String(supervisorRoleId)

  /** Marca/desmarca una tienda en el selector de "tiendas que administra" del formulario. */
  function toggleSupervisedTienda(tiendaId) {
    setForm((f) => {
      const has = f.supervisedTiendaIds.includes(tiendaId)
      return { ...f, supervisedTiendaIds: has ? f.supervisedTiendaIds.filter((id) => id !== tiendaId) : [...f.supervisedTiendaIds, tiendaId] }
    })
  }

  // Selector de "mover a qué tienda": solo para editar un usuario que YA existe (para uno
  // nuevo, la tienda se resuelve sola según dónde esté actuando quien lo crea) y solo
  // cuando el rol elegido en el formulario NO es de plataforma (SUPERVISOR/SUPER_ADMIN no
  // tienen una tienda propia que mover — ver showSupervisorTiendaPicker arriba, que es su
  // selector correspondiente). Visible para SUPER_ADMIN (cualquier tienda) o SUPERVISOR
  // (el backend ya le filtra `allTiendas` a solo las suyas).
  const formRole = roles.find((r) => String(r.id) === String(form.roleId))
  const showMoveTiendaPicker = isPlatformActor && !!editUser && !!formRole && !!formRole.tienda

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Usuarios</h2>
        {isAdmin && <button className="btn-primary" onClick={openNew}>+ Nuevo usuario</button>}
      </div>

      {/* flex-wrap, sin botón "Filtrar": cada campo aplica solo al cambiar (mismo patrón
          que Apartados.jsx/Sales.jsx/CashCuts.jsx) — "Limpiar filtros" solo aparece si hay
          algo que limpiar. */}
      <div className="card mb-4 flex flex-wrap gap-3 items-end">
        <div className="w-36">
          <label className="text-xs font-medium text-gray-600 block mb-1">Desde</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />
        </div>
        <div className="w-36">
          <label className="text-xs font-medium text-gray-600 block mb-1">Hasta</label>
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />
        </div>
        <div className="w-40">
          <label className="text-xs font-medium text-gray-600 block mb-1">Nombre</label>
          <input type="text" className="input" placeholder="Nombre" value={filters.name} onChange={(e) => setFilter({ name: e.target.value })} />
        </div>
        <div className="w-48">
          <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
          <input type="text" className="input" placeholder="Email" value={filters.email} onChange={(e) => setFilter({ email: e.target.value })} />
        </div>
        <div className="w-40">
          <label className="text-xs font-medium text-gray-600 block mb-1">Rol</label>
          <select className="input" value={filters.roleId} onChange={(e) => setFilter({ roleId: e.target.value })}>
            <option value="">Todos</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="w-36">
          <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
          <select className="input" value={filters.isActive} onChange={(e) => setFilter({ isActive: e.target.value })}>
            <option value="">Todos</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
        {hasFilters && (
          <button type="button" className="btn-secondary text-sm" onClick={handleClearFilters}>Limpiar filtros</button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Nombre', 'Email', 'Rol', 'Fecha de registro', 'Estado', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${roleColor(u.role?.name)}`}>{u.role?.name}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {u.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <button className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(u)}>Editar</button>
                      {u.isActive && (
                        <button className="text-red-500 hover:underline text-xs" onClick={() => handleDelete(u)}>Desact.</button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin usuarios</td></tr>
            )}
          </tbody>
        </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <span>Mostrar</span>
            <select
              className="input !w-auto py-1"
              value={size}
              onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>por página · {totalElements === 0 ? 'sin resultados' : `${from}–${to} de ${totalElements}`}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ‹ Anterior
            </button>
            <span className="text-gray-500 text-xs">Página {totalPages === 0 ? 0 : page + 1} de {totalPages}</span>
            <button
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente ›
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editUser ? 'Editar usuario' : 'Nuevo usuario'}</h3>
            {/* Sin `required`/`type="email"` nativos a propósito (ver validateUserForm):
                el globo del navegador se disparaba antes de que este formulario corriera,
                tapando nuestro propio manejo de errores. */}
            <form onSubmit={handleSave} className="space-y-3">
              <div><label className="text-xs font-medium text-gray-600">Nombre <span className={fieldErrors.name ? 'text-red-600' : ''}>*</span></label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                {fieldErrors.name && <p className="text-red-600 text-xs mt-1">{fieldErrors.name}</p>}</div>
              <div><label className="text-xs font-medium text-gray-600">Email <span className={fieldErrors.email ? 'text-red-600' : ''}>*</span></label>
                <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                {fieldErrors.email && <p className="text-red-600 text-xs mt-1">{fieldErrors.email}</p>}</div>
              {editUser ? (
                <div><label className="text-xs font-medium text-gray-600">Contraseña (dejar vacío para no cambiar)</label>
                  <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  {fieldErrors.password && <p className="text-red-600 text-xs mt-1">{fieldErrors.password}</p>}
                  <p className="text-xs text-gray-400 mt-1">Si la cambias aquí, se le pedirá elegir una nueva la próxima vez que inicie sesión.</p>
                </div>
              ) : (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  📧 Se le va a enviar una contraseña temporal por correo, y se le pedirá cambiarla al iniciar sesión por primera vez.
                </p>
              )}
              <div><label className="text-xs font-medium text-gray-600">Rol <span className={fieldErrors.roleId ? 'text-red-600' : ''}>*</span></label>
                <select className="input" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                  <option value="">Selecciona un rol</option>
                  {/* Sin tienda = rol de plataforma (SUPERVISOR); se distingue en el label
                      por si ya existe un rol personalizado con el mismo nombre en esta
                      tienda (el nombre de un rol no es único entre plataforma y tiendas). */}
                  {assignableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}{!r.tienda ? ' (plataforma)' : ''}</option>)}
                </select>
                {fieldErrors.roleId && <p className="text-red-600 text-xs mt-1">{fieldErrors.roleId}</p>}</div>
              {showSupervisorTiendaPicker && (
                <div>
                  <label className="text-xs font-medium text-gray-600">¿Qué tiendas va a administrar? *</label>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto mt-1">
                    {allTiendas.length === 0 ? (
                      <p className="text-xs text-gray-400 px-3 py-2">Todavía no hay tiendas registradas.</p>
                    ) : allTiendas.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={form.supervisedTiendaIds.includes(t.id)}
                          onChange={() => toggleSupervisedTienda(t.id)}
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                  {form.supervisedTiendaIds.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Sin ninguna marcada, este Supervisor no podrá ver ni administrar ninguna tienda todavía.</p>
                  )}
                </div>
              )}
              {showMoveTiendaPicker && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Tienda <span className={fieldErrors.tiendaId ? 'text-red-600' : ''}>*</span></label>
                  <select className="input" value={form.tiendaId} onChange={(e) => setForm({ ...form, tiendaId: e.target.value })}>
                    <option value="" disabled>Selecciona una tienda</option>
                    {allTiendas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {fieldErrors.tiendaId && <p className="text-red-600 text-xs mt-1">{fieldErrors.tiendaId}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    Si tiene un corte de caja abierto, primero debe cerrarlo antes de poder moverlo a otra tienda.
                  </p>
                </div>
              )}
              {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</p>}
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
