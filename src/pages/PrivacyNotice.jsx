import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'
import PublicFooter from '../components/PublicFooter'

/**
 * Aviso de privacidad (`/aviso-de-privacidad`) — texto legal completo, conforme a la Ley
 * Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
 * Página de PLATAFORMA, no de una tienda: el mismo aviso aplica a cualquier tienda que use
 * el sistema. Enlazada desde `PublicFooter.jsx` y desde la casilla de aceptación de
 * `ArcoRequest.jsx`.
 */
export default function PrivacyNotice() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#03050c] via-[#050b18] to-[#0d1b3d] flex flex-col items-center p-4 relative overflow-hidden">
      <img
        src={logo} alt="" aria-hidden="true"
        className="pointer-events-none select-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-none opacity-[0.05]"
      />
      <div className="bg-white rounded-2xl shadow-2xl shadow-[#155dea]/30 w-full max-w-2xl p-6 sm:p-10 relative z-10 my-8">
        <div className="text-center mb-8">
          <img src={logo} alt="Nexora Systems" className="w-16 h-16 rounded-full mx-auto mb-3 shadow-[0_0_24px_rgba(43,132,245,0.5)]" />
          <h1 className="text-2xl font-bold text-gray-900">Aviso de privacidad</h1>
          <p className="text-gray-500 text-sm mt-1">Última actualización: {new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}</p>
        </div>

        <div className="prose prose-sm max-w-none text-gray-700 space-y-5">
          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Responsable del tratamiento</h2>
            <p>
              Nexora Systems opera la plataforma de punto de venta y apartados en línea que usan las tiendas dadas de
              alta en este sistema. Cada tienda es responsable de los datos de sus clientes y su personal que captura
              en su operación diaria; Nexora Systems aloja y procesa esos datos como parte de la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Datos personales que tratamos</h2>
            <p>Según cómo interactúes con el sistema, podemos tratar:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Datos de contacto: nombre, correo electrónico y teléfono.</li>
              <li>Historial de compras o apartados que hayas hecho en una tienda (productos, montos, fechas).</li>
              <li>Si eres personal de una tienda: datos de tu cuenta de usuario y tu actividad en el sistema (p. ej.
                qué ventas o cortes registraste), incluyendo la fecha en que aceptaste este aviso y los términos
                de uso.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Datos personales sensibles</h2>
            <p>
              No recabamos datos personales sensibles (origen étnico o racial, estado de salud, creencias religiosas,
              afiliación sindical o política, preferencia sexual, u otros de esa naturaleza conforme a la LFPDPPP).
              Si en algún momento una tienda solicitara un dato de este tipo por un motivo excepcional, deberá
              informártelo y pedir tu consentimiento expreso por separado, de forma distinta a este aviso.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Finalidades del tratamiento</h2>
            <p>Usamos tus datos personales para:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Procesar tus compras y apartados, y darte seguimiento (ej. avisarte cuando tu apartado esté listo).</li>
              <li>Enviarte tu ticket de compra y, si aplica, notificaciones relacionadas con tu pedido.</li>
              <li>Si tienes cuenta de personal: administrar tu acceso al sistema y tu actividad dentro de él.</li>
              <li>Atender las solicitudes que nos hagas sobre tus propios datos (derechos ARCO).</li>
              <li>Cumplir con obligaciones fiscales y contables aplicables a los registros de venta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Derechos ARCO</h2>
            <p>
              Como titular de tus datos personales, tienes derecho a Acceder a ellos, Rectificarlos si están
              desactualizados o son inexactos, Cancelarlos cuando consideres que no se requieren para alguna de las
              finalidades señaladas, y Oponerte al tratamiento de los mismos para fines específicos — así como a
              Revocar el consentimiento que en su caso nos hayas otorgado y a Limitar el uso o divulgación de tus
              datos. Puedes ejercer cualquiera de estos derechos desde{' '}
              <Link to="/arco" className="text-purple-600 hover:underline">nuestro formulario de solicitudes ARCO</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Conservación y seguridad</h2>
            <p>
              Conservamos tus datos personales mientras exista una relación vigente con la tienda correspondiente, y
              después de eso, durante los plazos que exijan las obligaciones fiscales y contables aplicables a los
              registros de venta. Aplicamos medidas de seguridad administrativas, técnicas y físicas razonables para
              proteger tus datos contra daño, pérdida, alteración, acceso o tratamiento no autorizado.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Encargados y proveedores</h2>
            <p>
              Para operar la plataforma usamos proveedores que tratan datos personales por nuestra cuenta (encargados),
              como servicios de hospedaje/infraestructura y de envío de correo electrónico (para tu ticket,
              confirmaciones de apartado y respuestas a tus solicitudes ARCO). Estos proveedores solo tratan tus
              datos para prestarnos ese servicio, bajo las mismas obligaciones de confidencialidad y seguridad que
              nosotros.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Transferencias</h2>
            <p>
              No vendemos ni compartimos tus datos personales con terceros ajenos a la operación de la plataforma
              (más allá de los encargados señalados arriba), salvo que una autoridad competente lo requiera
              conforme a la ley.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Cookies y tecnologías similares</h2>
            <p>
              El sistema usa almacenamiento local del navegador (no cookies de rastreo publicitario) únicamente
              para mantener tu sesión iniciada y recordar preferencias de la interfaz. No usamos esta información
              para elaborar perfiles de tu comportamiento ni se la compartimos a terceros con fines publicitarios.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Menores de edad</h2>
            <p>
              La vitrina de apartados y el sistema no están dirigidos a menores de edad. Si eres el responsable de un
              menor y consideras que nos ha proporcionado datos personales sin tu consentimiento, contáctanos a
              través del formulario de derechos ARCO para que los eliminemos.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Cómo ejercer tus derechos o presentar dudas</h2>
            <p>
              Además del{' '}
              <Link to="/arco" className="text-purple-600 hover:underline">formulario de solicitudes ARCO</Link>,
              si eres personal de una tienda puedes consultar y dar seguimiento a tus propias solicitudes desde "Mis
              solicitudes" dentro del sistema una vez que inicies sesión. Cualquier duda sobre este aviso puede
              hacerse por el mismo medio.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Consentimiento</h2>
            <p>
              Al usar la vitrina de apartados, dar de alta tus datos para un apartado, o iniciar sesión como
              personal de una tienda, consientes el tratamiento de tus datos personales conforme a lo descrito en
              este aviso de privacidad.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Cambios a este aviso</h2>
            <p>
              Podemos actualizar este aviso de privacidad. Cualquier cambio relevante se reflejará en esta misma
              página, con su fecha de última actualización.
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
