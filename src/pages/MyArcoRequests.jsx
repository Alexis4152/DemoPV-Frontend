import { useEffect, useState } from 'react'
import { createMyArcoRequest, getMyArcoRequests, answerMyArcoInfo } from '../api/arco'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import useEscapeClose from '../hooks/useEscapeClose'
import { ARCO_TYPES, ARCO_TYPE_LABELS, ARCO_STATUS_LABELS, ARCO_STRONG_IDENTITY_TYPES } from '../utils/arcoTypes'
import ModalCloseButton from '../components/ModalCloseButton'

const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const fmtDay = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—'

/**
 * "Mis solicitudes ARCO": historial de las solicitudes que el usuario en sesión ha
 * levantado con su propia cuenta (canal ACCOUNT), con su seguimiento completo. Abierta a
 * cualquier rol — a diferencia de `ArcoRequests.jsx` (todas las solicitudes, exclusivo de
 * SUPER_ADMIN), aquí solo se ven las propias.
 *
 * Levantar una solicitud NUEVA se hace aquí mismo (botón "+ Nueva solicitud") sin salir de
 * la app ni perder el sidebar — a diferencia del formulario público `ArcoRequest.jsx`
 * (pensado para alguien SIN sesión), un usuario ya autenticado no necesita confirmar su
 * correo (la sesión ya es prueba de eso) y queda {@code PENDING} de inmediato; si el tipo
 * exige identidad fuerte, debe volver a escribir su contraseña.
 */
export default function MyArcoRequests() {
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
            Historial de las solicitudes de derechos ARCO que has levantado con tu cuenta.
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
            {requests.map((req) => <RequestRow key={req.id} req={req} notify={notify} onAnswered={load} />)}
          </div>
        )}
      </div>

      {showForm && (
        <NewRequestModal
          notify={notify}
          confirmDialog={confirmDialog}
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

/** Una fila del historial — incluye el formulario de respuesta si está esperando información. */
function RequestRow({ req, notify, onAnswered }) {
  const status = ARCO_STATUS_LABELS[req.status]
  const [answer, setAnswer] = useState('')
  const [answering, setAnswering] = useState(false)

  async function handleAnswer() {
    if (!answer.trim()) { notify('Escribe tu respuesta', 'error'); return }
    setAnswering(true)
    try {
      await answerMyArcoInfo(req.id, answer.trim())
      notify('Respuesta enviada', 'success')
      setAnswer('')
      onAnswered()
    } catch (err) {
      notify(err.response?.data?.message || 'No se pudo enviar tu respuesta', 'error')
    } finally {
      setAnswering(false)
    }
  }

  return (
    <div className="px-5 py-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{ARCO_TYPE_LABELS[req.type]}</span>
        <span className="text-xs text-gray-400 ml-auto">{fmtDate(req.createdAt)}</span>
      </div>
      {req.details && <p className="text-sm text-gray-600 whitespace-pre-wrap">{req.details}</p>}
      {req.dueDate && req.status !== 'COMPLETED' && req.status !== 'REJECTED' && req.status !== 'NOT_FILED' && (
        <p className="text-xs text-gray-400">Plazo de respuesta: {fmtDay(req.dueDate)}</p>
      )}

      {req.status === 'INFO_REQUESTED' && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 space-y-2">
          <p className="text-sm text-orange-900"><span className="font-semibold">Nos falta esto de tu parte:</span> {req.infoRequest}</p>
          {req.infoDue && <p className="text-xs text-orange-700">Respóndenos antes del {fmtDay(req.infoDue)}.</p>}
          <textarea
            className="input" rows={2} maxLength={2000} value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Escribe tu respuesta"
          />
          <button type="button" className="btn-primary text-sm" disabled={answering} onClick={handleAnswer}>
            {answering ? 'Enviando...' : 'Enviar respuesta'}
          </button>
        </div>
      )}

      {req.outcome && (
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Respondida {fmtDate(req.resolvedAt)} — {req.outcome}
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.resolutionNotes}</p>
        </div>
      )}
      {req.status === 'COMPLETED' && req.executionSummary && (
        <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-1">Qué se hizo</p>
          <p className="text-sm text-green-800 whitespace-pre-wrap">{req.executionSummary}</p>
        </div>
      )}
    </div>
  )
}

/** Modal "+ Nueva solicitud": solo pide lo que la cuenta en sesión no puede inferir sola. */
function NewRequestModal({ notify, confirmDialog, onClose, onCreated }) {
  const { user } = useAuth()
  const [type, setType] = useState('')
  const [phone, setPhone] = useState('')
  const [details, setDetails] = useState('')
  const [representative, setRepresentative] = useState(false)
  const [representativeName, setRepresentativeName] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  useEscapeClose(true, onClose)

  const needsPassword = type && ARCO_STRONG_IDENTITY_TYPES.includes(type)

  async function handleSubmit(e) {
    e.preventDefault()
    const errors = {}
    if (!type) errors.type = 'Elige qué tipo de solicitud quieres hacer'
    if (phone && phone.length !== 10) errors.phone = 'El teléfono debe tener 10 dígitos'
    if (representative && !representativeName.trim()) errors.representativeName = 'Escribe el nombre de quien representas'
    if (needsPassword && !password) errors.password = 'Vuelve a escribir tu contraseña para confirmar que eres tú'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    if (!(await confirmDialog('¿Confirmas enviar esta solicitud ARCO?', { confirmText: 'Enviar solicitud', danger: false }))) return

    setSaving(true)
    try {
      await createMyArcoRequest({
        requesterPhone: phone || undefined,
        type,
        details: details.trim() || undefined,
        representative,
        representativeName: representative ? representativeName.trim() : undefined,
        password: needsPassword ? password : undefined,
        acceptPrivacyNotice: true,
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <ModalCloseButton onClick={onClose} />
        <div className="pr-8">
          <h2 className="text-lg font-bold text-gray-900">Nueva solicitud ARCO</h2>
          <p className="text-xs text-gray-400 mt-1">Se manda a nombre de {user?.name} ({user?.email}).</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué quieres hacer?</label>
          <div className="space-y-2">
            {ARCO_TYPES.map(([value, label, hint]) => (
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

        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={representative} onChange={(e) => setRepresentative(e.target.checked)} />
          Estoy haciendo esta solicitud a nombre de alguien más (soy su representante)
        </label>
        {representative && (
          <div>
            <input
              type="text" className="input" placeholder="Nombre de la persona a la que representas"
              value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)}
            />
            {fieldErrors.representativeName && <p className="text-red-600 text-xs mt-1">{fieldErrors.representativeName}</p>}
          </div>
        )}

        {needsPassword && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirma tu contraseña</label>
            <input
              type="password" className="input" value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <p className="text-xs text-gray-400 mt-1">Este tipo de solicitud expone/altera datos sensibles — necesitamos confirmar que de verdad eres tú.</p>
            {fieldErrors.password && <p className="text-red-600 text-xs mt-1">{fieldErrors.password}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Enviando...' : 'Enviar solicitud'}</button>
        </div>
      </form>
    </div>
  )
}
