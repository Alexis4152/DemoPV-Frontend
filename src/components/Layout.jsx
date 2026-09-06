import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SECTIONS } from '../config/sections'
import { getApartadosPendingCount } from '../api/apartados'
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
  // Drawer del sidebar en mobile/tablet (< lg) — independiente de `collapsed`, que solo
  // aplica al modo solo-íconos del sidebar fijo de escritorio.
  const [mobileOpen, setMobileOpen] = useState(false)

  // Badge de apartados PENDING (por revisar) junto al link "Apartados" del sidebar — se
  // revisa cada 60s mientras haya sesión con esa sección habilitada; no hay websockets en
  // este proyecto, así que un poll ligero es la forma de "notificar" sin nueva infra.
  const [pendingApartados, setPendingApartados] = useState(0)
  const canSeeApartados = hasSection('APARTADOS')
  useEffect(() => {
    if (!canSeeApartados) return
    function poll() {
      getApartadosPendingCount().then((r) => setPendingApartados(r.data.data ?? 0)).catch(() => {})
    }
    poll()
    const id = setInterval(poll, 60_000)
    return () => clearInterval(id)
  }, [canSeeApartados])

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

  /**
   * Contenido interno del sidebar (logo, nav, pie con rol/logout), compartido entre el
   * `<aside>` fijo de escritorio (`lg:` en adelante, respeta `collapsed`) y el drawer
   * off-canvas de mobile/tablet (siempre expandido). `onNavigate` se dispara al hacer
   * click en un link — en el drawer cierra el overlay; en el sidebar fijo no hace nada.
   */
  function renderSidebarBody(isCollapsed, onNavigate) {
    return (
      <>
        <div className="p-6 border-b border-[var(--brand-sidebar-border)] overflow-hidden">
          {isCollapsed ? (
            <img src={sidebarLogo} alt={user?.tienda?.name || 'Nexora Systems'} className="w-10 h-10 rounded-full mx-auto object-cover shadow-[0_0_12px_rgba(43,132,245,0.5)]" />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <img src={sidebarLogo} alt={user?.tienda?.name || 'Nexora Systems'} className="w-11 h-11 rounded-full shrink-0 object-cover shadow-[0_0_12px_rgba(43,132,245,0.5)]" />
                <h1 className="text-base font-bold text-white leading-tight">{user?.tienda?.name || 'Punto de Venta Demo'}</h1>
              </div>
              <p className="text-xs text-purple-300/70 mt-2 whitespace-nowrap">{user?.name}</p>
            </>
          )}
        </div>

        <nav className="sidebar-scroll flex-1 p-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {links.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} title={isCollapsed ? n.label : undefined} className={navLinkClass(isCollapsed)} onClick={onNavigate}>
              <span className="relative">
                {n.icon}
                {n.code === 'APARTADOS' && pendingApartados > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] leading-none rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5">
                    {pendingApartados > 9 ? '9+' : pendingApartados}
                  </span>
                )}
              </span>
              {!isCollapsed && (
                <span className="whitespace-nowrap flex items-center gap-1.5">
                  {n.label}
                  {n.code === 'APARTADOS' && pendingApartados > 0 && (
                    <span className="bg-red-500 text-white text-[10px] leading-none rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                      {pendingApartados > 99 ? '99+' : pendingApartados}
                    </span>
                  )}
                </span>
              )}
            </NavLink>
          ))}

          {configItems.length > 0 && (
            isCollapsed ? (
              // Sin espacio para agrupar en modo icono: se muestran sueltos, igual que el resto.
              configItems.map((n) => (
                <NavLink key={n.to} to={n.to} title={n.label} className={navLinkClass(true)} onClick={onNavigate}>
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
                      <NavLink key={n.to} to={n.to} className={navLinkClass(false)} onClick={onNavigate}>
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
          {!isCollapsed && (
            <div className="mb-2 px-3 py-2 text-xs text-slate-400">
              <span className="inline-block bg-purple-600/20 text-purple-300 rounded px-2 py-0.5 font-medium">
                {user?.role}
              </span>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={isCollapsed ? 'Cerrar sesión' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors ${
              isCollapsed ? 'justify-center' : ''
            }`}
          >
            <span>🚪</span> {!isCollapsed && 'Cerrar sesión'}
          </button>
        </div>
      </>
    )
  }

  return (
    // bg-purple-50/40: mismo tinte de marca (--brand-50, ver utils/theme.js) que ya se usa
    // en la vitrina pública de apartados (PublicApartar.jsx) — antes era gris liso
    // (bg-gray-50) sin relación con el color que la tienda elige en "Apariencia".
    <div className="flex h-screen bg-purple-50/40">
      {/* Sidebar fijo — solo visible desde `lg:` en adelante */}
      <aside className={`hidden lg:flex ${collapsed ? 'w-20' : 'w-64'} bg-[var(--brand-sidebar)] border-r border-[var(--brand-sidebar-border)] flex-col transition-all duration-200 relative shrink-0`}>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          className="absolute -right-3 top-8 w-6 h-6 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-xs text-gray-500 hover:text-purple-700 hover:border-purple-300 z-10"
        >
          {collapsed ? '›' : '‹'}
        </button>
        {renderSidebarBody(collapsed, undefined)}
      </aside>

      {/* Drawer off-canvas — solo antes de `lg:` */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-[var(--brand-sidebar)] flex flex-col h-full">
            {renderSidebarBody(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 bg-white border-b border-gray-200 px-4 py-3 shrink-0">
          <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 text-gray-600" aria-label="Abrir menú">☰</button>
          <img src={sidebarLogo} alt={user?.tienda?.name || 'Nexora Systems'} className="w-8 h-8 rounded-full object-cover" />
          <span className="font-semibold text-gray-800 truncate">{user?.tienda?.name || 'Punto de Venta Demo'}</span>
        </header>
        <main className="flex-1 overflow-y-auto flex flex-col">
          <div className="p-4 sm:p-6 lg:p-8 flex-1">{children}</div>
          <footer className="px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-gray-400 border-t border-gray-100">
            © {new Date().getFullYear()} Nexora Systems. Todos los derechos reservados.
          </footer>
        </main>
      </div>
    </div>
  )
}
