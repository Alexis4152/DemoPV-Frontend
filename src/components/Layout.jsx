import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SECTIONS } from '../config/sections'
import defaultLogo from '../assets/logo.png'

/**
 * Fábrica de la función `className` que consume `NavLink` de react-router para
 * resaltar el link activo del sidebar, adaptando el estilo según si el sidebar
 * está colapsado (modo solo íconos, centrado) o expandido.
 *
 * @param {boolean} collapsed - Si el sidebar está en modo colapsado.
 * @returns {(navData: { isActive: boolean }) => string} Función que `NavLink` invoca para obtener las clases CSS.
 */
const navLinkClass = (collapsed) => ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    collapsed ? 'justify-center' : ''
  } ${
    isActive
      ? 'bg-purple-600/20 text-purple-300'
      : 'text-slate-400 hover:bg-white/5 hover:text-white'
  }`

// Rutas agrupadas bajo el submenú colapsable "Configuración" del sidebar.
const CONFIG_ROUTES = ['/roles', '/appearance', '/store-info']

/**
 * Shell visual de toda la app autenticada: arma el sidebar de navegación (logo de
 * la tienda, links según las `AppSection` habilitadas del usuario, submenú
 * "Configuración") y envuelve el contenido de la ruta actual (`children`) junto
 * con el pie de página.
 *
 * El menú principal se arma filtrando `SECTIONS` por las secciones que el usuario
 * tiene habilitadas (excluyendo `ROLES`, que se agrupa aparte). El submenú
 * "Configuración" agrupa Roles y Permisos (si tiene la sección `ROLES`) y, solo si
 * `isAdmin`, Apariencia y Datos de la tienda. El estado de colapsado del sidebar y
 * de expandido de "Configuración" persiste en `localStorage` entre sesiones.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export default function Layout({ children }) {
  const { user, logout, hasSection, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('pos_sidebar_collapsed') === '1')
  const [configOpen, setConfigOpen] = useState(
    () => localStorage.getItem('pos_config_menu_open') !== '0' || CONFIG_ROUTES.includes(location.pathname)
  )

  /** Cierra la sesión del usuario actual y lo redirige a la pantalla de login. */
  function handleLogout() {
    logout()
    navigate('/login')
  }

  /**
   * Alterna el sidebar entre expandido y colapsado (modo solo íconos), persistiendo
   * la preferencia en `localStorage` (`pos_sidebar_collapsed`) para futuras sesiones.
   */
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem('pos_sidebar_collapsed', next ? '1' : '0')
      return next
    })
  }

  /**
   * Alterna el submenú "Configuración" (Roles, Apariencia, Datos de la tienda)
   * entre expandido y colapsado, persistiendo la preferencia en `localStorage`
   * (`pos_config_menu_open`) para futuras sesiones.
   */
  function toggleConfig() {
    setConfigOpen((c) => {
      const next = !c
      localStorage.setItem('pos_config_menu_open', next ? '1' : '0')
      return next
    })
  }

  const links = SECTIONS.filter((s) => hasSection(s.code) && s.code !== 'ROLES')

  const canSeeRoles = hasSection('ROLES')
  const configItems = [
    canSeeRoles && { to: '/roles', icon: '🔑', label: 'Roles y Permisos' },
    isAdmin && { to: '/appearance', icon: '🎨', label: 'Apariencia' },
    isAdmin && { to: '/store-info', icon: '🏬', label: 'Datos de la tienda' },
  ].filter(Boolean)
  const configActive = CONFIG_ROUTES.includes(location.pathname)
  const sidebarLogo = user?.tienda?.logoPath || defaultLogo

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-20' : 'w-64'} bg-[var(--brand-sidebar)] border-r border-[var(--brand-sidebar-border)] flex flex-col transition-all duration-200 relative`}>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          className="absolute -right-3 top-8 w-6 h-6 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-xs text-gray-500 hover:text-purple-700 hover:border-purple-300 z-10"
        >
          {collapsed ? '›' : '‹'}
        </button>

        <div className="p-6 border-b border-[var(--brand-sidebar-border)] overflow-hidden">
          {collapsed ? (
            <img src={sidebarLogo} alt={user?.tienda?.name || 'Nexora Systems'} className="w-10 h-10 rounded-full mx-auto object-cover shadow-[0_0_12px_rgba(43,132,245,0.5)]" />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <img src={sidebarLogo} alt={user?.tienda?.name || 'Nexora Systems'} className="w-11 h-11 rounded-full shrink-0 object-cover shadow-[0_0_12px_rgba(43,132,245,0.5)]" />
                <h1 className="text-base font-bold text-white leading-tight">Punto de Venta Demo</h1>
              </div>
              <p className="text-xs text-purple-300/70 mt-2 whitespace-nowrap">{user?.name}</p>
            </>
          )}
        </div>

        <nav className="sidebar-scroll flex-1 p-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {links.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} title={collapsed ? n.label : undefined} className={navLinkClass(collapsed)}>
              <span>{n.icon}</span>
              {!collapsed && <span className="whitespace-nowrap">{n.label}</span>}
            </NavLink>
          ))}

          {configItems.length > 0 && (
            collapsed ? (
              // Sin espacio para agrupar en modo icono: se muestran sueltos, igual que el resto.
              configItems.map((n) => (
                <NavLink key={n.to} to={n.to} title={n.label} className={navLinkClass(true)}>
                  <span>{n.icon}</span>
                </NavLink>
              ))
            ) : (
              <div>
                <button
                  onClick={toggleConfig}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    configActive ? 'text-purple-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span>⚙️</span>
                  <span className="whitespace-nowrap flex-1 text-left">Configuración</span>
                  <span className={`text-xs transition-transform ${configOpen ? 'rotate-90' : ''}`}>›</span>
                </button>
                {configOpen && (
                  <div className="mt-1 ml-4 pl-3 border-l border-[var(--brand-sidebar-border)] space-y-1">
                    {configItems.map((n) => (
                      <NavLink key={n.to} to={n.to} className={navLinkClass(false)}>
                        <span>{n.icon}</span>
                        <span className="whitespace-nowrap">{n.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </nav>

        <div className="p-4 border-t border-[var(--brand-sidebar-border)]">
          {!collapsed && (
            <div className="mb-2 px-3 py-2 text-xs text-slate-400">
              <span className="inline-block bg-purple-600/20 text-purple-300 rounded px-2 py-0.5 font-medium">
                {user?.role}
              </span>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <span>🚪</span> {!collapsed && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className="p-8 flex-1">{children}</div>
        <footer className="px-8 py-4 text-center text-xs text-gray-400 border-t border-gray-100">
          © {new Date().getFullYear()} Nexora Systems. Todos los derechos reservados.
        </footer>
      </main>
    </div>
  )
}
