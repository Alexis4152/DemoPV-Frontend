import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTiendas } from '../api/tiendas'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'

/**
 * Selector de tienda para SUPER_ADMIN — un usuario de plataforma sin tienda propia que,
 * para poder usar el resto de la app (Inventario, POS, Ventas, Usuarios, Configuración...),
 * necesita elegir sobre cuál tienda va a actuar en ese momento (ver
 * `AuthContext#selectTienda`, que llena `user.tienda` con la elegida, y `PrivateRoute.jsx`,
 * que manda aquí a cualquier SUPER_ADMIN sin ninguna todavía elegida).
 *
 * También sirve como pantalla de "Cambiar tienda" (link del sidebar, `Layout.jsx`) — en
 * ese caso `user.tienda` ya viene con algo, se resalta como actual, y aparece un botón
 * "Seguir aquí" para volver sin cambiar nada.
 */
export default function SelectTienda() {
  const { user, selectTienda, logout } = useAuth()
  const navigate = useNavigate()
  const [tiendas, setTiendas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getTiendas()
      .then((r) => setTiendas(r.data.data ?? []))
      .catch(() => setError('No se pudo cargar la lista de tiendas'))
      .finally(() => setLoading(false))
  }, [])

  function handleSelect(tienda) {
    selectTienda(tienda)
    navigate('/')
  }

  const hasCurrentTienda = !!user?.tienda

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#03050c] via-[#050b18] to-[#0d1b3d] flex items-center justify-center p-4 relative overflow-hidden">
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-none opacity-[0.05]"
      />
      <div className="bg-white rounded-2xl shadow-2xl shadow-[#155dea]/30 w-full max-w-2xl p-6 sm:p-8 relative z-10 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <img src={logo} alt="Nexora Systems" className="w-20 h-20 rounded-full mx-auto mb-3 shadow-[0_0_24px_rgba(43,132,245,0.5)]" />
          <h1 className="text-2xl font-bold text-gray-900">¿Con cuál tienda quieres trabajar?</h1>
          <p className="text-gray-500 text-sm mt-1">
            Como SUPER_ADMIN puedes administrar cualquier tienda — elige una para entrar a su Inventario,
            Ventas, Usuarios y Configuración, exactamente como su administrador. Puedes cambiarla después.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
        )}

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">Cargando tiendas...</p>
        ) : tiendas.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">Todavía no hay tiendas registradas.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tiendas.map((t) => {
              const isCurrent = user?.tienda?.id === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t)}
                  className={`flex items-center gap-3 text-left p-4 rounded-xl border-2 transition-colors ${
                    isCurrent ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                  }`}
                >
                  {t.logoPath ? (
                    <img src={t.logoPath} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg shrink-0">🏬</span>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{t.name}</p>
                    <p className="text-xs text-gray-400">
                      {isCurrent ? 'Actuando aquí ahora' : t.isActive ? 'Activa' : 'Inactiva'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-6">
          {hasCurrentTienda && (
            <button type="button" className="btn-secondary" onClick={() => navigate('/')}>Seguir aquí</button>
          )}
          <button type="button" className="text-sm text-gray-400 hover:text-gray-600 px-2" onClick={logout}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  )
}
