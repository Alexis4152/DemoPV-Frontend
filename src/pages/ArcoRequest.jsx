import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createArcoRequest } from '../api/arco'
import logo from '../assets/logo.png'

/**
 * Formulario público de solicitudes ARCO (Acceso, Rectificación, Cancelación, Oposición
 * sobre datos personales — Ley Federal de Protección de Datos Personales en Posesión de
 * los Particulares). No pide iniciar sesión para LLENARLO, pero el correo escrito debe
 * corresponder a una cuenta real del sistema (el backend lo valida al mandar — ver
 * `ArcoRequestService#create`); si no, rechaza con un mensaje claro. El seguimiento
 * después sí exige sesión real, desde "Mis solicitudes" (`MyArcoRequests.jsx`).
 *
 * A propósito vive FUERA del `Layout`/`PrivateRoute`, igual que `PublicApartar.jsx`: no
 * lleva sidebar ni exige sesión, y no depende de ninguna tienda (sin `:slug` en la ruta) —
 * la solicitud la atiende SUPER_ADMIN, nunca el admin de una tienda en particular (ver
 * `ArcoRequests.jsx`). Se enlaza desde `Login.jsx`, para que quede a la mano "antes de
 * entrar" a ninguna tienda.
 */
const TYPES = [
  ['ACCESS', 'Acceso', 'Quiero saber qué datos personales míos tienen y para qué los usan.'],
  ['RECTIFICATION', 'Rectificación', 'Mis datos están incompletos o tienen un error — quiero corregirlos.'],
  ['CANCELLATION', 'Cancelación', 'Quiero que eliminen mis datos personales.'],
  ['OPPOSITION', 'Oposición', 'No quiero que usen mis datos personales para algo en particular.'],
]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ArcoRequest() {
  const [form, setForm] = useState({ requesterName: '', requesterEmail: '', requesterPhone: '', type: '', details: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  function validate() {
    const errors = {}
    if (!form.requesterName.trim()) errors.requesterName = 'Tu nombre es obligatorio'
    if (!form.requesterEmail.trim()) errors.requesterEmail = 'Tu correo es obligatorio'
    else if (!EMAIL_RE.test(form.requesterEmail.trim())) errors.requesterEmail = 'Correo inválido'
    if (form.requesterPhone && form.requesterPhone.length !== 10) errors.requesterPhone = 'El teléfono debe tener 10 dígitos'
    if (!form.type) errors.type = 'Elige qué tipo de solicitud quieres hacer'
    return errors
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setError('')
    setLoading(true)
    try {
      await createArcoRequest({
        requesterName: form.requesterName.trim(),
        requesterEmail: form.requesterEmail.trim(),
        requesterPhone: form.requesterPhone.trim() || undefined,
        type: form.type,
        details: form.details.trim() || undefined,
      })
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar tu solicitud. Intenta de nuevo más tarde.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#03050c] via-[#050b18] to-[#0d1b3d] flex items-center justify-center p-4 relative overflow-hidden">
      <img
        src={logo} alt="" aria-hidden="true"
        className="pointer-events-none select-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-none opacity-[0.05]"
      />
      <div className="bg-white rounded-2xl shadow-2xl shadow-[#155dea]/30 w-full max-w-lg p-6 sm:p-8 relative z-10">
        <div className="text-center mb-6">
          <img src={logo} alt="Nexora Systems" className="w-20 h-20 rounded-full mx-auto mb-3 shadow-[0_0_24px_rgba(43,132,245,0.5)]" />
          <h1 className="text-2xl font-bold text-gray-900">Derechos ARCO</h1>
          <p className="text-gray-500 text-sm mt-1">
            Acceso, Rectificación, Cancelación u Oposición sobre tus datos personales.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4 py-4">
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-4">
              Tu solicitud fue enviada. Vamos a contactarte a <span className="font-medium">{form.requesterEmail}</span> en
              cuanto la revisemos. Para ver su seguimiento, inicia sesión con tu cuenta y entra a "Mis solicitudes ARCO".
            </div>
            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">← Volver al inicio de sesión</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tu nombre</label>
              <input
                type="text" className="input" value={form.requesterName}
                onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
              />
              {fieldErrors.requesterName && <p className="text-red-600 text-xs mt-1">{fieldErrors.requesterName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tu correo</label>
              <input
                type="text" className="input" placeholder="correo@ejemplo.com" value={form.requesterEmail}
                onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })}
              />
              <p className="text-xs text-gray-400 mt-1">
                Debe ser el correo con el que tienes cuenta en el sistema — es como validamos que de verdad eres tú.
              </p>
              {fieldErrors.requesterEmail && <p className="text-red-600 text-xs mt-1">{fieldErrors.requesterEmail}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono (opcional)</label>
              <input
                type="tel" className="input" inputMode="numeric" maxLength={10} value={form.requesterPhone}
                onChange={(e) => setForm({ ...form, requesterPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              />
              {fieldErrors.requesterPhone && <p className="text-red-600 text-xs mt-1">{fieldErrors.requesterPhone}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué quieres hacer?</label>
              <div className="space-y-2">
                {TYPES.map(([value, label, hint]) => (
                  <label
                    key={value}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      form.type === value ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio" name="type" value={value} className="mt-1"
                      checked={form.type === value}
                      onChange={() => setForm({ ...form, type: value })}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-800">{label}</span>
                      <span className="block text-xs text-gray-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {fieldErrors.type && <p className="text-red-600 text-xs mt-1">{fieldErrors.type}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuéntanos más (opcional)</label>
              <textarea
                className="input" rows={3} maxLength={2000} value={form.details}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
                placeholder="Ej. en qué tienda compraste, o qué dato específico quieres corregir"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
            )}

            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar solicitud'}
            </button>
            <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700">
              ← Volver al inicio de sesión
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
