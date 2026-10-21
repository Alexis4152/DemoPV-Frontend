import { useEffect, useState } from 'react'
import { createArcoRequest, getMyArcoRequests } from '../api/arco'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import useEscapeClose from '../hooks/useEscapeClose'

const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const TYPES = [
  ['ACCESS', 'Acceso', 'Quiero saber qué datos personales míos tienen y para qué los usan.'],
  ['RECTIFICATION', 'Rectificación', 'Mis datos están incompletos o tienen un error — quiero corregirlos.'],
  ['CANCELLATION', 'Cancelación', 'Quiero que eliminen mis datos personales.'],
  ['OPPOSITION', 'Oposición', 'No quiero que usen mis datos personales para algo en particular.'],
]
const TYPE_LABELS = Object.fromEntries(TYPES.map(([v, l]) => [v, l]))
const STATUS_LABELS = {
  PENDING: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  COMPLETED: { label: 'Completada', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rechazada', color: 'bg-red-100 text-red-700' },
}

/**
 * "Mis solicitudes ARCO": historial de las solicitudes que el usuario en sesión ha
 * levantado, con su propio correo. Abierta a cualquier rol — a diferencia de
 * `ArcoRequests.jsx` (todas las solicitudes, exclusivo de SUPER_ADMIN), aquí solo se ven
 * las propias y no se pueden resolver, solo consultar.
 *
 * Levantar una solicitud NUEVA se hace aquí mismo (botón "+ Nueva solicitud", abajo) sin
 * salir de la app ni perder el sidebar — a diferencia del formulario público `ArcoRequest
 * .jsx` (pensado para alguien SIN sesión), un usuario ya autenticado no necesita volver a
 * escribir su nombre/correo: se usan los de su cuenta tal cual, que además siempre pasan
 * la validación del backend (es su propio correo, ya registrado por definición).
 */
export default function MyArcoRequests() {
  const { user } = useAuth()
  const { notify, confirmDialog } = useNotify()
  const [requests, setRequests] = useState(null)
  const [showForm, setShowForm] = useState(false)

  function load() {
    getMyArcoRequests().then((r) => setRequests(r.data.data))
  }

  useEffect(load, [])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Mis solicitudes ARCO</h2>
          <p className="text-gray-500 text-sm">
            Historial de las solicitudes de Acceso, Rectificación, Cancelación u Oposición que has levantado.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>+ Nueva solicitud</button>
      </div>

      <div className="card !p-0 overflow-hidden">
        {!requests ? (
          <p className="p-10 text-center text-sm text-gray-400">Cargando...</p>
        ) : requests.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-500">Todavía no has levantado ninguna solicitud.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {requests.map((req) => {
              const status = STATUS_LABELS[req.status]
              return (
                <div key={req.id} className="px-5 py-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{TYPE_LABELS[req.type]}</span>
                    <span className="text-xs text-gray-400 ml-auto">{fmtDate(req.createdAt)}</span>
                  </div>
                  {req.details && <p className="text-sm text-gray-600 whitespace-pre-wrap">{req.details}</p>}
                  {req.status !== 'PENDING' && (
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                        Resuelta {fmtDate(req.resolvedAt)}
                      </p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.resolutionNotes}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && (
        <NewRequestModal
          user={user}
          notify={notify}
          confirmDialog={confirmDialog}
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

/** Modal "+ Nueva solicitud": nombre/correo ya vienen de la cuenta en sesión, no se piden de nuevo. */
function NewRequestModal({ user, notify, confirmDialog, onClose, onCreated }) {
  const [type, setType] = useState('')
  const [phone, setPhone] = useState('')
  const [details, setDetails] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  useEscapeClose(true, onClose)

  async function handleSubmit(e) {
    e.preventDefault()
    const errors = {}
    if (!type) errors.type = 'Elige qué tipo de solicitud quieres hacer'
    if (phone && phone.length !== 10) errors.phone = 'El teléfono debe tener 10 dígitos'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    if (!(await confirmDialog('¿Confirmas enviar esta solicitud ARCO?', { confirmText: 'Enviar solicitud', danger: false }))) return

    setSaving(true)
    try {
      await createArcoRequest({
        requesterName: user.name,
        requesterEmail: user.email,
        requesterPhone: phone || undefined,
        type,
        details: details.trim() || undefined,
      })
      notify('Solicitud enviada', 'success')
      onCreated()
    } catch (err) {
      notify(err.response?.data?.message || 'No se pudo enviar la solicitud', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div>
          <h2 className="text-lg font-bold text-gray-900">Nueva solicitud ARCO</h2>
          <p className="text-xs text-gray-400 mt-1">Se manda a nombre de {user?.name} ({user?.email}).</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué quieres hacer?</label>
          <div className="space-y-2">
            {TYPES.map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                  type === value ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input type="radio" name="type" value={value} className="mt-1" checked={type === value} onChange={() => setType(value)} />
                <span>
                  <span className="block text-sm font-semibold text-gray-800">{label}</span>
                  <span className="block text-xs text-gray-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          {fieldErrors.type && <p className="text-red-600 text-xs mt-1">{fieldErrors.type}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono (opcional)</label>
          <input
            type="tel" className="input" inputMode="numeric" maxLength={10} value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
          {fieldErrors.phone && <p className="text-red-600 text-xs mt-1">{fieldErrors.phone}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cuéntanos más (opcional)</label>
          <textarea
            className="input" rows={3} maxLength={2000} value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Ej. qué dato específico quieres corregir"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Enviando...' : 'Enviar solicitud'}</button>
        </div>
      </form>
    </div>
  )
}
