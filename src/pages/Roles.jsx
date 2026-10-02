import { Fragment, useEffect, useState } from 'react'
import { getRolesPage, createRole, updateRole, deleteRole } from '../api/roles'
import { SECTIONS } from '../config/sections'
import { useNotify } from '../context/NotifyContext'
import { useAuth } from '../context/AuthContext'
import useEscapeClose from '../hooks/useEscapeClose'
import { roleLabel, MANAGEMENT_ROLE_NAMES } from '../utils/roleLabels'

const emptyForm = { name: '', description: '', sections: [], actionGrants: [] }
const PAGE_SIZES = [10, 20, 50, 100]

// Columnas fijas de la tabla de permisos finos — el orden es el mismo en que se muestran.
const CRUD_COLUMNS = [
  { action: 'CREATE', label: 'Agregar' },
  { action: 'EDIT', label: 'Editar' },
  { action: 'DELETE', label: 'Eliminar' },
]

// Acciones de mutación configurables por sección (ver SectionAccessService#checkAction en
// el backend) — una sección ausente de este mapa, o una acción que no esté en su lista, se
// muestra con "—" en la tabla de permisos (sin ese nivel de detalle). No todos los módulos
// tienen las tres: Ventas solo puede cancelarse (no hay "editar" una venta ya hecha, y
// venderla es la sección POS, no esta), y Apartados no tiene alta manual (se crean desde
// la tienda pública) — confirmar/completar/quitar un producto cuentan como "editar". En
// Usuarios, aunque se le dé el permiso a un rol sin rango (CASHIER o uno personalizado), la
// jerarquía de UserService#assertCanManage sigue sin dejarlo tocar cuentas ADMIN/SUPERVISOR
// /SUPER_ADMIN — solo otras cuentas sin rango.
const CRUD_SECTIONS = {
  INVENTORY: ['CREATE', 'EDIT', 'DELETE'],
  SALES: ['DELETE'],
  APARTADOS: ['EDIT', 'DELETE'],
  USERS: ['CREATE', 'EDIT', 'DELETE'],
}

/**
 * Pantalla de "Roles y Permisos": CRUD de los roles disponibles para la tienda del
 * usuario (o de todas si es `SUPER_ADMIN`). Cada rol define qué `AppSection` (módulos:
 * Dashboard, POS, Inventario, Ventas, Cortes de Caja, Reportes, Usuarios, Roles) puede ver
 * un usuario con ese rol, y — para las secciones con ese nivel de detalle (hoy, Inventario)
 * — qué puede hacer dentro (Agregar/Editar/Eliminar). Es la base del RBAC de la app. Sirve
 * a los roles con la sección `ROLES` habilitada (típicamente `ADMIN`/`SUPER_ADMIN`).
 *
 * Los roles marcados como `isSystem` (roles predefinidos del sistema, ej. el rol admin
 * base) tienen restricciones especiales: no se pueden eliminar (el botón "Eliminar" no
 * se muestra), su nombre no es editable, y no se les puede quitar la sección `ROLES`
 * (para evitar dejar la tienda sin ningún usuario que pueda administrar roles).
 *
 * Edición en fila expandible (acordeón) en vez de modal: al "Editar" un rol (o "+ Nuevo
 * rol"), la fila se expande hacia abajo mostrando el formulario ahí mismo, con una sola
 * tabla de permisos (Ver + Agregar/Editar/Eliminar) en vez de dos bloques de checkboxes
 * sueltos — se pidió explícitamente este diseño en vez del modal angosto anterior.
 *
 * Paginación server-side (mismo patrón que Sales/CashCuts/Inventory/Users): `page`/`size`
 * viajan como query params a `GET /roles/page` y el backend responde `{content, page, size,
 * totalElements, totalPages}`. Es un endpoint aparte de `GET /roles` (sin paginar), que sigue
 * existiendo porque alimenta el selector de rol de la pantalla de Usuarios — paginarlo ahí
 * ocultaría roles del selector.
 */
export default function Roles() {
  const { notify, confirmDialog } = useNotify()
  const { isSuperAdmin } = useAuth()
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  // Qué fila está expandida: el `id` del rol en edición, el literal 'new' (alta de un rol
  // nuevo, se muestra como fila extra arriba de la lista), o `null` si todo está cerrado.
  const [expandedId, setExpandedId] = useState(null)
  const [editRole, setEditRole] = useState(null)
  const [form, setForm] = useState(emptyForm)
  // Error general del panel de rol (reglas de negocio sin campo asociado, o cualquier
  // fallo que no venga de @Valid).
  const [error, setError] = useState('')
  // Errores de validación por campo, { nombreDelCampo: mensaje } — mismo formato que
  // GlobalExceptionHandler ya manda para @Valid (ver RoleRequest en el backend). Se
  // muestran justo debajo de su input/grupo y ponen en rojo el asterisco correspondiente.
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  // Recarga la página actual de roles (tras crear/editar/eliminar, cambiar de página/tamaño,
  // o al montar).
  function load() {
    getRolesPage({ page, size }).then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
  }

  useEffect(() => { load() }, [page, size])

  // Cierra con ESC el panel expandido (mismo efecto que "Cancelar"), descartando lo capturado.
  useEscapeClose(expandedId !== null, () => setExpandedId(null))

  function closePanel() {
    setExpandedId(null)
  }

  // Abre el panel en blanco para crear un rol nuevo (o lo cierra si ya estaba abierto).
  function openNew() {
    if (expandedId === 'new') { closePanel(); return }
    setEditRole(null)
    setForm(emptyForm)
    setError('')
    setFieldErrors({})
    setExpandedId('new')
  }

  // Abre el panel precargado con los datos del rol a editar (o lo cierra si ya estaba
  // abierto sobre ese mismo rol — comportamiento de acordeón).
  function toggleEdit(r) {
    if (expandedId === r.id) { closePanel(); return }
    setEditRole(r)
    setForm({ name: r.name, description: r.description ?? '', sections: r.sections ?? [], actionGrants: r.actionGrants ?? [] })
    setError('')
    setFieldErrors({})
    setExpandedId(r.id)
  }

  /**
   * Valida el formulario de rol del lado del cliente, replicando los límites que ya exige
   * `RoleRequest` en el backend (mismos textos de mensaje) — para detectar el error ANTES
   * de pedir confirmación de guardado (ver `handleSave`), en vez de hacerlo hasta después
   * del viaje redondo al servidor. El backend sigue siendo quien de verdad decide.
   *
   * @returns {{[field: string]: string}} vacío si el formulario es válido
   */
  function validateRoleForm() {
    const errors = {}
    if (!form.name.trim()) errors.name = 'El nombre del rol es obligatorio'
    else if (form.name.length > 40) errors.name = 'El nombre del rol no puede tener más de 40 caracteres'
    if (form.description.length > 200) errors.description = 'La descripción no puede tener más de 200 caracteres'
    if (form.sections.length === 0) errors.sections = 'Selecciona al menos una sección'
    return errors
  }

  /**
   * Activa/desactiva una sección (`AppSection`) dentro del formulario de rol.
   * Regla de negocio: si el rol que se está editando es `isSystem`, no se le puede quitar
   * la sección `ROLES` (checkbox deshabilitado en el JSX), para no dejar a la tienda sin
   * forma de administrar roles/permisos.
   */
  function toggleSection(code) {
    if (editRole?.isSystem && code === 'ROLES') return // no se puede quitar a un rol del sistema
    setForm((f) => ({
      ...f,
      sections: f.sections.includes(code)
        ? f.sections.filter((c) => c !== code)
        : [...f.sections, code],
    }))
  }

  /**
   * Activa/desactiva una acción de mutación (CREATE/EDIT/DELETE) dentro de una sección,
   * codificada igual que en el backend ("SECCION:ACCION", ej. "INVENTORY:CREATE" — ver
   * Role#actionGrants). Solo tiene efecto real para roles que NO son de gestión (ver
   * MANAGEMENT_ROLE_NAMES): para ADMIN/SUPERVISOR/SUPER_ADMIN el backend ignora por
   * completo esta lista (siempre tienen CRUD total), así que esas celdas se muestran como
   * "—" en vez de checkbox — ver renderPermissionsTable.
   */
  function toggleActionGrant(section, action) {
    const key = `${section}:${action}`
    setForm((f) => ({
      ...f,
      actionGrants: f.actionGrants.includes(key)
        ? f.actionGrants.filter((g) => g !== key)
        : [...f.actionGrants, key],
    }))
  }

  // Los checkboxes de CRUD por sección solo tienen sentido para un rol que de verdad
  // quede sujeto a `actionGrants` — un rol de gestión siempre tiene CRUD completo sin
  // importar lo que se marque aquí (ver SectionAccessService#checkAction en el backend),
  // así que esas columnas se muestran en "—" para no ser engañosas.
  const isManagementRole = MANAGEMENT_ROLE_NAMES.includes(form.name)

  // Crea o actualiza el rol según haya o no un `editRole` en edición (previa confirmación
  // explícita, para evitar altas/ediciones accidentales de permisos), y recarga el listado.
  // La validación local (`validateRoleForm`) corre ANTES de pedir esa confirmación: no
  // tiene sentido preguntar "¿deseas crear/guardar?" si el backend lo va a rechazar de
  // todas formas.
  async function handleSave(e) {
    e.preventDefault()
    const validationErrors = validateRoleForm()
    if (Object.keys(validationErrors).length > 0) {
      // Advertencia de validación local, NO el mismo mensaje que un fallo real del
      // backend (ver el catch de abajo) — aquí todavía no se intentó guardar nada.
      setFieldErrors(validationErrors)
      setError('')
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    const confirmMsg = editRole
      ? `¿Deseas guardar los cambios del rol "${form.name}"?`
      : `¿Deseas crear el rol "${form.name}"?`
    if (!(await confirmDialog(confirmMsg, { confirmText: editRole ? 'Guardar cambios' : 'Crear', danger: false }))) return
    setLoading(true)
    setError('')
    setFieldErrors({})
    try {
      if (editRole) await updateRole(editRole.id, form)
      else await createRole(form)
      closePanel()
      load()
      notify(editRole ? 'Rol editado correctamente' : 'Rol guardado correctamente', 'success')
    } catch (err) {
      // Errores de validación (@Valid o FieldConflictException, ver GlobalExceptionHandler
      // en el backend) traen { campo: mensaje } en `data` — se reparten a `fieldErrors`
      // para mostrarse justo debajo de cada input. Cualquier otro tipo de error (regla de
      // negocio sin campo asociado, 500, etc.) no tiene campo: va al mensaje general.
      const data = err.response?.data?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setFieldErrors(data)
        setError('')
      } else {
        setFieldErrors({})
        setError(err.response?.data?.message ?? 'Error al guardar')
      }
      notify(editRole ? 'Error al guardar el rol' : 'Error al registrar el rol', 'error')
    } finally { setLoading(false) }
  }

  /**
   * Elimina un rol tras confirmación explícita del usuario (los roles `isSystem` nunca
   * llegan aquí porque su botón "Eliminar" no se renderiza). Cualquier error del backend
   * (ej. el rol tiene usuarios asignados) se muestra como notificación en vez de bloquear
   * la UI.
   */
  async function handleDelete(r) {
    if (!(await confirmDialog(`¿Eliminar el rol "${r.name}"?`, { confirmText: 'Eliminar' }))) return
    try {
      await deleteRole(r.id)
      if (expandedId === r.id) closePanel()
      load()
    } catch (err) {
      notify(err.response?.data?.message ?? 'Error al eliminar')
    }
  }

  const roles = pageData.content ?? []
  const totalPages = pageData.totalPages ?? 0
  const totalElements = pageData.totalElements ?? 0
  // Rango "X–Y de Z" mostrado junto al selector de tamaño de página, calculado localmente
  // a partir de la página/tamaño actuales y el total que reporta el backend.
  const from = totalElements === 0 ? 0 : page * size + 1
  const to = Math.min(totalElements, page * size + roles.length)

  /**
   * Formulario de alta/edición de rol, usado tanto para la fila "+ Nuevo rol" como para la
   * fila expandida de un rol existente — lee directamente de los estados del componente
   * (`form`, `editRole`, etc.), así que se invoca como función (`renderPanel()`), nunca
   * como componente JSX (`<RenderPanel/>`): como componente, React lo trataría como un tipo
   * nuevo en cada render y remontaría el formulario completo, perdiendo el foco al teclear.
   */
  function renderPanel() {
    return (
      <form onSubmit={handleSave} className="space-y-3 max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Sin `required` nativo en Nombre a propósito (ver validateRoleForm): el globo
              del navegador se disparaba antes de que este formulario corriera. */}
          <div>
            <label className="text-xs font-medium text-gray-600">Nombre <span className={fieldErrors.name ? 'text-red-600' : ''}>*</span></label>
            <input
              className="input"
              disabled={!!editRole?.isSystem}
              value={editRole?.isSystem ? roleLabel(form.name) : form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {fieldErrors.name && <p className="text-red-600 text-xs mt-1">{fieldErrors.name}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Descripción</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            {fieldErrors.description && <p className="text-red-600 text-xs mt-1">{fieldErrors.description}</p>}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">
            Permisos <span className={fieldErrors.sections ? 'text-red-600' : ''}>*</span>
          </label>
          <div className="mt-1 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm min-w-[460px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Módulo</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">Ver</th>
                  {CRUD_COLUMNS.map((c) => (
                    <th key={c.action} className="text-center px-3 py-2 font-medium text-gray-600 w-20">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {SECTIONS.map((s) => {
                  const sectionChecked = form.sections.includes(s.code)
                  const allowedActions = !isManagementRole ? CRUD_SECTIONS[s.code] : null
                  return (
                    <tr key={s.code}>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.icon} {s.label}</td>
                      <td className="text-center px-3 py-2">
                        <input
                          type="checkbox"
                          checked={sectionChecked}
                          disabled={editRole?.isSystem && s.code === 'ROLES'}
                          onChange={() => toggleSection(s.code)}
                        />
                      </td>
                      {CRUD_COLUMNS.map((c) => {
                        if (!allowedActions?.includes(c.action)) {
                          return <td key={c.action} className="text-center px-3 py-2 text-gray-300">—</td>
                        }
                        return (
                          <td key={c.action} className="text-center px-3 py-2">
                            <input
                              type="checkbox"
                              checked={form.actionGrants.includes(`${s.code}:${c.action}`)}
                              disabled={!sectionChecked}
                              onChange={() => toggleActionGrant(s.code, c.action)}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {fieldErrors.sections && <p className="text-red-600 text-xs mt-1">{fieldErrors.sections}</p>}
          <p className="text-xs text-gray-400 mt-1">
            "Ver" controla si el módulo aparece en el menú. Agregar/Editar/Eliminar solo están disponibles para los
            módulos con ese nivel de detalle (Inventario, Ventas, Apartados) — sin marcarlos, el rol solo puede ver.
          </p>
        </div>

        {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={closePanel}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Roles y Permisos</h2>
        {/* El sistema queda fijo en 4 roles (SUPER_ADMIN, SUPERVISOR, ADMIN, CASHIER) —
            solo un SUPER_ADMIN puede crear roles adicionales (ver RoleController#create
            en el backend, que ya rechaza esto aunque alguien se salte este botón). */}
        {isSuperAdmin && (
          <button className="btn-primary" onClick={openNew}>
            {expandedId === 'new' ? 'Cancelar' : '+ Nuevo rol'}
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Nombre', 'Descripción', 'Secciones', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {expandedId === 'new' && (
              <>
                <tr className="bg-blue-50/40">
                  <td colSpan={4} className="px-4 py-3 font-medium text-gray-900">▾ Nuevo rol</td>
                </tr>
                <tr>
                  <td colSpan={4} className="bg-gray-50/60 px-4 py-4">{renderPanel()}</td>
                </tr>
              </>
            )}
            {roles.map((r) => (
              <Fragment key={r.id}>
                <tr
                  className={`hover:bg-gray-50 cursor-pointer ${expandedId === r.id ? 'bg-blue-50/40' : ''}`}
                  onClick={() => toggleEdit(r)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {expandedId === r.id ? '▾' : '▸'} {roleLabel(r.name)}
                    {r.isSystem && (
                      <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">sistema</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.description}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.sections?.length === SECTIONS.length ? 'Todas' : `${r.sections?.length ?? 0} de ${SECTIONS.length}`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="text-blue-600 hover:underline text-xs" onClick={(e) => { e.stopPropagation(); toggleEdit(r) }}>
                        {expandedId === r.id ? 'Cerrar' : 'Habilitar permisos'}
                      </button>
                      {!r.isSystem && (
                        <button className="text-red-500 hover:underline text-xs" onClick={(e) => { e.stopPropagation(); handleDelete(r) }}>Eliminar</button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === r.id && (
                  <tr>
                    <td colSpan={4} className="bg-gray-50/60 px-4 py-4">{renderPanel()}</td>
                  </tr>
                )}
              </Fragment>
            ))}
            {roles.length === 0 && expandedId !== 'new' && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Sin roles</td></tr>
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
    </div>
  )
}
