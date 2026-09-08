import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTiendas, createTienda, updateTiendaName, uploadTiendaLogo, removeTiendaLogo } from '../api/tiendas'
import { useAuth } from '../context/AuthContext'
import { resolveMediaUrl } from '../utils/media'
import logo from '../assets/logo.png'
import useEscapeClose from '../hooks/useEscapeClose'

/**
 * Selector de tienda para SUPER_ADMIN y SUPERVISOR — los dos roles "de plataforma" sin
 * tienda propia que, para poder usar el resto de la app (Inventario, POS, Ventas,
 * Usuarios, Configuración...), necesitan elegir sobre cuál tienda van a actuar en ese
 * momento (ver `AuthContext#selectTienda`, que llena `user.tienda` con la elegida, y
 * `PrivateRoute.jsx`, que manda aquí a cualquiera de los dos sin ninguna todavía elegida).
 * La lista que trae `getTiendas()` ya viene acotada por el backend: todas para SUPER_ADMIN,
 * solo las asignadas para SUPERVISOR — esta pantalla no distingue entre ellos para nada.
 *
 * También sirve como pantalla de "Cambiar tienda" (link del sidebar, `Layout.jsx`) — en
 * ese caso `user.tienda` ya viene con algo, se resalta como actual, y aparece un botón
 * "Seguir aquí" para volver sin cambiar nada.
 *
 * Además, esta es la única pantalla donde se puede dar de alta una tienda nueva ("+ Nueva
 * tienda") o editar lo básico (nombre y logo) de cualquiera existente sin tener que
 * "entrar" a ella primero — usa `canManageTienda` del backend, que le permite a SUPER_ADMIN
 * administrar cualquier tienda por id, y a SUPERVISOR las suyas, sin importar cuál tenga
 * elegida como "actuante". Los datos fiscales/de contacto completos siguen viviendo en
 * `StoreInfo.jsx`, reservada a la tienda sobre la que se está actuando.
 */
export default function SelectTienda() {
  const { user, selectTienda, patchTienda, logout } = useAuth()
  const navigate = useNavigate()
  const [tiendas, setTiendas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null) // tienda siendo editada, o null

  function load() {
    setLoading(true)
    getTiendas()
      .then((r) => setTiendas(r.data.data ?? []))
      .catch(() => setError('No se pudo cargar la lista de tiendas'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  function handleSelect(tienda) {
    selectTienda(tienda)
    navigate('/')
  }

  /** Refleja en la lista una tienda recién creada o editada, sin recargar todo del backend. */
  function upsertLocal(tienda) {
    setTiendas((list) => {
      const exists = list.some((t) => t.id === tienda.id)
      const next = exists ? list.map((t) => (t.id === tienda.id ? tienda : t)) : [...list, tienda]
      return next.sort((a, b) => a.name.localeCompare(b.name))
    })
    // Si la tienda editada es la que el SUPER_ADMIN tiene elegida ahorita, refleja el
    // cambio de inmediato en el sidebar (nombre/logo) sin que tenga que re-elegirla.
    if (user?.tienda?.id === tienda.id) {
      patchTienda({ name: tienda.name, logoPath: tienda.logoPath })
    }
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tiendas.map((t) => {
              const isCurrent = user?.tienda?.id === t.id
              return (
                <div
                  key={t.id}
                  className={`relative group flex items-center gap-3 text-left p-4 rounded-xl border-2 transition-colors ${
                    isCurrent ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                  }`}
                >
                  <button type="button" onClick={() => handleSelect(t)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                    {t.logoPath ? (
                      <img src={resolveMediaUrl(t.logoPath)} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
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
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    title="Editar nombre y logo"
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-purple-600 hover:bg-white"
                  >
                    ✏️
                  </button>
                </div>
              )
            })}

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50/40 transition-colors"
            >
              <span className="text-lg">➕</span>
              <span className="font-medium">Nueva tienda</span>
            </button>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-6">
          {hasCurrentTienda && (
            <button type="button" className="btn-secondary" onClick={() => navigate('/')}>Seguir aquí</button>
          )}
          <button type="button" className="text-sm text-gray-400 hover:text-gray-600 px-2" onClick={logout}>Cerrar sesión</button>
        </div>
      </div>

      {showCreate && <CreateTiendaModal onClose={() => setShowCreate(false)} onCreated={(t) => { upsertLocal(t); setShowCreate(false) }} />}
      {editing && <EditTiendaModal tienda={editing} onClose={() => setEditing(null)} onSaved={(t) => { upsertLocal(t); setEditing(null) }} />}
    </div>
  )
}

/** Modal "+ Nueva tienda": nombre (obligatorio) y logo (opcional, se sube justo después de crearla). */
function CreateTiendaModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEscapeClose(true, onClose)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await createTienda(name.trim())
      let tienda = res.data.data
      if (logoFile) {
        const logoRes = await uploadTiendaLogo(tienda.id, logoFile)
        tienda = logoRes.data.data
      }
      onCreated(tienda)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear la tienda')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4"
      >
        <h2 className="text-lg font-bold text-gray-900">Nueva tienda</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Logo (opcional)</label>
          <input
            type="file" accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
            className="text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">Si no subes uno, se usa el logo de Nexora. Puedes cambiarlo después.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creando...' : 'Crear tienda'}</button>
        </div>
      </form>
    </div>
  )
}

/** Modal de edición rápida (nombre + logo) para una tienda existente, sin tener que "entrar" a ella. */
function EditTiendaModal({ tienda, onClose, onSaved }) {
  const [name, setName] = useState(tienda.name)
  const [logoPath, setLogoPath] = useState(tienda.logoPath)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [error, setError] = useState('')
  useEscapeClose(true, onClose)

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await updateTiendaName(tienda.id, name.trim())
      onSaved({ ...res.data.data, logoPath })
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el nombre')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    setError('')
    try {
      const res = await uploadTiendaLogo(tienda.id, file)
      setLogoPath(res.data.data.logoPath)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo subir el logo')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  async function handleRemoveLogo() {
    setUploadingLogo(true)
    setError('')
    try {
      await removeTiendaLogo(tienda.id)
      setLogoPath(null)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo quitar el logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4"
      >
        <h2 className="text-lg font-bold text-gray-900">Editar tienda</h2>

        <div className="flex items-center gap-4">
          {logoPath ? (
            <img src={resolveMediaUrl(logoPath)} alt="" className="w-14 h-14 rounded-full object-cover border border-gray-200" />
          ) : (
            <span className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-xl">🏬</span>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="btn-secondary text-xs cursor-pointer inline-block">
              {uploadingLogo ? 'Subiendo...' : 'Subir logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoChange} disabled={uploadingLogo} />
            </label>
            {logoPath && (
              <button type="button" className="text-xs text-red-600 hover:underline text-left" onClick={handleRemoveLogo} disabled={uploadingLogo}>
                Quitar logo
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  )
}
