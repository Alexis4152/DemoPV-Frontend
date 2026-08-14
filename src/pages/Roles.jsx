import { useEffect, useState } from 'react'
import { getRoles, createRole, updateRole, deleteRole } from '../api/roles'
import { SECTIONS } from '../config/sections'
import { useNotify } from '../context/NotifyContext'

const emptyForm = { name: '', description: '', sections: [] }

/**
 * Pantalla de "Roles y Permisos": CRUD de los roles disponibles para la tienda del
 * usuario (o de todas si es `SUPER_ADMIN`). Cada rol define qué `AppSection` (módulos:
 * Dashboard, POS, Inventario, Ventas, Cortes de Caja, Reportes, Usuarios, Roles) puede ver
 * y usar un usuario con ese rol — es la base del RBAC de la app. Sirve a los roles con la
 * sección `ROLES` habilitada (típicamente `ADMIN`/`SUPER_ADMIN`).
 *
 * Los roles marcados como `isSystem` (roles predefinidos del sistema, ej. el rol admin
 * base) tienen restricciones especiales: no se pueden eliminar (el botón "Eliminar" no
 * se muestra), su nombre no es editable, y no se les puede quitar la sección `ROLES`
 * (para evitar dejar la tienda sin ningún usuario que pueda administrar roles).
 */
export default function Roles() {
  const { notify, confirmDialog } = useNotify()
  const [roles, setRoles] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRole, setEditRole] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Recarga el listado completo de roles (tras crear/editar/eliminar, o al montar).
  function load() {
    getRoles().then((r) => setRoles(r.data.data ?? []))
  }

  useEffect(() => { load() }, [])

  // Abre el modal en blanco para crear un rol nuevo.
  function openNew() {
    setEditRole(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  // Abre el modal precargado con los datos del rol a editar.
  function openEdit(r) {
    setEditRole(r)
    setForm({ name: r.name, description: r.description ?? '', sections: r.sections ?? [] })
    setError('')
    setShowModal(true)
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

  // Crea o actualiza el rol según haya o no un `editRole` en edición, y recarga el listado.
  async function handleSave(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (editRole) await updateRole(editRole.id, form)
      else await createRole(form)
      setShowModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar')
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
      load()
    } catch (err) {
      notify(err.response?.data?.message ?? 'Error al eliminar')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Roles y Permisos</h2>
        <button className="btn-primary" onClick={openNew}>+ Nuevo rol</button>
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
            {roles.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {r.name}
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
                    <button className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(r)}>Editar</button>
                    {!r.isSystem && (
                      <button className="text-red-500 hover:underline text-xs" onClick={() => handleDelete(r)}>Eliminar</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {roles.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Sin roles</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editRole ? 'Editar rol' : 'Nuevo rol'}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div><label className="text-xs font-medium text-gray-600">Nombre *</label>
                <input
                  className="input"
                  required
                  disabled={!!editRole?.isSystem}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                /></div>
              <div><label className="text-xs font-medium text-gray-600">Descripción</label>
                <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div>
                <label className="text-xs font-medium text-gray-600">Secciones visibles *</label>
                <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {SECTIONS.map((s) => (
                    <label key={s.code} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.sections.includes(s.code)}
                        disabled={editRole?.isSystem && s.code === 'ROLES'}
                        onChange={() => toggleSection(s.code)}
                      />
                      <span>{s.icon} {s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
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
