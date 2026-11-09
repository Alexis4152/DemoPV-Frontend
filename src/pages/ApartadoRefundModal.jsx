import { useEffect, useState } from 'react'
import { getApartadoPayments, refundApartado } from '../api/apartados'
import { useNotify } from '../context/NotifyContext'
import useEscapeClose from '../hooks/useEscapeClose'
import ModalCloseButton from '../components/ModalCloseButton'
import ItemOutcomePicker, { outcomesPayload } from '../components/ItemOutcomePicker'
import NoOpenCutNotice, { useMyOpenCut } from '../components/NoOpenCutNotice'
import ReturnReasonPicker, { allocateRefund, retainedAmount } from '../components/ReturnReasonPicker'
import { useAuth } from '../context/AuthContext'
import { isManagement } from '../utils/roleLabels'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const METHOD = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }
const KIND = { DEPOSIT: 'Anticipo', BALANCE: 'Liquidación', REGULAR: 'Liquidación' }
const kindLabel = (p) => (p.installment ? 'Abono' : KIND[p.kind] ?? 'Pago')
const isPaid = (p) => p.status === 'COMPLETED' && !p.refundedAt
/**
 * Devolver un apartado ya completado: el cliente lo recogió y lo regresa (ver
 * ApartadoService#refund). Con anticipo: cambio de opinión → la tienda retiene su %;
 * defectuoso (admin/supervisor) → se devuelve todo. Por producto: regresa / merma / no regresó.
 */
export default function ApartadoRefundModal({ apartado, onClose, onDone }) {
  const { notify, confirmDialog } = useNotify()
  const { user } = useAuth()
  const [payments, setPayments] = useState(null)
  const [outcomes, setOutcomes] = useState({})
  const [defective, setDefective] = useState(false)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  useEscapeClose(!saving, onClose)

  useEffect(() => {
    getApartadoPayments(apartado.id).then((r) => setPayments((r.data.data ?? []).filter(isPaid))).catch(() => setPayments([]))
  }, [apartado.id])

  // Entrega parcial: lo que nunca se entregó sigue en la tienda y regresa solo al inventario;
  // solo se pregunta por lo que el cliente sí se llevó.
  const notDelivered = (i) => apartado.pendingDelivery && !i.deliveredAt
  const withStock = (apartado.items ?? []).filter((i) => i.product && !i.product.isMadeToOrder && !i.onOrder)
  const stockItems = withStock.filter((i) => !notDelivered(i))
    .map((i) => ({ id: i.id, name: i.productName, quantity: i.quantity }))
  const staysInStore = withStock.filter(notDelivered)
  const sumOf = (list) => list.reduce((s, p) => s + Number(p.total ?? 0), 0)
  const deposits = (payments ?? []).filter((p) => p.kind === 'DEPOSIT')
  const hasDeposit = deposits.length > 0
  const paid = sumOf(payments ?? [])
  // Con anticipo, la tienda retiene según el motivo (ver ReturnReasonPicker); sin anticipo, todo se devuelve.
  const retained = hasDeposit ? retainedAmount(apartado, { paid, paidOnAccount: sumOf(deposits), defective }) : 0
  const refunds = allocateRefund(payments ?? [], paid - retained)
  const total = refunds.reduce((s, x) => s + x.amount, 0)
  const cash = refunds.filter((x) => x.payment.paymentMethod === 'CASH').reduce((s, x) => s + x.amount, 0)
  // El efectivo sale de la caja de quien devuelve: sin corte abierto no se puede.
  const myCut = useMyOpenCut()
  const blockedNoCut = cash > 0 && myCut === null
  // Límites de devolución para cajeros (Datos de la tienda, ver SaleService#ensureCanRefund):
  // se compara lo que de verdad se devuelve y la fecha de la venta final.
  const tienda = user?.tienda
  const finalSale = (payments ?? []).find((p) => p.kind !== 'DEPOSIT')
  const needsManager = []
  if (!isManagement(user) && payments !== null) {
    if (tienda?.cashierRefundMaxAmount != null && total > Number(tienda.cashierRefundMaxAmount)) {
      needsManager.push(`Las devoluciones de más de ${fmt(tienda.cashierRefundMaxAmount)} las registra un administrador o supervisor.`)
    }
    if (tienda?.cashierRefundMaxDays != null && finalSale?.createdAt) {
      const limit = new Date()
      limit.setHours(0, 0, 0, 0)
      limit.setDate(limit.getDate() - Number(tienda.cashierRefundMaxDays))
      if (new Date(finalSale.createdAt) < limit) needsManager.push(`Se liquidó hace más de ${tienda.cashierRefundMaxDays} días: la devolución la registra un administrador o supervisor.`)
    }
  }
  const blockedByLimit = needsManager.length > 0

  async function submit() {
    const r = reason.trim()
    const errs = {}
    if (!r) errs.reason = defective ? 'Escribe el motivo: qué defecto tiene el producto' : 'Escribe el motivo de la devolución'
    else if (r.length > 300) errs.reason = 'El motivo no puede tener más de 300 caracteres'
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    const cashMsg = cash > 0 ? `Saldrán ${fmt(cash)} en efectivo de tu caja.` : 'No sale efectivo de la caja.'
    if (!(await confirmDialog(`¿Registrar la devolución del apartado #${apartado.folio} por ${fmt(total)}? ${cashMsg}`, { confirmText: 'Registrar devolución' }))) return
    setSaving(true)
    try {
      await refundApartado(apartado.id, {
        reason: r,
        returnReason: hasDeposit ? (defective ? 'DEFECTIVE' : 'CHANGE_OF_MIND') : undefined,
        items: outcomesPayload(stockItems, outcomes),
      })
      notify('Devolución registrada', 'success')
      onDone()
    } catch (err) {
      const data = err.response?.data?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setErrors(data)
        notify(Object.values(data)[0] ?? 'Revisa los campos marcados en rojo', 'error')
      } else {
        notify(err.response?.data?.message ?? 'No se pudo registrar la devolución', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <ModalCloseButton onClick={onClose} disabled={saving} />
        <h3 className="text-lg font-bold mb-1 pr-8">Devolver apartado #{apartado.folio}</h3>
        <p className="text-xs text-gray-500 mb-4">
          {apartado.customerName} ya lo había recogido y lo regresa. Las ventas no se cancelan: se registran como devueltas.
        </p>

        {payments === null ? <p className="text-sm text-gray-400 mb-4">Cargando pagos…</p> : (
          <div className="mb-4 space-y-3">
            {(payments ?? []).length > 0 && (
              <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 text-sm">
                {payments.map((p) => {
                  const back = refunds.find((x) => x.payment.saleId === p.saleId)?.amount ?? 0
                  return (
                    <div key={p.saleId} className="flex justify-between gap-2 px-3 py-2">
                      <span>{kindLabel(p)} · venta #{p.folio} · {METHOD[p.paymentMethod]}</span>
                      <span className="text-right">
                        <span className="font-semibold">{fmt(p.total)}</span>
                        <span className="block text-xs text-gray-500">se devuelven {fmt(back)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            {hasDeposit && (
              <div>
                <ReturnReasonPicker apartado={apartado} paid={paid} paidOnAccount={sumOf(deposits)}
                  canOverride={isManagement(user)} defective={defective}
                  onChange={(on) => {
                    setDefective(on)
                    // Un defectuoso normalmente va a merma: se sugiere, se puede cambiar.
                    if (on) setOutcomes(Object.fromEntries(stockItems.map((i) => [i.id, 'WASTE'])))
                  }}
                  help="Se devuelve con el método con que se cobró cada pago: primero el saldo, luego los abonos y al final el anticipo." />
              </div>
            )}
            {blockedByLimit && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 space-y-1">
                {needsManager.map((reason) => <p key={reason}>{reason}</p>)}
              </div>
            )}
            {blockedNoCut && <NoOpenCutNotice action="devolver efectivo" className="" />}
            <div className={`rounded-lg border px-3 py-2 text-sm ${cash > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
              Se devuelven <strong>{fmt(total)}</strong>
              {cash > 0 ? <> — <strong>{fmt(cash)}</strong> en efectivo salen de <strong>tu caja</strong> (necesitas tu corte abierto).</> : ' — no sale efectivo de la caja.'}
            </div>
          </div>
        )}

        {stockItems.length > 0 && (
          <div className="mb-4">
            <ItemOutcomePicker items={stockItems} value={outcomes} onChange={setOutcomes} />
          </div>
        )}
        {staysInStore.length > 0 && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            <p className="font-medium mb-0.5">No se entregaron: siguen en la tienda y regresan al inventario</p>
            {staysInStore.map((i) => <p key={i.id}>{i.productName} x{Number(i.quantity)}</p>)}
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-600">{defective ? 'Motivo (qué defecto tiene)' : 'Motivo'} <span className={errors.reason ? 'text-red-600' : ''}>*</span></label>
          <textarea className="input" rows={2} value={reason}
            onChange={(e) => { setReason(e.target.value); setErrors(({ reason: _, ...rest }) => rest) }} />
          <p className={`text-xs text-right ${reason.length > 300 ? 'text-red-600' : 'text-gray-400'}`}>{reason.length}/300</p>
          {errors.reason && <p className="text-red-600 text-xs mt-1">{errors.reason}</p>}
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cerrar</button>
          <button type="button" className="btn-primary" disabled={saving || payments === null || blockedByLimit || blockedNoCut || (cash > 0 && myCut === undefined)} onClick={submit}
            title={blockedByLimit ? needsManager.join(' ') : blockedNoCut ? 'Abre un corte de caja para poder devolver efectivo' : undefined}>
            {saving ? 'Guardando...' : 'Registrar devolución'}
          </button>
        </div>
      </div>
    </div>
  )
}
