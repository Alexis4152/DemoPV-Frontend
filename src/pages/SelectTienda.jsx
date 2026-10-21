import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getTiendas, getTiendaPlan, createTienda, updateTiendaName, updateTiendasPaymentMethods, uploadTiendaLogo, removeTiendaLogo } from '../api/tiendas'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import { resolveMediaUrl } from '../utils/media'
import logo from '../assets/logo.png'
import useEscapeClose from '../hooks/useEscapeClose'

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
 * de esta tienda ni de ninguna otra) y a la configuración masiva de métodos de pago
 * (Tarjeta y Pasarela Openpay) para N tiendas.
 */
export default function SelectTienda() {
  const { user, selectTienda, patchTienda, logout, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [tiendas, setTiendas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null) // tienda siendo editada, o null
  const [showPaymentModal, setShowPaymentModal] = useState(false)
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
    // cambio de inmediato en el sidebar y en el POS sin que tenga que re-elegirla.
    if (user?.tienda?.id === tienda.id) {
      patchTienda({
        name: tienda.name,
        logoPath: tienda.logoPath,
        cardPaymentEnabled: tienda.cardPaymentEnabled,
        openpayEnabled: tienda.openpayEnabled,
      })
    }
  }

  /** Refleja en la lista un lote de N tiendas actualizadas (ej. al configurar métodos de pago). */
  function upsertManyLocal(updatedList) {
    const byId = new Map(updatedList.map((t) => [t.id, t]))
    setTiendas((list) =>
      list.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t)).sort((a, b) => a.name.localeCompare(b.name))
    )
    if (user?.tienda?.id && byId.has(user.tienda.id)) {
      const currentUpdated = byId.get(user.tienda.id)
      patchTienda({
        cardPaymentEnabled: currentUpdated.cardPaymentEnabled,
        openpayEnabled: currentUpdated.openpayEnabled,
      })
    }
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
                      {(t.cardPaymentEnabled || t.openpayEnabled) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {t.cardPaymentEnabled && (
                            <span className="text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                              💳 Tarjeta
                            </span>
                          )}
                          {t.openpayEnabled && (
                            <span className="text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">
                              🌐 Openpay
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    title={isSuperAdmin ? 'Editar nombre, logo y métodos de pago' : 'Editar nombre y logo'}
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
              disabled={planFull}
              title={planFull ? 'Llegaste al máximo de tiendas de tu plan' : undefined}
              className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-300 disabled:hover:text-gray-500 disabled:hover:bg-transparent"
            >
              <span className="text-lg">➕</span>
              <span className="font-medium">{planFull ? `Nueva tienda (límite de ${maxTiendas})` : 'Nueva tienda'}</span>
            </button>
          </div>
        )}

        {/* Acciones de PLATAFORMA exclusivas de SUPER_ADMIN */}
        {isSuperAdmin && (
          <div className="flex flex-wrap gap-4 justify-center items-center border-t border-gray-100 pt-4 mt-4">
            {tiendas.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="text-sm text-purple-600 hover:text-purple-800 font-medium inline-flex items-center gap-1.5"
              >
                💳 Configurar métodos de pago (N tiendas)
              </button>
            )}
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

      {showCreate && (
        <CreateTiendaModal
          isSuperAdmin={isSuperAdmin}
          onClose={() => setShowCreate(false)}
          onCreated={(t) => { upsertLocal(t); setShowCreate(false); loadPlan() }}
        />
      )}
      {editing && (
        <EditTiendaModal
          tienda={editing}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setEditing(null)}
          onSaved={(t) => { upsertLocal(t); setEditing(null) }}
        />
      )}
      {showPaymentModal && isSuperAdmin && (
        <BulkPaymentMethodsModal
          tiendas={tiendas}
          onClose={() => setShowPaymentModal(false)}
          onSaved={(updatedList) => { upsertManyLocal(updatedList); setShowPaymentModal(false) }}
        />
      )}
    </div>
  )
}

/** Modal "+ Nueva tienda": nombre (obligatorio), logo (opcional) y, para SUPER_ADMIN, métodos de pago (inician en false). */
function CreateTiendaModal({ isSuperAdmin, onClose, onCreated }) {
  const { notify } = useNotify()
  const [name, setName] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [cardPaymentEnabled, setCardPaymentEnabled] = useState(false)
  const [openpayEnabled, setOpenpayEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Solo al dar clic en "Crear tienda" — mismo patrón que Usuarios/Roles/Categorías.
  const [nameError, setNameError] = useState('')
  useEscapeClose(true, onClose)

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setNameError('El nombre es obligatorio'); notify('Revisa los campos marcados en rojo', 'error'); return }
    if (trimmed.length > 150) { setNameError('El nombre no puede tener más de 150 caracteres'); notify('Revisa los campos marcados en rojo', 'error'); return }
    setNameError('')
    setSaving(true)
    setError('')
    try {
      const extra = isSuperAdmin ? { cardPaymentEnabled, openpayEnabled } : {}
      const res = await createTienda(trimmed, extra)
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4"
      >
        <h2 className="text-lg font-bold text-gray-900">Nueva tienda</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
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

        {isSuperAdmin && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Métodos de pago adicionales</p>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={cardPaymentEnabled}
                onChange={(e) => setCardPaymentEnabled(e.target.checked)}
              />
              <span>💳 Pago con tarjeta (Terminal física)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={openpayEnabled}
                onChange={(e) => setOpenpayEnabled(e.target.checked)}
              />
              <span>🌐 Pasarela de pagos Openpay</span>
            </label>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creando...' : 'Crear tienda'}</button>
        </div>
      </form>
    </div>
  )
}

/** Modal de edición rápida (nombre + logo + métodos de pago si es SUPER_ADMIN) para una tienda existente. */
function EditTiendaModal({ tienda, isSuperAdmin, onClose, onSaved }) {
  const { notify } = useNotify()
  const [name, setName] = useState(tienda.name)
  const [logoPath, setLogoPath] = useState(tienda.logoPath)
  const [cardPaymentEnabled, setCardPaymentEnabled] = useState(!!tienda.cardPaymentEnabled)
  const [openpayEnabled, setOpenpayEnabled] = useState(!!tienda.openpayEnabled)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [error, setError] = useState('')
  const [nameError, setNameError] = useState('')
  useEscapeClose(true, onClose)

  async function handleSave(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setNameError('El nombre es obligatorio'); notify('Revisa los campos marcados en rojo', 'error'); return }
    if (trimmed.length > 150) { setNameError('El nombre no puede tener más de 150 caracteres'); notify('Revisa los campos marcados en rojo', 'error'); return }
    setNameError('')
    setSaving(true)
    setError('')
    try {
      const extra = isSuperAdmin ? { cardPaymentEnabled, openpayEnabled } : {}
      const res = await updateTiendaName(tienda.id, trimmed, extra)
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
          <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          {nameError && <p className="text-red-600 text-xs mt-1">{nameError}</p>}
        </div>

        {isSuperAdmin && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Métodos de pago adicionales</p>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={cardPaymentEnabled}
                onChange={(e) => setCardPaymentEnabled(e.target.checked)}
              />
              <span>💳 Pago con tarjeta (Terminal física)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={openpayEnabled}
                onChange={(e) => setOpenpayEnabled(e.target.checked)}
              />
              <span>🌐 Pasarela de pagos Openpay</span>
            </label>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  )
}

/**
 * Modal exclusivo de SUPER_ADMIN para habilitar o deshabilitar el pago con tarjeta y/o
 * la pasarela Openpay en 1 o N tiendas de forma simultánea.
 */
function BulkPaymentMethodsModal({ tiendas, onClose, onSaved }) {
  const { notify } = useNotify()
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [cardPaymentEnabled, setCardPaymentEnabled] = useState(false)
  const [openpayEnabled, setOpenpayEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEscapeClose(true, onClose)

  const filteredTiendas = tiendas.filter((t) =>
    t.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  function toggleTienda(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    const allVisibleSelected = filteredTiendas.length > 0 && filteredTiendas.every((t) => selectedIds.has(t.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        filteredTiendas.forEach((t) => next.delete(t.id))
      } else {
        filteredTiendas.forEach((t) => next.add(t.id))
      }
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (selectedIds.size === 0) {
      setError('Selecciona al menos una tienda para aplicar los cambios')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await updateTiendasPaymentMethods({
        tiendaIds: Array.from(selectedIds),
        cardPaymentEnabled,
        openpayEnabled,
      })
      const updated = res.data.data ?? []
      notify(`Métodos de pago actualizados en ${updated.length} tienda${updated.length === 1 ? '' : 's'}`, 'success')
      onSaved(updated)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron actualizar los métodos de pago')
      notify('Error al actualizar métodos de pago', 'error')
    } finally {
      setSaving(false)
    }
  }

  const allVisibleSelected = filteredTiendas.length > 0 && filteredTiendas.every((t) => selectedIds.has(t.id))

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] flex flex-col"
      >
        <div>
          <h2 className="text-lg font-bold text-gray-900">Configurar métodos de pago por tienda</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Selecciona una o varias tiendas y define si tendrán habilitado el cobro con tarjeta (terminal física) y la pasarela Openpay.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            className="input text-sm flex-1"
            placeholder="Buscar tienda por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            onClick={toggleAllVisible}
            className="btn-secondary text-xs whitespace-nowrap"
          >
            {allVisibleSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
          </button>
        </div>

        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-y-auto max-h-56">
          {filteredTiendas.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No se encontraron tiendas</p>
          ) : (
            filteredTiendas.map((t) => {
              const checked = selectedIds.has(t.id)
              return (
                <label
                  key={t.id}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${
                    checked ? 'bg-purple-50/60' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTienda(t.id)}
                    />
                    <span className="text-sm font-medium text-gray-800 truncate">{t.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${t.cardPaymentEnabled ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      💳 {t.cardPaymentEnabled ? 'Activa' : 'Inactiva'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${t.openpayEnabled ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      🌐 {t.openpayEnabled ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </label>
              )
            })
          )}
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 space-y-2.5">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Configuración a aplicar en {selectedIds.size} tienda{selectedIds.size === 1 ? '' : 's'} seleccionada{selectedIds.size === 1 ? '' : 's'}
          </p>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={cardPaymentEnabled}
              onChange={(e) => setCardPaymentEnabled(e.target.checked)}
            />
            <div>
              <span className="text-sm font-medium text-gray-800 block">💳 Habilitar pago con tarjeta (Terminal física)</span>
              <span className="text-xs text-gray-500">Si se desmarca, quedará deshabilitado en las tiendas seleccionadas.</span>
            </div>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={openpayEnabled}
              onChange={(e) => setOpenpayEnabled(e.target.checked)}
            />
            <div>
              <span className="text-sm font-medium text-gray-800 block">🌐 Habilitar pasarela de pagos Openpay</span>
              <span className="text-xs text-gray-500">Habilita o deshabilita Tarjeta Openpay, Paynet y SPEI en las tiendas seleccionadas.</span>
            </div>
          </label>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving || selectedIds.size === 0}>
            {saving ? 'Aplicando...' : `Aplicar a ${selectedIds.size} tienda${selectedIds.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
    </div>
  )
}
