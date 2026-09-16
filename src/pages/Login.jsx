import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { applyDefaultBrand } from '../utils/theme'
import logo from '../assets/logo.png'

/**
 * Pantalla de login. Es la puerta de entrada a la app: no hay sesión ni tienda todavía,
 * por lo que siempre se muestra con el color de marca azul fijo "Nexora" (nunca el color
 * personalizado de ninguna tienda, ya que aún no se sabe a qué tienda pertenece el usuario).
 *
 * Sirve a todos los roles por igual (`SUPER_ADMIN`, `ADMIN`, `CASHIER`, `SELLER`): tras
 * autenticarse, `AuthContext` decide a dónde redirigir y qué color de marca aplicar según
 * el usuario y su tienda.
 */
export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  // Errores de validación por campo, solo al dar clic en "Iniciar sesión" — mismo patrón
  // que Usuarios/Roles/Categorías (no en vivo, ver el análisis de todos los módulos).
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  // El login siempre es azul Nexora fijo, sin importar el color que haya quedado
  // aplicado de una sesión anterior con una tienda con color propio.
  useEffect(() => {
    applyDefaultBrand()
  }, [])

  /**
   * Envía las credenciales al backend vía `AuthContext.login`. Si la autenticación
   * es exitosa, `AuthContext` guarda el usuario/token y aplica el color de marca que
   * corresponda (Nexora o el de la tienda del usuario); aquí solo se navega a la raíz.
   */
  async function handleSubmit(e) {
    e.preventDefault()
    // Validación local ANTES de llamar al backend — sin `type="email"`/`required` nativos
    // en los inputs (ver el JSX de abajo), así que esto es lo único que impide mandar
    // cualquiera de los dos campos vacío. Sin validar formato ni mostrar alerta aparte:
    // solo que estén llenos.
    const errors = {}
    if (!form.email.trim()) errors.email = 'El correo es obligatorio'
    if (!form.password) errors.password = 'La contraseña es obligatoria'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('')
      return
    }
    setFieldErrors({})
    setError('')
    setLoading(true)
    try {
      // Se manda recortado (mismo valor que se validó arriba) para que un espacio de más
      // al final no lo rechace el @Email del backend con su mensaje genérico.
      await login(form.email.trim(), form.password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || 'Error al iniciar sesión')
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
          <h1 className="text-2xl font-bold text-gray-900">Punto de Venta Demo</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de Punto de Venta</p>
        </div>

        {/* Sin type="email" ni required nativos a propósito (ver handleSubmit): el globo
            del navegador se disparaba antes de que este formulario alcanzara a correr. */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
            <input
              type="text"
              className="input"
              placeholder="admin@boutique.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <p className="text-xs text-gray-400 mt-1">Ej. cliente@gmail.com, cliente@outlook.com</p>
            {fieldErrors.email && <p className="text-red-600 text-xs mt-1">{fieldErrors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {fieldErrors.password && <p className="text-red-600 text-xs mt-1">{fieldErrors.password}</p>}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
          <Link to="/forgot-password" className="block text-center text-sm text-gray-500 hover:text-gray-700">
            ¿Olvidaste tu contraseña?
          </Link>
        </form>
      </div>
    </div>
  )
}
