import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Guard de rutas: controla si `children` se renderiza o si el usuario es
 * redirigido, según el estado de sesión y (opcionalmente) sus permisos.
 *
 * Orden de chequeos:
 * 1. Si `loading` (la sesión aún se está restaurando desde `localStorage`), muestra un spinner de texto.
 * 2. Si no hay `user` en sesión, redirige a `/login`.
 * 3. Si se pasa `section` (código de `AppSection`) y el usuario no la tiene habilitada
 *    (`hasSection`), redirige a `/`.
 * 4. Si se pasa `adminOnly` y el usuario no es `ADMIN`, redirige a `/`. Se usa para
 *    pantallas de configuración de tienda (Apariencia, Datos de la tienda) que no
 *    son una `AppSection` del catálogo RBAC sino un nivel de acceso aparte reservado
 *    al administrador de esa tienda. Nota: este guard no distingue `SUPER_ADMIN` de
 *    `ADMIN` — solo compara contra `ADMIN`.
 *
 * @param {{ children: import('react').ReactNode, section?: string, adminOnly?: boolean }} props
 */
export default function PrivateRoute({ children, section, adminOnly }) {
  const { user, loading, hasSection, isAdmin } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (section && !hasSection(section)) return <Navigate to="/" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  return children
}
