import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'
import PublicFooter from '../components/PublicFooter'

/**
 * "Cómo cuidamos tu privacidad" (`/privacidad`) — página pública explicativa, en lenguaje
 * sencillo, que reúne los accesos a todo lo relacionado con privacidad: ejercer tus
 * derechos ARCO, leer el aviso de privacidad completo, o eliminar tu cuenta directamente.
 * Mismo rol que la página equivalente de Citas (`PrivacyHub.jsx`): el punto de entrada
 * principal para alguien sin sesión que llegó aquí desde el pie de página.
 */
export default function PrivacyHub() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#03050c] via-[#050b18] to-[#0d1b3d] flex flex-col items-center p-4 relative overflow-hidden">
      <img
        src={logo} alt="" aria-hidden="true"
        className="pointer-events-none select-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-none opacity-[0.05]"
      />
      <div className="bg-white rounded-2xl shadow-2xl shadow-[#155dea]/30 w-full max-w-2xl p-6 sm:p-10 relative z-10 my-8">
        <div className="text-center mb-8">
          <img src={logo} alt="Nexora Systems" className="w-16 h-16 rounded-full mx-auto mb-3 shadow-[0_0_24px_rgba(43,132,245,0.5)]" />
          <h1 className="text-2xl font-bold text-gray-900">Cómo cuidamos tu privacidad</h1>
          <p className="text-gray-500 text-sm mt-2 max-w-md mx-auto">
            Tus datos personales son tuyos. Aquí te explicamos qué puedes hacer con ellos y cómo pedírnoslo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/arco"
            className="block rounded-xl border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50/40 transition-colors p-5"
          >
            <p className="text-2xl mb-2">🛡️</p>
            <p className="font-semibold text-gray-900 mb-1">Ejerce tus derechos</p>
            <p className="text-sm text-gray-500">
              Pide saber qué datos tenemos de ti, corregirlos, cancelarlos, oponerte a un uso, revocar un
              consentimiento o limitar su uso.
            </p>
            <p className="text-sm text-purple-600 font-medium mt-2">Hacer una solicitud →</p>
          </Link>

          <Link
            to="/eliminar-cuenta"
            className="block rounded-xl border-2 border-gray-200 hover:border-red-400 hover:bg-red-50/40 transition-colors p-5"
          >
            <p className="text-2xl mb-2">🗑️</p>
            <p className="font-semibold text-gray-900 mb-1">Eliminar tu información</p>
            <p className="text-sm text-gray-500">
              Si ya no quieres que conservemos tus datos, puedes pedir que se elimine tu cuenta directamente.
            </p>
            <p className="text-sm text-red-600 font-medium mt-2">Eliminar mi cuenta →</p>
          </Link>

          <Link
            to="/aviso-de-privacidad"
            className="block rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 transition-colors p-5"
          >
            <p className="text-2xl mb-2">📄</p>
            <p className="font-semibold text-gray-900 mb-1">Aviso de privacidad</p>
            <p className="text-sm text-gray-500">
              Lee con detalle qué datos tratamos, para qué los usamos y cuánto tiempo los conservamos.
            </p>
            <p className="text-sm text-blue-600 font-medium mt-2">Leer el aviso completo →</p>
          </Link>

          <Link
            to="/terminos"
            className="block rounded-xl border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-colors p-5"
          >
            <p className="text-2xl mb-2">📋</p>
            <p className="font-semibold text-gray-900 mb-1">Términos y condiciones</p>
            <p className="text-sm text-gray-500">Reglas generales de uso de la vitrina de apartados y el sistema.</p>
            <p className="text-sm text-gray-600 font-medium mt-2">Ver términos →</p>
          </Link>
        </div>

        <div className="text-center mt-8">
          <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">← Volver al inicio de sesión</Link>
        </div>
      </div>

      <PublicFooter dark />
    </div>
  )
}
