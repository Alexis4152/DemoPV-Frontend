import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../api/auth'
import { applyDefaultBrand } from '../utils/theme'
import logo from '../assets/logo.png'

/**
 * Pantalla pública "Olvidé mi contraseña": captura el correo del usuario y pide al
 * backend que envíe el link de recuperación. Igual que Login, no hay tienda conocida
 * todavía, así que siempre usa el azul Nexora fijo.
 *
 * El backend responde siempre el mismo mensaje genérico exista o no el correo (para no
 * revelar qué correos están registrados) — esta pantalla simplemente lo muestra tal cual,
 * sin distinguir ambos casos.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    applyDefaultBrand()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const res = await forgotPassword(email)
      setMessage(res.data.message ?? 'Si el correo está registrado, te enviamos un enlace para recuperar tu contraseña')
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo procesar la solicitud')
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
          <h1 className="text-2xl font-bold text-gray-900">Recuperar contraseña</h1>
          <p className="text-gray-500 text-sm mt-1">Te enviaremos un enlace a tu correo</p>
        </div>

        {message ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
              {message}
            </div>
            <Link to="/login" className="btn-primary w-full py-3 block text-center">Volver a iniciar sesión</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
              <input
                type="email"
                className="input"
                placeholder="admin@boutique.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>
            <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700">
              Volver a iniciar sesión
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
