import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
 * 4. Si es SUPER_ADMIN y todavía no eligió con cuál tienda actuar (`user.tienda` sigue
 *    `null` — ver `AuthContext#selectTienda`), redirige a `/select-tienda`, con la misma
 *    excepción de no crear un loop en esa propia ruta. Va DESPUÉS del chequeo anterior:
 *    primero resolver identidad (cambiar contraseña), luego contexto (elegir tienda).
 * 5. Si se pasa `section` (código de `AppSection`) y el usuario no la tiene habilitada
 *    (`hasSection`), redirige a `/`.
 * 6. Si se pasa `adminOnly` y el usuario no es `ADMIN`, redirige a `/`. Se usa para
 *    pantallas de configuración de tienda (Apariencia, Datos de la tienda) que no son una
 *    `AppSection` del catálogo RBAC sino un nivel de acceso aparte reservado al
 *    administrador de esa tienda. `isAdmin` (ver `AuthContext`) ya incluye a SUPER_ADMIN
 *    actuando sobre una tienda — cuenta igual que su ADMIN, sin caso especial aquí.
 *
 * @param {{ children: import('react').ReactNode, section?: string, adminOnly?: boolean }} props
 */
export default function PrivateRoute({ children, section, adminOnly }) {
  const { user, loading, hasSection, isAdmin, isSuperAdmin } = useAuth()
  const location = useLocation()
  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  if (isSuperAdmin && !user.tienda && location.pathname !== '/select-tienda') {
    return <Navigate to="/select-tienda" replace />
  }
  if (section && !hasSection(section)) return <Navigate to="/" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  return children
}
