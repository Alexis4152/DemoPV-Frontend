import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateTiendaTheme } from '../api/tiendas'
import { generateRamp, isValidHex, NEXORA_BLUE } from '../utils/theme'

export default function Appearance() {
  const { user, patchTienda } = useAuth()
  const [color, setColor] = useState(user?.tienda?.primaryColor || NEXORA_BLUE)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const previewRamp = isValidHex(color) ? generateRamp(color) : null

  async function handleSave() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await updateTiendaTheme(user.tienda.id, color)
      patchTienda({ primaryColor: color })
      setMessage('Color guardado')
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el color')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Apariencia</h1>
      <p className="text-gray-500 text-sm mb-6">
        Elige el color de marca de <span className="font-medium">{user?.tienda?.name}</span>. Se usa en botones,
        menú activo y el fondo del sidebar de todos los usuarios de tu tienda.
      </p>

      <div className="card space-y-6">
        <div className="flex items-center gap-4">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-16 h-16 rounded-lg border border-gray-200 cursor-pointer"
          />
          <div>
            <p className="text-sm font-medium text-gray-700">Color de tu tienda</p>
            <p className="text-xs text-gray-500 font-mono">{color}</p>
          </div>
        </div>

        {previewRamp && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Vista previa de la paleta generada</p>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              {Object.entries(previewRamp).map(([key, rgb]) => (
                <div key={key} className="flex-1 h-10" style={{ backgroundColor: `rgb(${rgb.split(' ').join(',')})` }} title={key} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{message}</div>
        )}

        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar color'}
        </button>
      </div>
    </div>
  )
}
