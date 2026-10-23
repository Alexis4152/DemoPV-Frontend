import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { acceptLegalTerms } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import logo from '../assets/logo.png'

/**
 * Pantalla obligatoria "Acepta los términos" — la ve un usuario YA AUTENTICADO que todavía
 * no acepta los Términos y condiciones y/o confirma haber leído el Aviso de privacidad
 * (`user.mustAcceptLegalTerms`, ver `PrivateRoute.jsx`, que rebota aquí cualquier otra ruta
 * mientras el flag siga prendido). Solo aparece en el primer login de una cuenta — los
 * usuarios que ya existían antes de este flujo quedan migrados como ya aceptados (ver
 * `LegalAcceptanceBackfillMigration` en el backend).
 *
 * Vive fuera del `Layout` (sin sidebar) a propósito, mismo tratamiento visual que
 * `ChangePasswordRequired.jsx`/`Login.jsx`.
 */
export default function AcceptLegalTerms() {
  const { user, logout, clearMustAcceptLegalTerms } = useAuth()
  const { notify } = useNotify()
  const navigate = useNavigate()
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!acceptTerms || !acceptPrivacy) {
      setFieldError('Debes marcar ambas casillas para continuar')
      notify('Debes marcar ambas casillas para continuar', 'error')
      return
    }
    setFieldError('')
    setError('')
    setLoading(true)
    try {
      await acceptLegalTerms()
      clearMustAcceptLegalTerms()
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo registrar tu aceptación')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#03050c] via-[#050b18] to-[#0d1b3d] flex items-center justify-center p-4 relative overflow-hidden">
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-none opacity-[0.05]"
      />
      <div className="bg-white rounded-2xl shadow-2xl shadow-[#155dea]/30 w-full max-w-md p-6 sm:p-8 relative z-10">
        <div className="text-center mb-8">
          <img src={logo} alt="Nexora Systems" className="w-24 h-24 rounded-full mx-auto mb-3 shadow-[0_0_24px_rgba(43,132,245,0.5)]" />
          <h1 className="text-2xl font-bold text-gray-900">Antes de continuar</h1>
          <p className="text-gray-500 text-sm mt-1">
            {user?.name ? `Hola ${user.name}, necesitamos` : 'Necesitamos'} que confirmes lo siguiente para seguir usando el sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
            />
            <span>
              He leído y acepto los{' '}
              <Link to="/terminos" target="_blank" className="text-purple-600 hover:underline">
                Términos y condiciones
              </Link>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={acceptPrivacy}
              onChange={(e) => setAcceptPrivacy(e.target.checked)}
            />
            <span>
              He leído el{' '}
              <Link to="/aviso-de-privacidad" target="_blank" className="text-purple-600 hover:underline">
                Aviso de privacidad
              </Link>
            </span>
          </label>

          {fieldError && <p className="text-red-600 text-xs">{fieldError}</p>}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
            {loading ? 'Guardando...' : 'Aceptar y continuar'}
          </button>
          <button type="button" className="w-full text-sm text-gray-400 hover:text-gray-600" onClick={logout}>
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  )
}
