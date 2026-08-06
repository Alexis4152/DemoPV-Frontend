import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTiendaInfo, updateTiendaInfo, uploadTiendaLogo, removeTiendaLogo } from '../api/tiendas'
import defaultLogo from '../assets/logo.png'

const FIELDS = [
  { key: 'name', label: 'Nombre de la tienda', required: true },
  { key: 'razonSocial', label: 'Razón social' },
  { key: 'rfc', label: 'RFC' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'paginaWeb', label: 'Página web' },
  { key: 'calle', label: 'Calle' },
  { key: 'colonia', label: 'Colonia' },
  { key: 'codigoPostal', label: 'Código postal' },
  { key: 'localidad', label: 'Localidad' },
  { key: 'estado', label: 'Estado' },
  { key: 'redesSociales', label: 'Redes sociales', textarea: true },
  { key: 'notasAdicionales', label: 'Otros datos', textarea: true },
]

export default function StoreInfo() {
  const { user, patchTienda } = useAuth()
  const tiendaId = user?.tienda?.id

  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tiendaId) return
    getTiendaInfo(tiendaId).then((r) => {
      const info = r.data.data
      setForm({
        name: info.tienda?.name || '',
        razonSocial: info.razonSocial || '',
        rfc: info.rfc || '',
        telefono: info.telefono || '',
        paginaWeb: info.paginaWeb || '',
        calle: info.calle || '',
        colonia: info.colonia || '',
        codigoPostal: info.codigoPostal || '',
        localidad: info.localidad || '',
        estado: info.estado || '',
        redesSociales: info.redesSociales || '',
        notasAdicionales: info.notasAdicionales || '',
      })
    }).finally(() => setLoading(false))
  }, [tiendaId])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await updateTiendaInfo(tiendaId, form)
      patchTienda({ name: form.name })
      setMessage('Datos guardados')
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron guardar los datos')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    setError('')
    setMessage('')
    try {
      const res = await uploadTiendaLogo(tiendaId, file)
      patchTienda({ logoPath: res.data.data.logoPath })
      setMessage('Logo actualizado')
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo subir el logo')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  async function handleRemoveLogo() {
    setUploadingLogo(true)
    setError('')
    setMessage('')
    try {
      await removeTiendaLogo(tiendaId)
      patchTienda({ logoPath: null })
      setMessage('Se eliminó el logo, ahora se usa el logo por default')
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar el logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  if (loading || !form) return <p className="text-gray-400 text-sm">Cargando...</p>

  const logoSrc = user?.tienda?.logoPath || defaultLogo

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Datos de la tienda</h1>
      <p className="text-gray-500 text-sm mb-6">
        Información fiscal y de contacto de <span className="font-medium">{user?.tienda?.name}</span>. Solo la puede
        editar el administrador de esta tienda.
      </p>

      <div className="card mb-6">
        <p className="text-sm font-medium text-gray-700 mb-3">Logo</p>
        <div className="flex items-center gap-4">
          <img src={logoSrc} alt="Logo de la tienda" className="w-20 h-20 rounded-full object-cover border border-gray-200" />
          <div className="flex flex-col gap-2">
            <label className="btn-secondary text-sm cursor-pointer inline-block">
              {uploadingLogo ? 'Subiendo...' : 'Subir logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoChange} disabled={uploadingLogo} />
            </label>
            {user?.tienda?.logoPath && (
              <button type="button" className="text-xs text-red-600 hover:underline text-left" onClick={handleRemoveLogo} disabled={uploadingLogo}>
                Quitar logo (usar el default)
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">PNG, JPG o WEBP, máximo 3 MB. Si no subes uno, se usa el logo de Nexora.</p>
      </div>

      <form onSubmit={handleSave} className="card space-y-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
            {f.textarea ? (
              <textarea
                className="input"
                rows={2}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            ) : (
              <input
                type="text"
                className="input"
                value={form[f.key]}
                required={f.required}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            )}
          </div>
        ))}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{message}</div>
        )}

        <button className="btn-primary" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar datos'}
        </button>
      </form>
    </div>
  )
}
