import { useEffect, useState } from 'react'
import { getCashCutNonCashRefunds } from '../../api/cashCuts'

const METHOD = { CARD: 'Tarjeta', TRANSFER: 'Transferencia' }

/** Devoluciones con tarjeta o transferencia hechas en un turno. `reloadKey` vuelve a pedirlas. */
export function useNonCashRefunds(cutId, reloadKey) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!cutId) return
    getCashCutNonCashRefunds(cutId).then((r) => setRows(r.data.data ?? [])).catch(() => setRows([]))
  }, [cutId, reloadKey])
  return rows
}

function concept(r) {
  const method = METHOD[r.paymentMethod] ?? r.paymentMethod
  if (r.apartadoFolio == null) return `Devolución venta folio ${r.folio} · ${method}`
  const what = r.kind !== 'DEPOSIT' ? 'saldo' : r.installment ? 'abono' : 'anticipo'
  return `Devolución apartado #${r.apartadoFolio} (${what}, venta folio ${r.folio}) · ${method}`
}

/**
 * Convierte las devoluciones en filas con la forma de un movimiento de caja, para mostrarlas
 * en la misma tabla. No son un movimiento: el dinero no sale de la caja, por eso `cashEffect`
 * es 0 y el monto va sin signo.
 */
export function nonCashRefundsToMovements(rows) {
  return rows.map((r) => ({
    id: `non-cash-refund-${r.id}`,
    saleId: r.id,
    type: 'NON_CASH_REFUND',
    createdAt: r.refundedAt,
    concept: concept(r),
    detail: 'No es efectivo: no cambia el efectivo esperado',
    registeredBy: r.refundedByName ? { name: r.refundedByName } : null,
    amount: Math.abs(Number(r.amount ?? 0)),
    cashEffect: 0,
  }))
}
