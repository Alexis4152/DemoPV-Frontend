import { useEffect, useState } from 'react'
import {
  getArcoRequests, createArcoRequestInPerson, verifyArcoIdentity, requestArcoInfo,
  extendArcoRequest, respondArcoRequest, executeArcoRequest, openArcoConstancia,
} from '../api/arco'
import { useNotify } from '../context/NotifyContext'
import useEscapeClose from '../hooks/useEscapeClose'
import {
  ARCO_TYPES, ARCO_TYPE_LABELS, ARCO_STATUS_LABELS, ARCO_CHANNEL_LABELS,
  ARCO_TYPE_GUIDANCE, ARCO_STRONG_IDENTITY_TYPES,
} from '../utils/arcoTypes'

const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const fmtDay = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—'

const FILTERS = [
  ['', 'Todas'], ['PENDING_EMAIL', 'Falta confirmar'], ['PENDING', 'Pendientes'],
  ['INFO_REQUESTED', 'Esperando info'], ['APPROVED', 'Por ejecutar'], ['COMPLETED', 'Completadas'],
  ['REJECTED', 'Rechazadas'], ['NOT_FILED', 'No presentadas'],
]

/**
 * Pantalla "Solicitudes ARCO": administra todo el ciclo de vida legal de las solicitudes de
 * derechos ARCO — verificar identidad, pedir información, extender el plazo, responder
 * (resultado legal) y ejecutar — además de registrar solicitudes en mostrador. Exclusiva de
 * SUPER_ADMIN (ver `PrivateRoute superAdminOnly` en `App.jsx`) — es una obligación legal de
 * la plataforma completa, no algo por tienda.
 */
export default function ArcoRequests() {
  const { notify } = useNotify()
  const [filter, setFilter] = useState('')
  const [requests, setRequests] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [showInPerson, setShowInPerson] = useState(false)

  function load() {
    setLoading(true)
    getArcoRequests(filter).then((r) => setRequests(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-2xl font-bold text-gray-900">Solicitudes ARCO</h2>
        <button type="button" className="btn-primary" onClick={() => setShowInPerson(true)}>+ Registrar en mostrador</button>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Acceso, Rectificación, Cancelación, Oposición, Revocación y Limitación sobre datos personales. Aplica a toda la
        plataforma, no a una tienda en particular.
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
            {requests.map((req) => (
              <RequestRow
                key={req.id}
                req={req}
                expanded={expandedId === req.id}
                onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
                notify={notify}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </div>

      {showInPerson && (
        <InPersonModal notify={notify} onClose={() => setShowInPerson(false)} onCreated={() => { setShowInPerson(false); load() }} />
      )}
    </div>
  )
}

function RequestRow({ req, expanded, onToggle, notify, onChanged }) {
  const status = ARCO_STATUS_LABELS[req.status]
  return (
    <div>
      <div className="px-5 py-4 cursor-pointer hover:bg-gray-50/70 flex flex-wrap items-center gap-3" onClick={onToggle}>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{ARCO_TYPE_LABELS[req.type]}</span>
        <span className="text-[10px] font-medium text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">{ARCO_CHANNEL_LABELS[req.channel]}</span>
        <span className="font-medium text-gray-800">{req.requesterName}</span>
        <span className="text-sm text-gray-500">{req.requesterEmail || '(sin correo)'}</span>
        {req.requesterPhone && <span className="text-sm text-gray-400">{req.requesterPhone}</span>}
        <span className="text-xs text-gray-400 ml-auto">{fmtDate(req.createdAt)}</span>
      </div>
      {expanded && <RequestDetail req={req} notify={notify} onChanged={onChanged} onClose={onToggle} />}
    </div>
  )
}

function RequestDetail({ req, notify, onChanged, onClose }) {
  const guidance = ARCO_TYPE_GUIDANCE[req.type]
  const needsIdentity = ARCO_STRONG_IDENTITY_TYPES.includes(req.type)
  const canRespond = req.status === 'PENDING'
  const canRequestInfo = req.status === 'PENDING'
  const canExtend = req.status === 'PENDING' && !req.extended
  const canExecute = req.status === 'APPROVED'
  const hasPdf = req.status === 'COMPLETED' || req.status === 'REJECTED'

  return (
    <div className="px-5 pb-5 bg-gray-50/60 space-y-3">
      <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-3 space-y-1.5">
        <p className="text-sm text-purple-900"><span className="font-semibold">¿Qué es "{ARCO_TYPE_LABELS[req.type]}"?</span> {guidance.meaning}</p>
        <p className="text-sm text-purple-800"><span className="font-semibold">Cómo resolverlo:</span> {guidance.howTo}</p>
      </div>

      {req.representative && (
        <p className="text-sm text-gray-600"><span className="font-semibold">Actúa a nombre de:</span> {req.representativeName}</p>
      )}
      {req.details && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Detalle de la persona</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.details}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-500 bg-white border border-gray-100 rounded-lg px-3 py-2">
        {req.receivedAt && <div><span className="block text-gray-400">Recibida</span>{fmtDate(req.receivedAt)}</div>}
        {req.dueDate && <div><span className="block text-gray-400">Plazo respuesta{req.extended ? ' (extendido)' : ''}</span>{fmtDay(req.dueDate)}</div>}
        {req.executionDue && <div><span className="block text-gray-400">Plazo ejecución</span>{fmtDay(req.executionDue)}</div>}
        {req.createdByName && <div><span className="block text-gray-400">Registrada por</span>{req.createdByName}</div>}
      </div>

      {/* ── Identidad ───────────────────────────────────────────────────────────── */}
      {req.identityVerifiedAt ? (
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600">
          <span className="font-semibold text-gray-700">Identidad verificada</span> — {req.identityMethod}, {fmtDate(req.identityVerifiedAt)}.
          {req.identityNotes && <p className="mt-0.5">{req.identityNotes}</p>}
        </div>
      ) : needsIdentity && !['COMPLETED', 'REJECTED', 'NOT_FILED'].includes(req.status) ? (
        <VerifyIdentityForm id={req.id} notify={notify} onChanged={onChanged} />
      ) : null}

      {/* ── Esperando información del titular ──────────────────────────────────── */}
      {req.status === 'INFO_REQUESTED' && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-sm text-orange-900">
          <p><span className="font-semibold">Se le pidió:</span> {req.infoRequest}</p>
          {req.infoDue && <p className="text-xs text-orange-700 mt-1">Debe responder antes del {fmtDay(req.infoDue)}.</p>}
        </div>
      )}
      {req.infoResponse && (
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Respondió</p>
          <p className="text-gray-700 whitespace-pre-wrap">{req.infoResponse}</p>
        </div>
      )}

      {/* ── Respuesta legal ya decidida ─────────────────────────────────────────── */}
      {req.outcome && (
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Respondida por {req.resolvedByName || '—'} · {fmtDate(req.resolvedAt)} · {req.outcome}
          </p>
          <p className="text-gray-700 whitespace-pre-wrap">{req.resolutionNotes}</p>
          {req.legalBasis && <p className="text-gray-500 text-xs mt-1"><span className="font-semibold">Motivo:</span> {req.legalBasis}</p>}
        </div>
      )}
      {req.executionSummary && (
        <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-1">
            Ejecutada por {req.executedByName || '—'} · {fmtDate(req.executedAt)}
          </p>
          <p className="text-green-800 whitespace-pre-wrap">{req.executionSummary}</p>
        </div>
      )}

      {/* ── Acciones ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 pt-1">
        {canRequestInfo && <RequestInfoButton id={req.id} notify={notify} onChanged={onChanged} />}
        {canExtend && <ExtendButton id={req.id} notify={notify} onChanged={onChanged} />}
        {hasPdf && (
          <button type="button" className="btn-secondary text-sm" onClick={() => openArcoConstancia(req.id).catch(() => notify('No se pudo abrir la constancia', 'error'))}>
            📄 Ver constancia
          </button>
        )}
      </div>

      {canRespond && <RespondForm id={req.id} notify={notify} onChanged={onChanged} onClose={onClose} />}
      {canExecute && <ExecuteForm id={req.id} notify={notify} onChanged={onChanged} onClose={onClose} />}
    </div>
  )
}

function VerifyIdentityForm({ id, notify, onChanged }) {
  const [method, setMethod] = useState('IN_PERSON')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!notes.trim()) { notify('Explica cómo verificaste su identidad', 'error'); return }
    setSaving(true)
    try {
      await verifyArcoIdentity(id, { method, notes: notes.trim() })
      notify('Identidad verificada', 'success')
      onChanged()
    } catch (err) {
      notify(err.response?.data?.message || 'No se pudo verificar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-2">
      <p className="text-sm text-amber-900 font-semibold">Este tipo de solicitud necesita verificar identidad antes de poder responderla</p>
      <div className="flex gap-2">
        <select className="input !w-auto" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="IN_PERSON">En persona</option>
          <option value="PHONE">Por teléfono</option>
          <option value="PASSWORD">Contraseña</option>
          <option value="OTHER">Otro</option>
        </select>
        <input className="input flex-1" placeholder="Cómo la verificaste" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button type="button" className="btn-primary text-sm" disabled={saving} onClick={submit}>
        {saving ? 'Guardando...' : 'Marcar identidad verificada'}
      </button>
    </div>
  )
}

function RequestInfoButton({ id, notify, onChanged }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!text.trim()) { notify('Explica qué información necesitas', 'error'); return }
    setSaving(true)
    try {
      await requestArcoInfo(id, { infoRequest: text.trim() })
      notify('Se le pidió información al titular', 'success')
      onChanged()
    } catch (err) {
      notify(err.response?.data?.message || 'No se pudo enviar', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(true)}>Pedir información</button>
  }
  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 space-y-2">
      <textarea className="input" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Qué necesitas que te confirme/envíe" />
      <div className="flex gap-2">
        <button type="button" className="btn-primary text-sm" disabled={saving} onClick={submit}>{saving ? 'Enviando...' : 'Enviar'}</button>
        <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  )
}

function ExtendButton({ id, notify, onChanged }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!reason.trim()) { notify('Explica por qué necesitas más plazo', 'error'); return }
    setSaving(true)
    try {
      await extendArcoRequest(id, { reason: reason.trim() })
      notify('Plazo extendido', 'success')
      onChanged()
    } catch (err) {
      notify(err.response?.data?.message || 'No se pudo extender', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(true)}>Extender plazo (+20 días hábiles)</button>
  }
  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 space-y-2">
      <input className="input" placeholder="Motivo de la extensión" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" className="btn-primary text-sm" disabled={saving} onClick={submit}>{saving ? 'Guardando...' : 'Extender'}</button>
        <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  )
}

function RespondForm({ id, notify, onChanged, onClose }) {
  const { confirmDialog } = useNotify()
  const [outcome, setOutcome] = useState('PROCEDENTE')
  const [legalBasis, setLegalBasis] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!notes.trim()) { notify('Explica tu respuesta — queda como constancia', 'error'); return }
    if (outcome !== 'PROCEDENTE' && !legalBasis.trim()) { notify('Explica el motivo/fundamento', 'error'); return }
    if (!(await confirmDialog(`¿Confirmas responder esta solicitud como "${outcome}"? No se puede deshacer.`, { confirmText: 'Confirmar', danger: outcome === 'IMPROCEDENTE' }))) return
    setSaving(true)
    try {
      await respondArcoRequest(id, { outcome, legalBasis: legalBasis.trim() || undefined, notes: notes.trim() })
      notify('Solicitud respondida', 'success')
      onClose()
      onChanged()
    } catch (err) {
      notify(err.response?.data?.message || 'No se pudo responder', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Responder</p>
      <div className="flex gap-2">
        {['PROCEDENTE', 'PARCIAL', 'IMPROCEDENTE'].map((o) => (
          <button
            key={o} type="button" onClick={() => setOutcome(o)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              outcome === o ? (o === 'IMPROCEDENTE' ? 'bg-red-600 text-white' : 'bg-green-600 text-white') : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
      {outcome !== 'PROCEDENTE' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Motivo/fundamento (obligatorio)</label>
          <textarea className="input" rows={2} maxLength={2000} value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Respuesta (queda como constancia)</label>
        <textarea className="input" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button type="button" className="btn-primary" disabled={saving} onClick={submit}>{saving ? 'Guardando...' : 'Guardar respuesta'}</button>
    </div>
  )
}

function ExecuteForm({ id, notify, onChanged, onClose }) {
  const { confirmDialog } = useNotify()
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!summary.trim()) { notify('Describe qué hiciste — queda como constancia', 'error'); return }
    if (!(await confirmDialog('¿Confirmas ejecutar esta solicitud? No se puede deshacer.', { confirmText: 'Ejecutar' }))) return
    setSaving(true)
    try {
      await executeArcoRequest(id, { summary: summary.trim() })
      notify('Solicitud ejecutada y completada', 'success')
      onClose()
      onChanged()
    } catch (err) {
      notify(err.response?.data?.message || 'No se pudo ejecutar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Ejecutar</p>
      <textarea className="input" rows={2} maxLength={2000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Qué hiciste para cumplir la respuesta" />
      <button type="button" className="btn-primary" disabled={saving} onClick={submit}>{saving ? 'Ejecutando...' : 'Ejecutar y completar'}</button>
    </div>
  )
}

/** Modal "+ Registrar en mostrador": para alguien que el personal verificó físicamente, con o sin cuenta. */
function InPersonModal({ notify, onClose, onCreated }) {
  const [form, setForm] = useState({
    requesterName: '', requesterEmail: '', requesterPhone: '', type: '', details: '',
    representative: false, representativeName: '', identityNotes: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  useEscapeClose(true, onClose)

  async function handleSubmit(e) {
    e.preventDefault()
    const errors = {}
    if (!form.requesterName.trim()) errors.requesterName = 'El nombre es obligatorio'
    if (!form.type) errors.type = 'Elige qué tipo de solicitud quiere hacer'
    if (form.requesterPhone && form.requesterPhone.length !== 10) errors.requesterPhone = 'El teléfono debe tener 10 dígitos'
    if (form.representative && !form.representativeName.trim()) errors.representativeName = 'Escribe el nombre de a quién representa'
    if (!form.identityNotes.trim()) errors.identityNotes = 'Explica cómo verificaste su identidad'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    try {
      await createArcoRequestInPerson({
        requesterName: form.requesterName.trim(),
        requesterEmail: form.requesterEmail.trim() || undefined,
        requesterPhone: form.requesterPhone.trim() || undefined,
        type: form.type,
        details: form.details.trim() || undefined,
        representative: form.representative,
        representativeName: form.representative ? form.representativeName.trim() : undefined,
        identityNotes: form.identityNotes.trim(),
      })
      notify('Solicitud registrada', 'success')
      onCreated()
    } catch (err) {
      notify(err.response?.data?.message || 'No se pudo registrar la solicitud', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Registrar solicitud en mostrador</h2>
          <p className="text-xs text-gray-400 mt-1">Para alguien que verificaste físicamente — con o sin cuenta en el sistema.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input className="input" value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} />
          {fieldErrors.requesterName && <p className="text-red-600 text-xs mt-1">{fieldErrors.requesterName}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Correo (opcional)</label>
          <input className="input" value={form.requesterEmail} onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })} />
          <p className="text-xs text-gray-400 mt-1">Si corresponde a una cuenta existente, queda ligada automáticamente.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono (opcional)</label>
          <input className="input" inputMode="numeric" maxLength={10} value={form.requesterPhone} onChange={(e) => setForm({ ...form, requesterPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          {fieldErrors.requesterPhone && <p className="text-red-600 text-xs mt-1">{fieldErrors.requesterPhone}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué quiere hacer?</label>
          <div className="space-y-2">
            {ARCO_TYPES.map(([value, label]) => (
              <label key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${form.type === value ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="type" checked={form.type === value} onChange={() => setForm({ ...form, type: value })} />
                {label}
              </label>
            ))}
          </div>
          {fieldErrors.type && <p className="text-red-600 text-xs mt-1">{fieldErrors.type}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Detalle (opcional)</label>
          <textarea className="input" rows={2} maxLength={2000} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={form.representative} onChange={(e) => setForm({ ...form, representative: e.target.checked })} />
          Actúa a nombre de alguien más
        </label>
        {form.representative && (
          <div>
            <input className="input" placeholder="Nombre de a quién representa" value={form.representativeName} onChange={(e) => setForm({ ...form, representativeName: e.target.value })} />
            {fieldErrors.representativeName && <p className="text-red-600 text-xs mt-1">{fieldErrors.representativeName}</p>}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cómo verificaste su identidad</label>
          <input className="input" placeholder="Ej. INE mostrada en mostrador" value={form.identityNotes} onChange={(e) => setForm({ ...form, identityNotes: e.target.value })} />
          {fieldErrors.identityNotes && <p className="text-red-600 text-xs mt-1">{fieldErrors.identityNotes}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
        </div>
      </form>
    </div>
  )
}
