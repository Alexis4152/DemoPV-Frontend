import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createArcoRequest } from '../api/arco'
import { ARCO_TYPES } from '../utils/arcoTypes'
import logo from '../assets/logo.png'

/**
 * Formulario público de solicitudes ARCO (Acceso, Rectificación, Cancelación, Oposición,
 * Revocación, Limitación sobre datos personales — Ley Federal de Protección de Datos
 * Personales en Posesión de los Particulares). No pide iniciar sesión para LLENARLO, pero el
 * correo escrito debe corresponder a una cuenta real del sistema (el backend lo valida al
 * mandar — ver `ArcoRequestService#createPublic`); si no, rechaza con un mensaje claro.
 *
 * A diferencia del flujo anterior (quedaba pendiente de inmediato), ahora la solicitud queda
 * {@code PENDING_EMAIL} hasta que el solicitante confirma su correo por el link que se le
 * manda — así nadie puede levantar una solicitud a nombre de un correo que no controla, aun
 * sabiendo que esa cuenta existe. El seguimiento después vive en `ArcoTracking.jsx` (desde
 * ese mismo link) o, si tiene sesión, en "Mis solicitudes" (`MyArcoRequests.jsx`).
 *
 * A propósito vive FUERA del `Layout`/`PrivateRoute`, igual que `PublicApartar.jsx`: no
 * lleva sidebar ni exige sesión, y no depende de ninguna tienda (sin `:slug` en la ruta) —
 * la solicitud la atiende SUPER_ADMIN, nunca el admin de una tienda. Se enlaza desde
 * `Login.jsx`.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ArcoRequest() {
  const [form, setForm] = useState({
    requesterName: '', requesterEmail: '', requesterPhone: '', type: '', details: '',
    representative: false, representativeName: '',
  })
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
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
    if (form.representative && !form.representativeName.trim()) errors.representativeName = 'Escribe el nombre de quien representas'
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
        type: form.type,
        details: form.details.trim() || undefined,
        representative: form.representative,
        representativeName: form.representative ? form.representativeName.trim() : undefined,
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
    <div className="min-h-screen bg-gradient-to-br from-[#03050c] via-[#050b18] to-[#0d1b3d] flex items-center justify-center p-4 relative overflow-hidden">
      <img
        src={logo} alt="" aria-hidden="true"
        className="pointer-events-none select-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-none opacity-[0.05]"
      />
      <div className="bg-white rounded-2xl shadow-2xl shadow-[#155dea]/30 w-full max-w-lg p-6 sm:p-8 relative z-10 max-h-[92vh] overflow-y-auto">
        <div className="text-center mb-6">
          <img src={logo} alt="Nexora Systems" className="w-20 h-20 rounded-full mx-auto mb-3 shadow-[0_0_24px_rgba(43,132,245,0.5)]" />
          <h1 className="text-2xl font-bold text-gray-900">Derechos ARCO</h1>
          <p className="text-gray-500 text-sm mt-1">
            Acceso, Rectificación, Cancelación, Oposición, Revocación o Limitación sobre tus datos personales.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4 py-4">
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-4">
              Te mandamos un correo a <span className="font-medium">{form.requesterEmail}</span> para confirmar tu solicitud —
              ábrelo y entra al link para que empiece a correr el plazo de respuesta. Desde ahí también podrás darle
              seguimiento.
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
                Te mandaremos un link para confirmarlo.
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
                {ARCO_TYPES.map(([value, label, hint]) => (
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

            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox" className="mt-0.5" checked={form.representative}
                  onChange={(e) => setForm({ ...form, representative: e.target.checked })}
                />
                Estoy haciendo esta solicitud a nombre de alguien más (soy su representante)
              </label>
              {form.representative && (
                <div>
                  <input
                    type="text" className="input" placeholder="Nombre de la persona a la que representas"
                    value={form.representativeName}
                    onChange={(e) => setForm({ ...form, representativeName: e.target.value })}
                  />
                  {fieldErrors.representativeName && <p className="text-red-600 text-xs mt-1">{fieldErrors.representativeName}</p>}
                </div>
              )}
            </div>

            <div>
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox" className="mt-0.5" checked={acceptPrivacy}
                  onChange={(e) => setAcceptPrivacy(e.target.checked)}
                />
                <span>
                  Acepto el{' '}
                  <button type="button" className="text-purple-600 hover:underline" onClick={() => setShowPrivacy((v) => !v)}>
                    aviso de privacidad
                  </button>
                </span>
              </label>
              {fieldErrors.acceptPrivacy && <p className="text-red-600 text-xs mt-1">{fieldErrors.acceptPrivacy}</p>}
              {showPrivacy && (
                <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-xs text-gray-600 space-y-1.5">
                  <p>
                    Los datos personales que nos compartas en este formulario (nombre, correo, teléfono y el detalle que
                    escribas) se usan únicamente para identificarte, dar seguimiento a tu solicitud y responderte por
                    correo — nunca para fines distintos ni se comparten con terceros.
                  </p>
                  <p>
                    Como titular, tienes derecho a Acceder, Rectificar, Cancelar u Oponerte al tratamiento de tus datos
                    (derechos ARCO), así como a Revocar tu consentimiento o Limitar su uso — que es justo lo que este
                    formulario te permite ejercer.
                  </p>
                </div>
              )}
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
