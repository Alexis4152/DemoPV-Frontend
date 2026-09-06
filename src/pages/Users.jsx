import { useEffect, useState } from 'react'
import { getUsers, createUser, updateUser, deleteUser } from '../api/users'
import { getRoles } from '../api/roles'
import { useNotify } from '../context/NotifyContext'

const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const emptyForm = { name: '', email: '', password: '', roleId: '' }
const EMPTY_FILTERS = { from: '', to: '', name: '', email: '', roleId: '', isActive: '' }
const PAGE_SIZES = [10, 20, 50, 100]

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
 * Paginación server-side (mismo patrón que Sales/CashCuts/Inventory): `page`/`size` viajan
 * como query params y el backend responde `{content, page, size, totalElements, totalPages}`.
 * `roles`, en cambio, sigue viniendo del catálogo completo sin paginar (`getRoles`), porque
 * también alimenta el selector de rol del filtro y del formulario de alta/edición — paginarlo
 * ahí ocultaría roles del selector.
 */
export default function Users() {
  const { confirmDialog } = useNotify()
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [roles, setRoles] = useState([])
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  /**
   * Recarga el listado de usuarios aplicando los filtros ya confirmados (`appliedFilters`,
   * no los que el usuario esté todavía editando en `filters`) y el catálogo de roles para
   * el selector del filtro y del formulario. El rango de fecha se expande a inicio/fin de
   * día (`T00:00:00` / `T23:59:59`) para que el filtro "Desde/Hasta" incluya el día completo
   * y no solo el instante exacto de medianoche.
   */
  function load() {
    const params = {
      page,
      size,
      name: appliedFilters.name || undefined,
      email: appliedFilters.email || undefined,
      roleId: appliedFilters.roleId || undefined,
      isActive: appliedFilters.isActive || undefined,
      from: appliedFilters.from ? `${appliedFilters.from}T00:00:00` : undefined,
      to: appliedFilters.to ? `${appliedFilters.to}T23:59:59` : undefined,
    }
    getUsers(params).then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
    getRoles().then((r) => setRoles(r.data.data ?? []))
  }

  // Recarga cada vez que cambian la página, el tamaño de página, o los filtros aplicados
  // (al confirmar o limpiar el formulario de filtros, no en cada tecleo — por eso existe la
  // distinción filters vs appliedFilters).
  useEffect(() => { load() }, [page, size, appliedFilters])

  // Cierra con ESC el modal de usuario (mismo efecto que "Cancelar"), descartando lo capturado.
  useEffect(() => {
    if (!showModal) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setShowModal(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showModal])

  // Confirma los filtros en edición como los filtros activos (disparando la recarga) y
  // vuelve a la primera página, para no quedar "atorado" en una página que ya no existe.
  function handleApplyFilters(e) {
    e.preventDefault()
    setPage(0)
    setAppliedFilters(filters)
  }

  // Limpia tanto el formulario de filtros como los filtros aplicados (vuelve a listar todo).
  function handleClearFilters() {
    setFilters(EMPTY_FILTERS)
    setAppliedFilters(EMPTY_FILTERS)
    setPage(0)
  }

  // Abre el modal en blanco para crear un usuario nuevo, preseleccionando el primer rol
  // disponible como valor por default del select.
  function openNew() {
    setEditUser(null)
    setForm({ ...emptyForm, roleId: roles[0]?.id ?? '' })
    setError('')
    setShowModal(true)
  }

  // Abre el modal precargado con los datos del usuario a editar. La contraseña se deja
  // vacía a propósito: en edición, un campo vacío significa "no cambiar la contraseña".
  function openEdit(u) {
    setEditUser(u)
    setForm({ name: u.name, email: u.email, password: '', roleId: u.role?.id ?? '' })
    setError('')
    setShowModal(true)
  }

  // Crea o actualiza el usuario según haya o no un `editUser` en edición (previa
  // confirmación explícita, para evitar altas/ediciones accidentales), y recarga el
  // listado (respetando los filtros aplicados).
  async function handleSave(e) {
    e.preventDefault()
    const confirmMsg = editUser
      ? `¿Deseas guardar los cambios de "${form.name}"?`
      : `¿Deseas crear el usuario "${form.name}"?`
    if (!(await confirmDialog(confirmMsg, { confirmText: editUser ? 'Guardar cambios' : 'Crear', danger: false }))) return
    setLoading(true)
    setError('')
    try {
      if (editUser) await updateUser(editUser.id, form)
      else await createUser(form)
      setShowModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar')
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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Usuarios</h2>
        <button className="btn-primary" onClick={openNew}>+ Nuevo usuario</button>
      </div>

      <form onSubmit={handleApplyFilters} className="card mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Desde</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Hasta</label>
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Nombre</label>
          <input type="text" className="input" placeholder="Nombre" value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
          <input type="text" className="input" placeholder="Email" value={filters.email} onChange={(e) => setFilters({ ...filters, email: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Rol</label>
          <select className="input" value={filters.roleId} onChange={(e) => setFilters({ ...filters, roleId: e.target.value })}>
            <option value="">Todos</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
          <select className="input" value={filters.isActive} onChange={(e) => setFilters({ ...filters, isActive: e.target.value })}>
            <option value="">Todos</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1">Filtrar</button>
          <button type="button" className="btn-secondary" onClick={handleClearFilters}>Limpiar</button>
        </div>
      </form>

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
                  <div className="flex gap-2">
                    <button className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(u)}>Editar</button>
                    {u.isActive && (
                      <button className="text-red-500 hover:underline text-xs" onClick={() => handleDelete(u)}>Desact.</button>
                    )}
                  </div>
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
            <form onSubmit={handleSave} className="space-y-3">
              <div><label className="text-xs font-medium text-gray-600">Nombre *</label>
                <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-gray-600">Email *</label>
                <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-gray-600">Contraseña {editUser ? '(dejar vacío para no cambiar)' : '*'}</label>
                <input className="input" type="password" required={!editUser} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-gray-600">Rol *</label>
                <select className="input" required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                  <option value="" disabled>Selecciona un rol</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select></div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
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
