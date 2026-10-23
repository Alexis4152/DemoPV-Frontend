import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Pantallas de PLATAFORMA (no de una tienda en particular): se puede entrar directo, sin
// elegir tienda primero — ver el chequeo 4 de abajo. SUPER_ADMIN_ONLY son las mismas rutas
// que llevan `superAdminOnly` en App.jsx (Layout.jsx también las agrupa aparte, fuera del
// contexto de "tienda actuante"): "Correo del sistema" y "Solicitudes ARCO". ANY_ROLE es
// "Mis solicitudes" — abierta a cualquier rol (incluido SUPERVISOR, que igual que
// SUPER_ADMIN parte con `user.tienda` en null hasta elegir una), así que su exención no se
// acota a `isSuperAdmin` como la otra lista.
const SUPER_ADMIN_ONLY_PLATFORM_ROUTES = ['/mail-config', '/arco-requests']
const ANY_ROLE_PLATFORM_ROUTES = ['/my-arco-requests']

/**
 * Guard de rutas: controla si `children` se renderiza o si el usuario es
 * redirigido, según el estado de sesión y (opcionalmente) sus permisos.
 *
 * Orden de chequeos:
 * 1. Si `loading` (la sesión aún se está restaurando desde `localStorage`), muestra un spinner de texto.
 * 2. Si no hay `user` en sesión, redirige a `/login`.
 * 3. Si `user.mustChangePassword` (un admin lo dio de alta con contraseña temporal, o le
 *    reseteó la suya, y todavía no la cambia — ver `ChangePasswordRequired.jsx`), redirige
 *    a `/change-password` sin importar qué otra cosa pidiera la ruta; se exceptúa esa
 *    misma ruta para no crear un loop de redirects.
 * 3.5. Si `user.mustAcceptLegalTerms` (todavía no acepta los Términos y condiciones y/o el
 *    Aviso de privacidad vigentes — ver `AcceptLegalTerms.jsx`), redirige a
 *    `/accept-legal-terms`, con la misma excepción de no loopear esa ruta. Va DESPUÉS del
 *    cambio de contraseña (primero resolver que pueda entrar con una contraseña propia).
 * 4. Si es SUPER_ADMIN o SUPERVISOR y todavía no eligió con cuál tienda actuar
 *    (`user.tienda` sigue `null` — ver `AuthContext#selectTienda`), redirige a
 *    `/select-tienda`, con la misma excepción de no crear un loop en esa propia ruta. Va
 *    DESPUÉS del chequeo anterior: primero resolver identidad (cambiar contraseña), luego
 *    contexto (elegir tienda) — por eso también exceptúa `mustChangePassword`: sin esto,
 *    un SUPERVISOR nuevo (`mustChangePassword=true` y `tienda=null` a la vez, ver
 *    `UserService#create`) quedaba en un loop infinito entre `/change-password` y
 *    `/select-tienda`, cada chequeo mandando al otro de vuelta. También se exceptúan las
 *    rutas de plataforma (sin tienda): {@link SUPER_ADMIN_ONLY_PLATFORM_ROUTES} solo para
 *    SUPER_ADMIN (nunca SUPERVISOR), y {@link ANY_ROLE_PLATFORM_ROUTES} para cualquiera de
 *    los dos — ninguna de esas pantallas es de ninguna tienda, así que obligar a elegir una
 *    primero no tiene sentido: el backend ya maneja sin problema que `user.tienda` siga
 *    `null` ahí (ver `api/axios.js`, que simplemente omite el header `X-Acting-Tienda-Id`
 *    cuando no hay tienda elegida). Si el usuario después navega a algo sí ligado a una
 *    tienda, este mismo chequeo lo manda a `/select-tienda` en ese momento, normal.
 * 5. Si se pasa `section` (código de `AppSection`) y el usuario no la tiene habilitada
 *    (`hasSection`), redirige a `/`.
 * 6. Si se pasa `adminOnly` y el usuario no es `ADMIN`, redirige a `/`. Se usa para
 *    pantallas de configuración de tienda (Apariencia, Datos de la tienda) que no son una
 *    `AppSection` del catálogo RBAC sino un nivel de acceso aparte reservado al
 *    administrador de esa tienda. `isAdmin` (ver `AuthContext`) ya incluye a SUPER_ADMIN/
 *    SUPERVISOR actuando sobre una tienda — cuentan igual que su ADMIN, sin caso especial aquí.
 * 7. Si se pasa `superAdminOnly` y el usuario no es `SUPER_ADMIN`, redirige a `/`. A
 *    diferencia de `adminOnly`, aquí SUPERVISOR NO cuenta: se usa para infraestructura de
 *    la plataforma entera (ej. la cuenta SMTP con la que sale todo correo del sistema),
 *    no algo por-tienda que un Supervisor administre.
 *
 * @param {{ children: import('react').ReactNode, section?: string, adminOnly?: boolean, superAdminOnly?: boolean }} props
 */
export default function PrivateRoute({ children, section, adminOnly, superAdminOnly }) {
  const { user, loading, hasSection, isAdmin, isSuperAdmin, isPlatformActor } = useAuth()
  const location = useLocation()
  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  if (user.mustAcceptLegalTerms && location.pathname !== '/accept-legal-terms') {
    return <Navigate to="/accept-legal-terms" replace />
  }
  const onExemptPlatformRoute =
    (isSuperAdmin && SUPER_ADMIN_ONLY_PLATFORM_ROUTES.includes(location.pathname)) ||
    ANY_ROLE_PLATFORM_ROUTES.includes(location.pathname)
  if (isPlatformActor && !user.tienda && !user.mustChangePassword
      && location.pathname !== '/select-tienda' && !onExemptPlatformRoute) {
    return <Navigate to="/select-tienda" replace />
  }
  if (section && !hasSection(section)) return <Navigate to="/" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  if (superAdminOnly && !isSuperAdmin) return <Navigate to="/" replace />
  return children
}
