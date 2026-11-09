const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const round2 = (n) => Math.round(n * 100) / 100

/**
 * Cuánto se queda la tienda al cancelar o devolver un apartado con anticipo (igual que
 * ApartadoService#retention): cambio de opinión → el % del total que decía su ticket, sin
 * pasar de lo pagado (apartados de antes, sin %: lo pagado a cuenta); defectuoso → nada.
 */
export function retainedAmount(apartado, { paid, paidOnAccount, defective }) {
  if (defective) return 0
  const pct = apartado.retentionPercent
  const amount = pct == null ? Number(paidOnAccount ?? 0) : round2(Number(apartado.total ?? 0) * Number(pct) / 100)
  return Math.max(0, Math.min(amount, Number(paid ?? 0)))
}

/**
 * Reparte lo que se devuelve entre los pagos, en el orden en que los devuelve el backend:
 * la venta final primero y luego del abono más reciente al anticipo. Regresa [{payment, amount}].
 */
export function allocateRefund(payments, toRefund) {
  const ordered = [
    ...payments.filter((p) => p.kind !== 'DEPOSIT'),
    ...payments.filter((p) => p.kind === 'DEPOSIT').sort((a, b) => b.saleId - a.saleId),
  ]
  let left = round2(toRefund)
  return ordered.map((p) => {
    const amount = Math.min(left, Number(p.total ?? 0))
    left = round2(left - amount)
    return { payment: p, amount }
  }).filter((x) => x.amount > 0)
}

/**
 * ¿Por qué lo cancela/devuelve? Cambio de opinión (la tienda retiene su %) o defectuoso (se
 * devuelve todo; solo admin/supervisor — `canOverride` —, con motivo obligatorio). Muestra
 * cuánto se retiene y cuánto se devuelve.
 */
export default function ReturnReasonPicker({ apartado, paid, paidOnAccount, canOverride, defective, onChange, help }) {
  const pct = apartado.retentionPercent
  const retained = retainedAmount(apartado, { paid, paidOnAccount, defective: false })
  const back = round2(Number(paid ?? 0) - (defective ? 0 : retained))
  const option = (value, title, desc, disabled) => (
    <label className={`flex gap-2 items-start ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="radio" name="returnReason" className="mt-1" disabled={disabled}
        checked={defective === (value === 'DEFECTIVE')} onChange={() => onChange(value === 'DEFECTIVE')} />
      <span>
        <span className="block font-medium text-gray-800">{title}</span>
        <span className="block text-xs text-gray-500">{desc}</span>
      </span>
    </label>
  )
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm space-y-2">
      <p className="text-xs font-medium text-gray-600">¿Por qué lo regresa?</p>
      {option('CHANGE_OF_MIND', 'Cambió de opinión',
        pct == null
          ? 'La tienda se queda con lo pagado a cuenta (anticipo y abonos): así lo decía el ticket de este apartado.'
          : `La tienda retiene el ${Number(pct)} % del total del apartado (${fmt(Number(apartado.total) * Number(pct) / 100)}), sin pasar de lo pagado.`)}
      {option('DEFECTIVE', 'Defectuoso o en mal estado',
        `Se devuelve todo, sin retención. Solo administrador o supervisor, con motivo obligatorio.${canOverride ? '' : ' Pídele a uno que lo registre.'}`,
        !canOverride)}
      <p className="text-gray-800 border-t border-gray-200 pt-2">
        Pagado: <strong>{fmt(paid)}</strong>
        {!defective && <> · La tienda retiene <strong>{fmt(retained)}</strong></>}
        {' '}· Se devuelven <strong>{fmt(back)}</strong>
      </p>
      {help && <p className="text-xs text-gray-500">{help}</p>}
    </div>
  )
}
