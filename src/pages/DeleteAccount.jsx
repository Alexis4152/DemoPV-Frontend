import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createArcoRequest } from '../api/arco'
import logo from '../assets/logo.png'
import PublicFooter from '../components/PublicFooter'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * "Eliminar mi cuenta" (`/eliminar-cuenta`) — atajo directo a una solicitud ARCO de tipo
 * Cancelación, sin tener que pasar por el selector de 6 tipos de `ArcoRequest.jsx`. Bajo el
 * capó es exactamente la misma solicitud (mismo endpoint, mismo flujo de confirmación de
 * correo y atención por SUPER_ADMIN) — solo una puerta de entrada más corta y explícita
 * para quien ya sabe que quiere esto, igual que hace Citas con su página equivalente.
 */
export default function DeleteAccount() {
  const [form, setForm] = useState({ requesterName: '', requesterEmail: '', requesterPhone: '', details: '' })
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
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
    if (!acceptPrivacy) errors.acceptPrivacy = 'Debes aceptar el aviso de privacidad'
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
        type: 'CANCELLATION',
        details: form.details.trim() || undefined,
        representative: false,
        acceptPrivacyNotice: acceptPrivacy,
      })
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar tu solicitud. Intenta de nuevo más tarde.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#03050c] via-[#050b18] to-[#0d1b3d] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <img
        src={logo} alt="" aria-hidden="true"
        className="pointer-events-none select-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-none opacity-[0.05]"
      />
      <div className="bg-white rounded-2xl shadow-2xl shadow-[#155dea]/30 w-full max-w-lg p-6 sm:p-8 relative z-10">
        <div className="text-center mb-6">
          <img src={logo} alt="Nexora Systems" className="w-20 h-20 rounded-full mx-auto mb-3 shadow-[0_0_24px_rgba(43,132,245,0.5)]" />
          <h1 className="text-2xl font-bold text-gray-900">Eliminar mi cuenta</h1>
          <p className="text-gray-500 text-sm mt-1">
            Solicita que eliminemos tus datos personales del sistema (derecho de Cancelación).
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4 py-4">
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-4">
              Te mandamos un correo a <span className="font-medium">{form.requesterEmail}</span> para confirmar tu solicitud —
              ábrelo y entra al link para que empiece a correr el plazo de respuesta.
            </div>
            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">← Volver al inicio de sesión</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2.5">
              Si eres personal de una tienda, esto desactiva tu cuenta de acceso al sistema. Tus ventas o apartados ya
              registrados se conservan por obligación fiscal/contable; no se borran.
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tu nombre</label>
              <input className="input" value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} />
              {fieldErrors.requesterName && <p className="text-red-600 text-xs mt-1">{fieldErrors.requesterName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tu correo</label>
              <input className="input" placeholder="correo@ejemplo.com" value={form.requesterEmail} onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })} />
              <p className="text-xs text-gray-400 mt-1">Debe ser el correo con el que tienes cuenta en el sistema.</p>
              {fieldErrors.requesterEmail && <p className="text-red-600 text-xs mt-1">{fieldErrors.requesterEmail}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono (opcional)</label>
              <input className="input" inputMode="numeric" maxLength={10} value={form.requesterPhone} onChange={(e) => setForm({ ...form, requesterPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
              {fieldErrors.requesterPhone && <p className="text-red-600 text-xs mt-1">{fieldErrors.requesterPhone}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuéntanos más (opcional)</label>
              <textarea className="input" rows={3} maxLength={2000} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={acceptPrivacy} onChange={(e) => setAcceptPrivacy(e.target.checked)} />
              <span>Acepto el <Link to="/aviso-de-privacidad" target="_blank" className="text-purple-600 hover:underline">aviso de privacidad</Link></span>
            </label>
            {fieldErrors.acceptPrivacy && <p className="text-red-600 text-xs -mt-2">{fieldErrors.acceptPrivacy}</p>}

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

            <button type="submit" className="w-full py-3 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50" disabled={loading}>
              {loading ? 'Enviando...' : 'Solicitar eliminación de mi cuenta'}
            </button>
            <p className="text-center text-xs text-gray-400">
              ¿Buscas otro tipo de solicitud? <Link to="/arco" className="text-purple-600 hover:underline">Ve al formulario completo de derechos ARCO</Link>
            </p>
            <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700">← Volver al inicio de sesión</Link>
          </form>
        )}
      </div>

      <PublicFooter dark />
    </div>
  )
}
