import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SECTIONS } from '../config/sections'

export default function Layout({ children }) {
  const { user, logout, hasSection } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('pos_sidebar_collapsed') === '1')

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem('pos_sidebar_collapsed', next ? '1' : '0')
      return next
    })
  }

  const links = SECTIONS.filter((s) => hasSection(s.code))

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-200 relative`}>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          className="absolute -right-3 top-8 w-6 h-6 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-xs text-gray-500 hover:text-purple-700 hover:border-purple-300 z-10"
        >
          {collapsed ? '›' : '‹'}
        </button>

        <div className="p-6 border-b border-gray-100 overflow-hidden">
          {collapsed ? (
            <h1 className="text-xl font-bold text-purple-700 text-center">PV</h1>
          ) : (
            <>
              <h1 className="text-lg font-bold text-purple-700 leading-tight">Punto de Venta Demo</h1>
              <p className="text-xs text-gray-500 mt-1 whitespace-nowrap">{user?.name}</p>
            </>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {links.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-purple-50 text-purple-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <span>{n.icon}</span>
              {!collapsed && <span className="whitespace-nowrap">{n.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          {!collapsed && (
            <div className="mb-2 px-3 py-2 text-xs text-gray-500">
              <span className="inline-block bg-purple-100 text-purple-700 rounded px-2 py-0.5 font-medium">
                {user?.role}
              </span>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <span>🚪</span> {!collapsed && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}
