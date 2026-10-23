import { useEffect, useState } from 'react'
import {
  getCurrentMaintenanceWindow,
  scheduleMaintenanceWindow,
  extendMaintenanceWindow,
  cancelMaintenanceWindow,
} from '../api/maintenance'
import { useNotify } from '../context/NotifyContext'
import { scheduledMaintenanceMessage, activeMaintenanceMessage } from '../utils/maintenanceMessages'

/**
 * Pantalla "Mantenimiento" (SUPER_ADMIN): programa la ventana de mantenimiento que se ve
 * como aviso en el Login de TODAS las tiendas (es de plataforma, no por tienda — ver
 * `Login.jsx`). Solo las fechas/horas son elegibles aquí; el resto del texto del aviso es
 * una plantilla fija compartida con `Login.jsx` (ver `utils/maintenanceMessages.js`), que
 * se previsualiza abajo tal como la va a ver cualquiera que entre al sistema.
 *
 * Solo puede haber UNA ventana relevante a la vez: mientras exista una programada o en
 * curso, este formulario se oculta y en su lugar se muestra esa ventana con sus acciones
 * (prolongar si ya está en curso, cancelar si todavía no empieza).
 */
export default function Maintenance() {
  const { notify, confirmDialog } = useNotify()
  const [current, setCurrent] = useState(undefined) // undefined = cargando, null = ninguna
  const [form, setForm] = useState({ startAt: '', endAt: '' })
  const [newEndAt, setNewEndAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // `?? null`: el backend omite por completo la clave `data` del JSON cuando es null (en
  // vez de mandar `"data":null`), así que `r.data.data` llegaría como `undefined` — el
  // mismo valor que usa el estado inicial para decir "todavía cargando". Sin este fallback,
  // una tienda sin ninguna ventana programada se quedaba pegada en "Cargando..." para
  // siempre, porque `current` nunca pasaba de `undefined` a `null`.
  function load() {
    getCurrentMaintenanceWindow()
      .then((r) => setCurrent(r.data.data ?? null))
      .catch(() => setCurrent(null))
  }

  useEffect(() => { load() }, [])

  async function handleSchedule(e) {
    e.preventDefault()
    setError('')
    if (!form.startAt || !form.endAt) {
      setError('Elige fecha/hora de inicio y de fin')
      return
    }
    if (!(await confirmDialog(
      'Este aviso va a salir en la pantalla de inicio de sesión de TODAS las tiendas del sistema. ¿Programar esta ventana de mantenimiento?',
      { confirmText: 'Programar' }
    ))) return
    setSaving(true)
    try {
      await scheduleMaintenanceWindow({ startAt: form.startAt, endAt: form.endAt })
      notify('Ventana de mantenimiento programada', 'success')
      setForm({ startAt: '', endAt: '' })
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo programar la ventana')
    } finally {
      setSaving(false)
    }
  }

  async function handleExtend(e) {
    e.preventDefault()
    setError('')
    if (!newEndAt) {
      setError('Elige la nueva hora de fin')
      return
    }
    if (!(await confirmDialog('¿Prolongar la ventana de mantenimiento en curso hasta esta nueva hora?', { confirmText: 'Prolongar' }))) return
    setSaving(true)
    try {
      await extendMaintenanceWindow(current.id, newEndAt)
      notify('Ventana de mantenimiento prolongada', 'success')
      setNewEndAt('')
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo prolongar la ventana')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel() {
    if (!(await confirmDialog('¿Cancelar esta ventana de mantenimiento programada? El aviso desaparecerá del Login.', { confirmText: 'Cancelar ventana', danger: true }))) return
    setSaving(true)
    setError('')
    try {
      await cancelMaintenanceWindow(current.id)
      notify('Ventana de mantenimiento cancelada', 'success')
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cancelar la ventana')
    } finally {
      setSaving(false)
    }
  }

  if (current === undefined) return <p className="text-gray-400 text-sm">Cargando...</p>

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mantenimiento</h1>
      <p className="text-gray-500 text-sm mb-6">
        Programa un aviso de mantenimiento que se muestra en la pantalla de inicio de sesión de{' '}
        <span className="font-medium">todas las tiendas</span>. El texto es una plantilla fija — solo eliges cuándo.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      {current ? (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${current.phase === 'ACTIVE' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
              {current.phase === 'ACTIVE' ? 'En curso' : 'Programada'}
            </span>
          </div>
          <div className="text-sm text-gray-700 space-y-1">
            <p><span className="text-gray-500">Inicio:</span> {new Date(current.startAt).toLocaleString('es-MX')}</p>
            <p><span className="text-gray-500">Fin:</span> {new Date(current.endAt).toLocaleString('es-MX')}</p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Así se ve en el Login</p>
            {current.phase === 'ACTIVE'
              ? activeMaintenanceMessage(current.endAt)
              : scheduledMaintenanceMessage(current.startAt, current.endAt)}
          </div>

          {current.phase === 'ACTIVE' ? (
            <form onSubmit={handleExtend} className="border-t border-gray-100 pt-4 space-y-2">
              <label className="block text-sm font-medium text-gray-700">Prolongar hasta</label>
              <div className="flex gap-2">
                <input
                  type="datetime-local" className="input" required
                  value={newEndAt}
                  onChange={(e) => setNewEndAt(e.target.value)}
                />
                <button className="btn-primary whitespace-nowrap" disabled={saving}>Prolongar</button>
              </div>
            </form>
          ) : (
            <div className="border-t border-gray-100 pt-4">
              <button type="button" className="btn-secondary text-red-600" onClick={handleCancel} disabled={saving}>
                Cancelar ventana
              </button>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSchedule} className="card space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inicio</label>
              <input
                type="datetime-local" className="input" required
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fin estimado</label>
              <input
                type="datetime-local" className="input" required
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
              />
            </div>
          </div>

          {form.startAt && form.endAt && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Vista previa del aviso</p>
              {scheduledMaintenanceMessage(form.startAt, form.endAt)}
            </div>
          )}

          <button className="btn-primary" disabled={saving}>
            {saving ? 'Programando...' : 'Programar mantenimiento'}
          </button>
        </form>
      )}
    </div>
  )
}
