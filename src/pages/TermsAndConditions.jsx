import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'
import PublicFooter from '../components/PublicFooter'

/**
 * Términos y condiciones (`/terminos`) — reglas generales de uso de la vitrina pública de
 * apartados y del sistema en general. Página de PLATAFORMA, no de una tienda. Enlazada
 * desde `PublicFooter.jsx`.
 */
export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#03050c] via-[#050b18] to-[#0d1b3d] flex flex-col items-center p-4 relative overflow-hidden">
      <img
        src={logo} alt="" aria-hidden="true"
        className="pointer-events-none select-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-none opacity-[0.05]"
      />
      <div className="bg-white rounded-2xl shadow-2xl shadow-[#155dea]/30 w-full max-w-2xl p-6 sm:p-10 relative z-10 my-8">
        <div className="text-center mb-8">
          <img src={logo} alt="Nexora Systems" className="w-16 h-16 rounded-full mx-auto mb-3 shadow-[0_0_24px_rgba(43,132,245,0.5)]" />
          <h1 className="text-2xl font-bold text-gray-900">Términos y condiciones</h1>
          <p className="text-gray-500 text-sm mt-1">Última actualización: {new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}</p>
        </div>

        <div className="prose prose-sm max-w-none text-gray-700 space-y-5">
          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Aceptación de estos términos</h2>
            <p>
              Al usar la vitrina de apartados, iniciar sesión en el sistema, o enviarnos cualquier formulario de este
              sitio (apartado, solicitud ARCO, etc.), aceptas estos términos y condiciones en su totalidad. Si no
              estás de acuerdo con alguno de ellos, no debes usar el sistema ni la vitrina.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Sobre la vitrina de apartados</h2>
            <p>
              Cada tienda que usa este sistema puede habilitar una vitrina pública donde puedes ver su catálogo y
              solicitar apartar productos. Solicitar un apartado NO es una compra ni una reservación garantizada: la
              tienda revisa cada solicitud y decide si la confirma, según disponibilidad real al momento de atenderla.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Precios y disponibilidad</h2>
            <p>
              Los precios, descuentos y existencias que ves en la vitrina los define y actualiza cada tienda por su
              cuenta. Pueden cambiar sin previo aviso. Si un producto deja de estar disponible entre que lo solicitas
              y que la tienda lo revisa, te lo harán saber.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Tu información</h2>
            <p>
              Para solicitar un apartado nos compartes tu nombre, teléfono y, opcionalmente, tu correo — los usamos
              únicamente para dar seguimiento a tu solicitud y contactarte sobre ella. Consulta nuestro{' '}
              <Link to="/aviso-de-privacidad" className="text-purple-600 hover:underline">aviso de privacidad</Link>{' '}
              para más detalle, y nuestro{' '}
              <Link to="/arco" className="text-purple-600 hover:underline">formulario de derechos ARCO</Link>{' '}
              si quieres ejercer algún derecho sobre tus datos.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Cancelaciones</h2>
            <p>
              Puedes cancelar tu propio apartado en cualquier momento mientras siga pendiente o activo, desde la
              misma vitrina ("Consultar apartado"), con tu folio y teléfono.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Cuentas de personal de una tienda</h2>
            <p>
              Si tienes una cuenta de acceso al sistema (cajero, vendedor, administrador, etc.), eres responsable de
              mantener tu contraseña en secreto y de toda actividad realizada con tu cuenta. Debes avisar a tu
              administrador de inmediato si sospechas que alguien más tiene acceso a ella. Al primer inicio de sesión
              se te pedirá aceptar estos términos y el aviso de privacidad, y en su caso elegir una contraseña propia
              distinta a la temporal que se te haya asignado.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Uso permitido</h2>
            <p>
              Te comprometes a usar la vitrina y el sistema de forma lícita: no intentar vulnerar su seguridad,
              acceder a cuentas o datos que no te pertenecen, automatizar solicitudes de forma abusiva, ni usar la
              información obtenida de la vitrina para fines distintos a solicitar o dar seguimiento a tus propios
              apartados.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Propiedad intelectual</h2>
            <p>
              El software, diseño, marca y contenidos propios de la plataforma (no el catálogo ni la información que
              cada tienda carga del suyo) son propiedad de Nexora Systems o de sus licenciantes. Nada de estos
              términos te otorga licencia alguna sobre ellos más allá de usar la vitrina como se describe aquí.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Disponibilidad del servicio y limitación de responsabilidad</h2>
            <p>
              Hacemos un esfuerzo razonable para que el sistema esté disponible, pero no garantizamos que esté libre
              de interrupciones o errores en todo momento. El servicio se ofrece "tal cual"; en la medida permitida
              por la ley, Nexora Systems no es responsable de daños indirectos derivados del uso de la vitrina o el
              sistema, ni de decisiones comerciales (precios, disponibilidad, confirmación de apartados) que
              correspondan únicamente a cada tienda.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Legislación aplicable</h2>
            <p>
              Estos términos se rigen por las leyes aplicables en México, incluyendo la Ley Federal de Protección de
              Datos Personales en Posesión de los Particulares (LFPDPPP) en lo que corresponda al tratamiento de tus
              datos personales.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Cambios a estos términos</h2>
            <p>
              Podemos actualizar estos términos. Cualquier cambio relevante se reflejará en esta misma página, con
              su fecha de última actualización.
            </p>
          </section>
        </div>

        <div className="text-center mt-8">
          <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">← Volver al inicio de sesión</Link>
        </div>
      </div>

      <PublicFooter dark />
    </div>
  )
}
