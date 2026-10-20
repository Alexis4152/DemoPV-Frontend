import { useEffect, useState } from 'react'
import { getArcoRequests, resolveArcoRequest } from '../api/arco'
import { useNotify } from '../context/NotifyContext'

const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const TYPE_LABELS = {
  ACCESS: 'Acceso',
  RECTIFICATION: 'Rectificación',
  CANCELLATION: 'Cancelación',
  OPPOSITION: 'Oposición',
}

// Guía de "qué significa este tipo de solicitud" y "cómo resolverla en este sistema en
// concreto" (dónde buscar el dato, qué sí y qué no se puede hacer). Pensada para un
// SUPER_ADMIN que nunca ha atendido una — nada de esto reemplaza criterio legal real, es
// una guía operativa de dónde tocar en la app.
const TYPE_GUIDANCE = {
  ACCESS: {
    meaning: 'La persona quiere saber qué datos personales suyos tiene el sistema y para qué se usan.',
    howTo: 'Busca su nombre/correo/teléfono en Ventas y Apartados (y en Usuarios si es personal con cuenta). Mándale por correo un resumen: qué datos tienes de ella (nombre, correo, teléfono, historial de compras o apartados) y para qué se usan (facturar, contactarla, cortes de caja). Completa con una nota de qué le enviaste.',
  },
  RECTIFICATION: {
    meaning: 'Sus datos están incompletos o tienen un error, y quiere que los corrijas.',
    howTo: 'Si es personal con cuenta, corrígelo desde Usuarios. Si es un dato de una venta o apartado, revisa si todavía se puede editar sin afectar la contabilidad (un ticket ya facturado normalmente no se toca). Completa explicando qué corregiste y dónde.',
  },
  CANCELLATION: {
    meaning: 'Quiere que elimines sus datos personales.',
    howTo: 'Si es personal, puedes desactivar su cuenta (Usuarios) y quitarle el correo/teléfono si ya no trabaja contigo. Si son datos de una venta o apartado: esos registros tienen obligación fiscal, normalmente NO se pueden borrar — pero sí puedes quitar el correo/teléfono de contacto si ya no hace falta conservarlos. Completa explicando qué sí se eliminó y qué no (y por qué, si aplica la obligación legal).',
  },
  OPPOSITION: {
    meaning: 'No quiere que uses sus datos para algo en particular (ej. que le mandes avisos o promociones).',
    howTo: 'Identifica el uso puntual del que se queja y detenlo (ej. quítala de avisos/promociones). Un uso ya consumado (el ticket de una compra que ya hizo) no se puede "deshacer" retroactivamente. Completa anotando qué uso se detuvo.',
  },
}
const STATUS_LABELS = {
  PENDING: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  COMPLETED: { label: 'Completada', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rechazada', color: 'bg-red-100 text-red-700' },
}
const FILTERS = [['', 'Todas'], ['PENDING', 'Pendientes'], ['COMPLETED', 'Completadas'], ['REJECTED', 'Rechazadas']]

/**
 * Pantalla "Solicitudes ARCO": lista y resuelve las solicitudes de derechos ARCO (Acceso,
 * Rectificación, Cancelación, Oposición) que cualquiera puede levantar sin cuenta desde
 * `ArcoRequest.jsx` (enlazada desde Login). Exclusiva de SUPER_ADMIN (ver `PrivateRoute
 * superAdminOnly` en `App.jsx`) — es una obligación legal de la plataforma completa, no
 * algo por tienda.
 *
 * A diferencia de otros flujos de "eliminar" del sistema, resolver una solicitud de
 * Cancelación NO borra/anonimiza nada automáticamente: el SUPER_ADMIN escribe una nota
 * explicando qué hizo (si corrigió un dato, si confirmó que ya no hay nada que borrar,
 * etc.) — los registros de venta/apartado tienen obligaciones fiscales, así que ese ajuste
 * se hace a mano, con criterio caso por caso, fuera de este flujo.
 */
export default function ArcoRequests() {
  const { notify, confirmDialog } = useNotify()
  const [filter, setFilter] = useState('')
  const [requests, setRequests] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [resolveForm, setResolveForm] = useState({ status: 'COMPLETED', notes: '' })
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    getArcoRequests(filter).then((r) => setRequests(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(req) {
    if (expandedId === req.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(req.id)
    setResolveForm({ status: 'COMPLETED', notes: '' })
  }

  async function handleResolve(req) {
    if (!resolveForm.notes.trim()) {
      notify('Explica qué hiciste — la nota queda como constancia', 'error')
      return
    }
    const danger = resolveForm.status === 'REJECTED'
    if (!(await confirmDialog(
      `¿Confirmas marcar esta solicitud como "${STATUS_LABELS[resolveForm.status].label}"? No se puede deshacer.`,
      { confirmText: 'Confirmar', danger }
    ))) return
    setSaving(true)
    try {
      await resolveArcoRequest(req.id, resolveForm)
      notify('Solicitud actualizada', 'success')
      setExpandedId(null)
      load()
    } catch (err) {
      notify(err.response?.data?.message || 'No se pudo actualizar la solicitud', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Solicitudes ARCO</h2>
      <p className="text-gray-500 text-sm mb-6">
        Acceso, Rectificación, Cancelación y Oposición sobre datos personales — levantadas desde el formulario
        público, sin cuenta. Aplica a toda la plataforma, no a una tienda en particular.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <p className="p-10 text-center text-sm text-gray-400">Cargando...</p>
        ) : requests.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-500">Sin solicitudes.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {requests.map((req) => {
              const status = STATUS_LABELS[req.status]
              const expanded = expandedId === req.id
              return (
                <div key={req.id}>
                  <div
                    className="px-5 py-4 cursor-pointer hover:bg-gray-50/70 flex flex-wrap items-center gap-3"
                    onClick={() => toggleExpand(req)}
                  >
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{TYPE_LABELS[req.type]}</span>
                    <span className="font-medium text-gray-800">{req.requesterName}</span>
                    <span className="text-sm text-gray-500">{req.requesterEmail}</span>
                    {req.requesterPhone && <span className="text-sm text-gray-400">{req.requesterPhone}</span>}
                    <span className="text-xs text-gray-400 ml-auto">{fmtDate(req.createdAt)}</span>
                  </div>

                  {expanded && (
                    <div className="px-5 pb-5 bg-gray-50/60 space-y-3">
                      <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-3 space-y-1.5">
                        <p className="text-sm text-purple-900">
                          <span className="font-semibold">¿Qué es "{TYPE_LABELS[req.type]}"?</span> {TYPE_GUIDANCE[req.type].meaning}
                        </p>
                        <p className="text-sm text-purple-800">
                          <span className="font-semibold">Cómo resolverlo:</span> {TYPE_GUIDANCE[req.type].howTo}
                        </p>
                      </div>

                      {req.details && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Detalle de la persona</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.details}</p>
                        </div>
                      )}

                      {req.status !== 'PENDING' ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                            Resuelta por {req.resolvedByName || '—'} · {fmtDate(req.resolvedAt)}
                          </p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.resolutionNotes}</p>
                        </div>
                      ) : (
                        <div className="space-y-3 pt-2">
                          <div className="flex gap-2">
                            {['COMPLETED', 'REJECTED'].map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setResolveForm({ ...resolveForm, status: s })}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                  resolveForm.status === s
                                    ? s === 'COMPLETED' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                                }`}
                              >
                                {STATUS_LABELS[s].label}
                              </button>
                            ))}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Nota de resolución (qué hiciste — queda como constancia)
                            </label>
                            <textarea
                              className="input" rows={2} maxLength={2000}
                              value={resolveForm.notes}
                              onChange={(e) => setResolveForm({ ...resolveForm, notes: e.target.value })}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" className="btn-primary" disabled={saving} onClick={() => handleResolve(req)}>
                              {saving ? 'Guardando...' : 'Guardar resolución'}
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => setExpandedId(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
