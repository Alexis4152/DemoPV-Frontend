import { Link } from 'react-router-dom'

/**
 * Pie de página legal/de privacidad, compartido entre las pantallas públicas sin sesión
 * (`PublicApartar.jsx`, la vitrina de apartados de cada tienda; `Login.jsx`) — mismo patrón
 * que usa Citas en sus páginas públicas (`/c/{consultorio}`): un renglón de links legales
 * seguido del copyright. Las 4 páginas a las que apunta son de PLATAFORMA (no cambian según
 * la tienda), salvo el nombre que se muestra en el copyright.
 *
 * @param {{ tiendaName?: string, dark?: boolean }} props `dark` para fondos oscuros
 *   (Login.jsx, ArcoRequest.jsx) — mismos links, solo cambia el color del texto.
 */
export default function PublicFooter({ tiendaName, dark = false }) {
  const linkClass = dark
    ? 'text-gray-400 hover:text-gray-200 transition-colors'
    : 'text-gray-500 hover:text-gray-700 transition-colors'
  const textClass = dark ? 'text-gray-500' : 'text-gray-400'

  return (
    <footer className={`px-4 py-6 text-center text-xs ${textClass}`}>
      <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 mb-2">
        <Link to="/terminos" className={linkClass}>Términos y condiciones</Link>
        <Link to="/privacidad" className={linkClass}>Cómo cuidamos tu privacidad</Link>
        <Link to="/aviso-de-privacidad" className={linkClass}>Aviso de privacidad</Link>
        <Link to="/eliminar-cuenta" className={linkClass}>Eliminar mi cuenta</Link>
      </nav>
      <p>
        Copyright © {new Date().getFullYear()} {tiendaName || 'Nexora Systems'}. Todos los derechos reservados. Hecho con Nexora Systems.
      </p>
    </footer>
  )
}
