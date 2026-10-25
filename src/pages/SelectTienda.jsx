import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getTiendas, getTiendaPlan, createTienda, updateTiendaName, uploadTiendaLogo, removeTiendaLogo, purgeTienda } from '../api/tiendas'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import { resolveMediaUrl } from '../utils/media'
import logo from '../assets/logo.png'
import useEscapeClose from '../hooks/useEscapeClose'
import ModalCloseButton from '../components/ModalCloseButton'

// Mismo límite que Inventory.jsx para fotos de producto — evita el viaje redondo al
// servidor solo para enterarse de que pesa de más.
const MAX_IMAGE_MB = 5

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
 *
 * Para SUPER_ADMIN, también es la puerta directa a "Solicitudes ARCO" (de PLATAFORMA, ni
 * de esta tienda ni de ninguna otra) — es lo único que el equipo de Nexora atiende de
 * verdad desde esta cuenta, junto con dar de alta tiendas nuevas (ya en esta misma
 * pantalla). Llegar ahí desde aquí no exige elegir tienda primero (ver `PrivateRoute.jsx`,
 * que ya no obliga en esa ruta). "Correo del sistema" y "Mis solicitudes ARCO" siguen
 * existiendo, solo que no como atajo en esta pantalla — ver `Layout.jsx`.
 */
export default function SelectTienda() {
  const { user, selectTienda, patchTienda, logout, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [tiendas, setTiendas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null) // tienda siendo editada, o null
  const [purging, setPurging] = useState(null) // tienda siendo borrada permanentemente, o null (solo SUPER_ADMIN)
  // Plan del SUPERVISOR (máximo de tiendas que puede tener); null para SUPER_ADMIN.
  const [plan, setPlan] = useState(null)

  function loadPlan() {
    if (isSuperAdmin) return
    getTiendaPlan().then((r) => setPlan(r.data.data ?? null)).catch(() => setPlan(null))
  }

  function load() {
    loadPlan()
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

  /** Quita del listado local una tienda recién borrada permanentemente (ver `purgeTienda`). */
  function removeLocal(tiendaId) {
    setTiendas((list) => list.filter((t) => t.id !== tiendaId))
  }

  const hasCurrentTienda = !!user?.tienda
  const maxTiendas = plan?.maxTiendas ?? null
  const usedTiendas = plan?.usedTiendas ?? 0
  const planFull = maxTiendas != null && usedTiendas >= maxTiendas

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
            {isSuperAdmin
              ? 'Como SUPER_ADMIN puedes administrar cualquier tienda — elige una para entrar a su Inventario, Ventas, Usuarios y Configuración, exactamente como su administrador. Puedes cambiarla después.'
              : 'Como SUPERVISOR puedes administrar las tiendas que tienes asignadas — elige una para entrar a su Inventario, Ventas, Usuarios y Configuración, exactamente como su administrador. Puedes cambiarla después.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
        )}

        {maxTiendas != null && (
          <div className={`text-sm rounded-lg px-4 py-3 mb-4 border ${planFull ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
            De acuerdo con tu plan contratado, solo puedes capturar <strong>{maxTiendas} tienda{maxTiendas === 1 ? '' : 's'}</strong>.
            {' '}Tienes {usedTiendas} activa{usedTiendas === 1 ? '' : 's'}.
            {planFull && ' Ya llegaste al límite: para agregar más, pide que amplíen tu plan.'}
          </div>
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
                  {/* Borrado permanente: exclusivo de SUPER_ADMIN (ni siquiera SUPERVISOR),
                      ver TiendaPurgeService. La baja lógica normal sigue sin cambios: no hay
                      botón para ella aquí, se maneja desde Datos de la tienda si aplica. */}
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => setPurging(t)}
                      title="Borrar tienda permanentemente"
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 hover:bg-white"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              )
            })}

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              disabled={planFull}
              title={planFull ? 'Llegaste al máximo de tiendas de tu plan' : undefined}
              className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-300 disabled:hover:text-gray-500 disabled:hover:bg-transparent"
            >
              <span className="text-lg">➕</span>
              <span className="font-medium">{planFull ? `Nueva tienda (límite de ${maxTiendas})` : 'Nueva tienda'}</span>
            </button>
          </div>
        )}

        {/* Acceso a lo que es de PLATAFORMA, no de ninguna tienda — por eso vive aquí, antes de
            elegir una (ver PrivateRoute: esta ruta ya no obliga a elegir tienda primero). Solo
            "Solicitudes ARCO": es lo único que un SUPER_ADMIN de Nexora hace de verdad desde
            aquí (lo otro, dar de alta tiendas nuevas, ya está a la izquierda). "Correo del
            sistema" y "Mis solicitudes ARCO" siguen existiendo (Configuración → Correo del
            sistema una vez dentro de una tienda; "Mis solicitudes" en el sidebar normal, para
            el personal real de cada tienda), solo no como atajo aquí. */}
        {isSuperAdmin && (
          <div className="flex flex-wrap gap-4 justify-center border-t border-gray-100 pt-4 mt-2">
            <Link to="/arco-requests" className="text-sm text-purple-600 hover:text-purple-800 font-medium inline-flex items-center gap-1.5">
              🛡️ Solicitudes ARCO
            </Link>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-6">
          {hasCurrentTienda && (
            <button type="button" className="btn-secondary" onClick={() => navigate('/')}>Seguir aquí</button>
          )}
          <button type="button" className="text-sm text-gray-400 hover:text-gray-600 px-2" onClick={logout}>Cerrar sesión</button>
        </div>
      </div>

      {showCreate && <CreateTiendaModal onClose={() => setShowCreate(false)} onCreated={(t) => { upsertLocal(t); setShowCreate(false); loadPlan() }} />}
      {editing && <EditTiendaModal tienda={editing} onClose={() => setEditing(null)} onSaved={(t) => { upsertLocal(t); setEditing(null) }} />}
      {purging && <PurgeTiendaModal tienda={purging} onClose={() => setPurging(null)} onPurged={(id) => { removeLocal(id); setPurging(null); loadPlan() }} />}
    </div>
  )
}

/**
 * Modal de borrado PERMANENTE de una tienda (solo SUPER_ADMIN) — con doble confirmación a
 * propósito, dado que es irreversible y borra más de 20 tablas de datos relacionados (ver
 * `TiendaPurgeService`): primero hay que escribir aquí el nombre EXACTO de la tienda (mismo
 * patrón que GitHub al borrar un repositorio), y solo entonces se dispara un segundo
 * `confirmDialog` ("¿estás absolutamente seguro?") antes de llamar al backend.
 */
function PurgeTiendaModal({ tienda, onClose, onPurged }) {
  const { notify, confirmDialog } = useNotify()
  const [typedName, setTypedName] = useState('')
  const [purging, setPurging] = useState(false)
  const [error, setError] = useState('')
  useEscapeClose(!purging, onClose)

  const nameMatches = typedName.trim() === tienda.name

  async function handlePurge() {
    if (!nameMatches) return
    const ok = await confirmDialog(
      `¿Estás ABSOLUTAMENTE seguro de borrar "${tienda.name}" para siempre? Se perderán todos sus usuarios, productos, ventas, apartados, cortes de caja y todo lo demás. Esto NO se puede deshacer.`,
      { title: 'Última confirmación', confirmText: 'Sí, borrar para siempre', danger: true },
    )
    if (!ok) return
    setPurging(true)
    setError('')
    try {
      await purgeTienda(tienda.id, typedName.trim())
      notify(`"${tienda.name}" fue borrada permanentemente`, 'success')
      onPurged(tienda.id)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo borrar la tienda')
      notify('Error al borrar la tienda', 'error')
    } finally {
      setPurging(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
      <div
        className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4 border-t-4 border-t-red-500"
      >
        <ModalCloseButton onClick={() => !purging && onClose()} />
        <h2 className="text-lg font-bold text-red-700 pr-8">⚠️ Borrar "{tienda.name}" para siempre</h2>
        <p className="text-sm text-gray-600">
          Esto borra <span className="font-semibold">permanentemente</span> esta tienda y TODO lo relacionado:
          usuarios, productos, categorías, ventas, apartados, cortes de caja, cajas, materia prima, faltantes
          y reembolsos. No hay respaldo ni forma de deshacerlo.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Escribe <span className="font-mono bg-gray-100 px-1 rounded">{tienda.name}</span> para confirmar
          </label>
          <input
            type="text" className="input" value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            autoFocus
            disabled={purging}
          />
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={purging}>Cancelar</button>
          <button
            type="button"
            className="bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handlePurge}
            disabled={!nameMatches || purging}
          >
            {purging ? 'Borrando...' : 'Borrar permanentemente'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Modal "+ Nueva tienda": nombre (obligatorio) y logo (opcional, se sube justo después de crearla). */
function CreateTiendaModal({ onClose, onCreated }) {
  const { notify } = useNotify()
  const [name, setName] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Solo al dar clic en "Crear tienda" — mismo patrón que Usuarios/Roles/Categorías.
  const [nameError, setNameError] = useState('')
  useEscapeClose(true, onClose)

  async function handleSubmit(e) {
    e.preventDefault()
    // Sin `required` nativo en el input (ver el JSX de abajo) — esto es lo único que valida
    // antes de mandar la solicitud. Mismo límite que TiendaRequest.name en el backend (150,
    // por Tienda.name VARCHAR(150)).
    const trimmed = name.trim()
    if (!trimmed) { setNameError('El nombre es obligatorio'); notify('Revisa los campos marcados en rojo', 'error'); return }
    if (trimmed.length > 150) { setNameError('El nombre no puede tener más de 150 caracteres'); notify('Revisa los campos marcados en rojo', 'error'); return }
    setNameError('')
    setSaving(true)
    setError('')
    try {
      const res = await createTienda(trimmed)
      let tienda = res.data.data
      if (logoFile) {
        const logoRes = await uploadTiendaLogo(tienda.id, logoFile)
        tienda = logoRes.data.data
      }
      notify('Tienda creada correctamente', 'success')
      onCreated(tienda)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear la tienda')
      notify('Error al crear la tienda', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4"
      >
        <ModalCloseButton onClick={onClose} />
        <h2 className="text-lg font-bold text-gray-900 pr-8">Nueva tienda</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          {/* Sin required nativo a propósito (ver handleSubmit). */}
          <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {nameError && <p className="text-red-600 text-xs mt-1">{nameError}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Logo (opcional)</label>
          <input
            type="file" accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) { setLogoFile(null); return }
              if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
                notify(`La imagen pesa demasiado — el máximo permitido es ${MAX_IMAGE_MB} MB`, 'error')
                e.target.value = ''
                setLogoFile(null)
                return
              }
              setLogoFile(file)
            }}
            className="text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">Si no subes uno, se usa el logo de Nexora. Puedes cambiarlo después. PNG, JPG o WEBP, máximo {MAX_IMAGE_MB} MB.</p>
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
  const { notify } = useNotify()
  const [name, setName] = useState(tienda.name)
  const [logoPath, setLogoPath] = useState(tienda.logoPath)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [error, setError] = useState('')
  // Solo al dar clic en "Guardar" — mismo patrón que Usuarios/Roles/Categorías.
  const [nameError, setNameError] = useState('')
  useEscapeClose(true, onClose)

  async function handleSave(e) {
    e.preventDefault()
    // Sin `required` nativo en el input (ver el JSX de abajo) — esto es lo único que valida
    // antes de mandar la solicitud. Mismo límite que TiendaRequest.name en el backend (150,
    // por Tienda.name VARCHAR(150)).
    const trimmed = name.trim()
    if (!trimmed) { setNameError('El nombre es obligatorio'); notify('Revisa los campos marcados en rojo', 'error'); return }
    if (trimmed.length > 150) { setNameError('El nombre no puede tener más de 150 caracteres'); notify('Revisa los campos marcados en rojo', 'error'); return }
    setNameError('')
    setSaving(true)
    setError('')
    try {
      const res = await updateTiendaName(tienda.id, trimmed)
      notify('Tienda editada correctamente', 'success')
      onSaved({ ...res.data.data, logoPath })
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el nombre')
      notify('Error al guardar la tienda', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      notify(`La imagen pesa demasiado — el máximo permitido es ${MAX_IMAGE_MB} MB`, 'error')
      e.target.value = ''
      return
    }
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
      <form
        onSubmit={handleSave}
        className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4"
      >
        <ModalCloseButton onClick={onClose} />
        <h2 className="text-lg font-bold text-gray-900 pr-8">Editar tienda</h2>

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
          {/* Sin required nativo a propósito (ver handleSave). */}
          <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          {nameError && <p className="text-red-600 text-xs mt-1">{nameError}</p>}
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
