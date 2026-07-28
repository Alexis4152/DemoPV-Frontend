import { useEffect, useState } from 'react'
import { getRoles, createRole, updateRole, deleteRole } from '../api/roles'
import { SECTIONS } from '../config/sections'

const emptyForm = { name: '', description: '', sections: [] }

export default function Roles() {
  const [roles, setRoles] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRole, setEditRole] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function load() {
    getRoles().then((r) => setRoles(r.data.data ?? []))
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditRole(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(r) {
    setEditRole(r)
    setForm({ name: r.name, description: r.description ?? '', sections: r.sections ?? [] })
    setError('')
    setShowModal(true)
  }

  function toggleSection(code) {
    if (editRole?.isSystem && code === 'ROLES') return // no se puede quitar a un rol del sistema
    setForm((f) => ({
      ...f,
      sections: f.sections.includes(code)
        ? f.sections.filter((c) => c !== code)
        : [...f.sections, code],
    }))
  }

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

  async function handleDelete(r) {
    if (!confirm(`¿Eliminar el rol "${r.name}"?`)) return
    try {
      await deleteRole(r.id)
      load()
    } catch (err) {
      alert(err.response?.data?.message ?? 'Error al eliminar')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Roles y Permisos</h2>
        <button className="btn-primary" onClick={openNew}>+ Nuevo rol</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
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

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
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
                <div className="mt-1 grid grid-cols-2 gap-2">
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
