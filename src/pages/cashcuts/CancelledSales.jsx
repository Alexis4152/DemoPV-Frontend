import { useEffect, useState } from 'react'
import { getCashCutCancelledSales } from '../../api/cashCuts'

const METHOD = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }

/**
 * Ventas canceladas de un turno, con quién las canceló. `reloadKey` vuelve a pedirlas
 * (p. ej. tras registrar algo en el turno).
 */
export function useCancelledSales(cutId, reloadKey) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!cutId) return
    getCashCutCancelledSales(cutId).then((r) => setRows(r.data.data ?? [])).catch(() => setRows([]))
  }, [cutId, reloadKey])
  return rows
}

/**
 * Convierte las ventas canceladas en filas con la forma de un movimiento de caja, para
 * mostrarlas en la misma tabla que las devoluciones. Una cancelación no es un movimiento:
 * la venta simplemente deja de contar en las ventas del turno. Por eso `cashEffect` lleva
 * lo que cambió el efectivo esperado: la venta en efectivo lo baja; la de tarjeta o
 * transferencia no lo toca (0).
 */
export function cancelledToMovements(rows) {
  return rows.map((r) => ({
    id: `cancelled-${r.id}`,
    saleId: r.id,
    type: 'CANCELLED_SALE',
    createdAt: r.cancelledAt,
    concept: r.kind === 'DEPOSIT'
      ? `Anticipo cancelado folio ${r.folio} · apartado #${r.apartadoFolio} · ${METHOD[r.paymentMethod] ?? r.paymentMethod}`
      : `Venta cancelada folio ${r.folio} · ${METHOD[r.paymentMethod] ?? r.paymentMethod}`,
    detail: r.paymentMethod === 'CASH'
      ? 'Ya no cuenta en las ventas en efectivo del turno'
      : 'No era efectivo: no cambia el efectivo esperado',
    registeredBy: r.cancelledByName ? { name: r.cancelledByName } : null,
    amount: Math.abs(Number(r.total ?? 0)),
    cashEffect: r.paymentMethod === 'CASH' ? -Number(r.total ?? 0) : 0,
    byOther: r.byOther,
  }))
}

/**
 * Aviso cuando alguien distinto al cajero del turno (p. ej. un administrador) canceló ventas
 * del turno: dice quién, para que el cajero sepa por qué cambió su esperado.
 */
export function CancelledByOtherNotice({ rows }) {
  const others = rows.filter((r) => r.byOther)
  if (others.length === 0) return null
  const byName = {}
  others.forEach((r) => { byName[r.cancelledByName ?? 'Alguien más'] = (byName[r.cancelledByName ?? 'Alguien más'] ?? 0) + 1 })
  const who = Object.entries(byName).map(([name, n]) => `${name} canceló ${n === 1 ? 'una venta' : `${n} ventas`}`).join('; ')
  return (
    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      {who} de este turno: aparecen en los movimientos como «Venta cancelada».
    </p>
  )
}
