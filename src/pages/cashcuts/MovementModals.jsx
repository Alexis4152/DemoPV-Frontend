import { useState } from 'react'
import { addCashCutMovement } from '../../api/cashCuts'
import { useAuth } from '../../context/AuthContext'
import { useNotify } from '../../context/NotifyContext'
import {
  AmountField, DestinationSelect, Modal, PersonSelect, ReceiptInput, fmt, fmtDate, toAmount, MAX_AMOUNT,
} from './common'

/**
 * Registrar entrada de efectivo en el corte: un aporte de una persona (que la tienda le
 * debe regresar: genera un reembolso pendiente) o cambio/fondo extra que no se reembolsa.
 * `preset` precarga monto y motivo cuando viene del atajo "¿Alguien pagó con su propio dinero?".
 */
export function EntryModal({ cut, people, preset, onClose, onSaved }) {
  const { user } = useAuth()
  const { notify } = useNotify()
  const [type, setType] = useState('CONTRIBUTION')
  const [amount, setAmount] = useState(preset?.amount != null ? String(preset.amount) : '')
  const [personId, setPersonId] = useState(user?.id ?? null)
  const [concept, setConcept] = useState(preset?.concept ?? '')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const amountNum = toAmount(amount)
  const personName = people.find((p) => p.id === personId)?.name

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (amountNum == null || amountNum <= 0) errs.amount = 'Captura un monto mayor a cero'
    if (amountNum != null && amountNum > MAX_AMOUNT) errs.amount = ''
    if (type === 'CONTRIBUTION' && !personId) errs.person = 'Indica quién puso el dinero'
    if (type === 'CONTRIBUTION' && !concept.trim()) errs.concept = 'Escribe el motivo'
    if (concept.length > 150) errs.concept = 'El motivo no puede tener más de 150 caracteres'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setLoading(true)
    try {
      await addCashCutMovement(cut.id, {
        type, amount: amountNum, concept: concept.trim() || null,
        personId: type === 'CONTRIBUTION' ? personId : null,
      })
      notify('Entrada registrada', 'success')
      onSaved()
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo registrar la entrada', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Registrar entrada de efectivo" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-gray-600 mb-1">Tipo de entrada</legend>
          {[
            { value: 'CONTRIBUTION', title: 'Aporte de una persona', desc: 'Alguien puso dinero de su bolsa; la tienda se lo debe regresar.' },
            { value: 'FLOAT', title: 'Cambio o fondo extra', desc: 'Dinero que se agrega a la caja y no se reembolsa.' },
          ].map((o) => (
            <label key={o.value} className={`flex gap-3 items-start p-3 rounded-xl cursor-pointer ${type === o.value ? 'border-2 border-purple-600 bg-purple-50' : 'border border-gray-200'}`}>
              <input type="radio" name="entry-type" className="mt-1 w-4 h-4" checked={type === o.value} onChange={() => setType(o.value)} />
              <span><span className="block font-semibold text-sm">{o.title}</span><span className="block text-sm text-gray-500">{o.desc}</span></span>
            </label>
          ))}
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AmountField id="entry-amount" label="Monto ($)" value={amount} onChange={setAmount} error={errors.amount} />
          {type === 'CONTRIBUTION' && (
            <div>
              <PersonSelect id="entry-person" label="¿Quién puso el dinero?" people={people} value={personId} onChange={setPersonId} />
              {errors.person && <p className="text-red-600 text-xs mt-1">{errors.person}</p>}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="entry-concept" className="text-xs font-medium text-gray-600 block mb-1">
            Motivo {type === 'CONTRIBUTION' ? <span className="text-red-500">*</span> : '(opcional)'}
          </label>
          <input id="entry-concept" className="input" value={concept} onChange={(e) => setConcept(e.target.value)} />
          {errors.concept && <p className="text-red-600 text-xs mt-1">{errors.concept}</p>}
        </div>

        {type === 'CONTRIBUTION' && (
          <p className="text-sm text-amber-900 bg-amber-50 rounded-lg p-3">
            Quedará como <strong>reembolso pendiente</strong>{personName ? ` a nombre de ${personName}` : ''} hasta que se le pague.
          </p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="bg-green-700 hover:bg-green-800 text-white font-medium px-4 py-2 rounded-lg disabled:opacity-50" disabled={loading}>
            {loading ? '...' : 'Registrar entrada'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Registrar salida de efectivo en el corte, en pestañas: Gasto, Retiro (solo admin/
 * supervisor) y Reembolso (solo si hay reembolsos pendientes). Ninguna salida puede
 * exceder el efectivo disponible; si un gasto lo excede, se ofrece registrar primero el
 * aporte de quien pagó con su dinero (`onNeedEntry`).
 */
export function ExitModal({ cut, available, blind = false, reimbursements, people, isAdmin, onClose, onSaved, onNeedEntry }) {
  const { user } = useAuth()
  const { notify } = useNotify()
  const tabs = [
    { key: 'EXPENSE', label: 'Gasto' },
    ...(isAdmin ? [{ key: 'WITHDRAWAL', label: 'Retiro' }] : []),
    ...(reimbursements.length > 0 ? [{ key: 'REIMBURSEMENT', label: 'Reembolso', count: reimbursements.length }] : []),
  ]
  const [tab, setTab] = useState('EXPENSE')
  const [amount, setAmount] = useState('')
  const [concept, setConcept] = useState('')
  const [personId, setPersonId] = useState(user?.id ?? null)
  const [destination, setDestination] = useState(null)
  const [reference, setReference] = useState('')
  const [receiptPath, setReceiptPath] = useState('')
  const [reimbursementId, setReimbursementId] = useState(reimbursements[0]?.id ?? null)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const selectedReimbursement = reimbursements.find((r) => r.id === reimbursementId)
  const amountNum = tab === 'REIMBURSEMENT' ? Number(selectedReimbursement?.amount ?? 0) : toAmount(amount)
  const availableNum = Number(available ?? 0)
  // Con conteo ciego no se conoce el disponible: el tope lo valida solo el backend.
  const exceeds = !blind && amountNum != null && amountNum > availableNum
  const shortfall = exceeds ? Math.round((amountNum - availableNum) * 100) / 100 : 0

  function switchTab(key) {
    setTab(key)
    setErrors({})
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (tab !== 'REIMBURSEMENT' && (amountNum == null || amountNum <= 0)) errs.amount = 'Captura un monto mayor a cero'
    if (tab !== 'REIMBURSEMENT' && amountNum != null && amountNum > MAX_AMOUNT) errs.amount = ''
    if (tab === 'EXPENSE' && !concept.trim()) errs.concept = 'Escribe el concepto del gasto'
    if (concept.length > 150) errs.concept = 'El concepto no puede tener más de 150 caracteres'
    if (tab === 'WITHDRAWAL' && !destination) errs.destination = 'Indica el destino del dinero'
    if (tab === 'REIMBURSEMENT' && !selectedReimbursement) errs.reimbursement = 'Elige el reembolso a pagar'
    if (reference.length > 100) errs.reference = 'La referencia no puede tener más de 100 caracteres'
    setErrors(errs)
    if (Object.keys(errs).length > 0 || exceeds) return
    setLoading(true)
    try {
      const payload = tab === 'REIMBURSEMENT'
        ? { type: 'REIMBURSEMENT', reimbursementId, receiptPath: receiptPath || null }
        : {
            type: tab, amount: amountNum, concept: concept.trim() || null,
            personId: tab === 'WITHDRAWAL' ? personId : null,
            destination: tab === 'WITHDRAWAL' ? destination : null,
            reference: reference.trim() || null, receiptPath: receiptPath || null,
          }
      await addCashCutMovement(cut.id, payload)
      notify(tab === 'REIMBURSEMENT' ? 'Reembolso pagado' : 'Salida registrada', 'success')
      onSaved()
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo registrar la salida', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Registrar salida de efectivo" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {tabs.length > 1 && (
          <div role="tablist" aria-label="Tipo de salida" className="grid gap-1 p-1 bg-gray-100 rounded-xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map((t) => (
              <button
                key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                className={`min-h-[40px] rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${tab === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}
                onClick={() => switchTab(t.key)}
              >
                {t.label}
                {t.count != null && <span className="px-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">{t.count}</span>}
              </button>
            ))}
          </div>
        )}

        {!blind && (
          <div className="flex justify-between items-center bg-gray-50 rounded-lg p-3">
            <span className="text-sm text-gray-600">Disponible en caja ahora</span>
            <span className="font-bold">{fmt(availableNum)}</span>
          </div>
        )}
        {blind && tab === 'EXPENSE' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-amber-900">¿Alguien pagó con su propio dinero? Registra primero su aporte.</p>
            <button type="button" className="btn-secondary text-sm" onClick={() => onNeedEntry({ concept: concept.trim() ? `Para ${concept.trim()}` : '' })}>Registrar aporte</button>
          </div>
        )}

        {tab === 'REIMBURSEMENT' ? (
          <>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-gray-600 mb-1">Reembolsos pendientes</legend>
              {reimbursements.map((r) => (
                <label key={r.id} className={`flex gap-3 items-start p-3 rounded-xl cursor-pointer ${r.id === reimbursementId ? 'border-2 border-purple-600 bg-purple-50' : 'border border-gray-200'}`}>
                  <input type="radio" name="reimbursement" className="mt-1 w-4 h-4" checked={r.id === reimbursementId} onChange={() => setReimbursementId(r.id)} />
                  <span className="flex-1">
                    <span className="flex justify-between gap-2 font-semibold text-sm"><span>{r.person?.name}</span><span>{fmt(r.amount)}</span></span>
                    {r.reason && <span className="block text-sm text-gray-600">{r.reason}</span>}
                    <span className="block text-xs text-gray-500">{r.sourceCutId ? `Corte #${r.sourceCutId} · ` : ''}{fmtDate(r.createdAt)}</span>
                  </span>
                </label>
              ))}
              {errors.reimbursement && <p className="text-red-600 text-xs">{errors.reimbursement}</p>}
            </fieldset>
            <p className="text-sm text-purple-900 bg-purple-50 rounded-lg p-3">
              Se paga completo ({fmt(selectedReimbursement?.amount)}) a {selectedReimbursement?.person?.name}. Al registrar, el reembolso pasa a <strong>Pagado</strong> y queda ligado a esta salida.
            </p>
          </>
        ) : (
          <>
            {tab === 'EXPENSE' && (
              <div>
                <label htmlFor="exit-concept" className="text-xs font-medium text-gray-600 block mb-1">Concepto <span className="text-red-500">*</span></label>
                <input id="exit-concept" className="input" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej. Pago a proveedor de hielo" />
                {errors.concept && <p className="text-red-600 text-xs mt-1">{errors.concept}</p>}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AmountField id="exit-amount" label={tab === 'WITHDRAWAL' ? 'Monto a retirar ($)' : 'Monto ($)'} value={amount} onChange={setAmount} error={errors.amount} />
              {tab === 'WITHDRAWAL' && (
                <PersonSelect id="exit-person" label="¿Quién retira?" people={people} value={personId} onChange={setPersonId} />
              )}
            </div>
            {tab === 'WITHDRAWAL' && (
              <div>
                <DestinationSelect id="exit-destination" value={destination} onChange={setDestination} />
                {errors.destination && <p className="text-red-600 text-xs mt-1">{errors.destination}</p>}
              </div>
            )}
            {tab === 'WITHDRAWAL' && (
              <div>
                <label htmlFor="exit-reference" className="text-xs font-medium text-gray-600 block mb-1">Referencia (opcional)</label>
                <input id="exit-reference" className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Folio del depósito, número de sobre, etc." />
                {errors.reference && <p className="text-red-600 text-xs mt-1">{errors.reference}</p>}
              </div>
            )}
          </>
        )}

        {exceeds && (
          <div className="space-y-3">
            <p className="text-sm text-red-700">Solo hay {fmt(availableNum)} en caja. No se puede sacar más efectivo del que hay.</p>
            {tab === 'EXPENSE' && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2">
                <p className="text-sm font-semibold text-amber-900">¿Alguien pagó con su propio dinero?</p>
                <p className="text-sm text-amber-900">Registra primero la entrada de la diferencia; después podrás registrar esta salida completa.</p>
                <button
                  type="button" className="btn-secondary text-sm"
                  onClick={() => onNeedEntry({ amount: shortfall, concept: concept.trim() ? `Para ${concept.trim()}` : '' })}
                >
                  Registrar entrada de {fmt(shortfall)}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'WITHDRAWAL' && !blind && !exceeds && amountNum > 0 && (
          <p className="text-sm text-blue-900 bg-blue-50 rounded-lg p-3">
            <strong>Un retiro no es un gasto:</strong> no baja la utilidad, solo saca efectivo de la caja. Quedarán {fmt(availableNum - amountNum)} en caja.
          </p>
        )}

        {tab !== 'WITHDRAWAL' && <ReceiptInput value={receiptPath} onChange={setReceiptPath} />}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-danger disabled:opacity-50 disabled:cursor-not-allowed" disabled={loading || exceeds}>
            {loading ? '...' : tab === 'REIMBURSEMENT' ? `Pagar reembolso ${fmt(amountNum)}` : tab === 'WITHDRAWAL' ? 'Registrar retiro' : 'Registrar salida'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
