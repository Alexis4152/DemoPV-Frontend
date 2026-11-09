import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getApartadoPayments } from '../api/apartados'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const METHOD = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }
const KIND = { DEPOSIT: 'Anticipo', BALANCE: 'Liquidación', REGULAR: 'Liquidación' }

// Pagos ya leídos, por apartado y su estado: si el apartado cambia, la clave cambia y no se
// reusan. Al abrir la subtabla se muestran de inmediato y siempre se vuelven a pedir.
const cache = new Map()
const pending = new Map()
const keyOf = (a) => [a.id, a.status, a.saleId, a.depositAmount, a.refundedAt].join('|')

export function loadPayments(apartado) {
  const key = keyOf(apartado)
  if (!pending.has(key)) {
    pending.set(key, getApartadoPayments(apartado.id)
      .then((r) => {
        const rows = r.data.data ?? []
        cache.set(key, rows)
        return rows
      })
      .finally(() => pending.delete(key)))
  }
  return pending.get(key)
}

/** Pide los pagos al acercar el mouse a "Ver pagos", para que ya estén al hacer clic. */
export function prefetchApartadoPayments(apartado) {
  if (!cache.has(keyOf(apartado))) loadPayments(apartado).catch(() => {})
}

// Un cobro cancelado o devuelto ya no cuenta como pagado.
const isPaid = (p) => p.status === 'COMPLETED' && !p.refundedAt

function PaymentStatus({ p }) {
  if (p.status === 'CANCELLED') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Cancelado</span>
  if (p.refundedAt) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{p.refundAmount != null ? `Devuelto ${fmt(p.refundAmount)}` : 'Devuelto'}</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Pagado</span>
}

/**
 * Desglose de cobros de un apartado (subtabla bajo su fila en Apartados): anticipo, abonos, saldo o
 * pago completo, con folio de venta, fecha, método, quién cobró y su estado. Al pie, lo
 * pagado y lo que falta.
 */
export default function ApartadoPayments({ apartado }) {
  const key = keyOf(apartado)
  const [rows, setRows] = useState(() => cache.get(key) ?? null)

  useEffect(() => {
    let active = true
    loadPayments(apartado)
      .then((r) => { if (active) setRows(r) })
      .catch(() => { if (active) setRows((current) => current ?? []) })
    return () => { active = false }
  }, [key])

  if (rows === null) return <p className="text-xs text-gray-400 px-4 py-3">Cargando pagos…</p>
  if (rows.length === 0) return <p className="text-xs text-gray-400 px-4 py-3">Sin pagos registrados todavía.</p>

  // Lo devuelto solo en parte (la tienda retuvo el resto) también cuenta lo que se quedó.
  const paid = rows.filter(isPaid).reduce((sum, p) => sum + Number(p.total ?? 0), 0)
    + rows.filter((p) => p.refundedAt && p.refundAmount != null).reduce((sum, p) => sum + Number(p.total) - Number(p.refundAmount), 0)
  const pending = Number(apartado.total ?? 0) - paid
  const open = apartado.status === 'ACTIVE' || apartado.status === 'PENDING'
  // Ya no se va a cobrar: cancelado, vencido, o completado y después devuelto.
  const ended = apartado.status === 'CANCELLED' || apartado.status === 'EXPIRED' || !!apartado.refundedAt

  return (
    <div className="px-4 py-3">
      <p className="text-xs font-semibold text-gray-600 mb-2">Pagos del apartado #{apartado.folio}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs bg-white rounded-lg border border-gray-100">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Venta</th>
              <th className="text-left px-3 py-2 font-medium">Fecha</th>
              <th className="text-left px-3 py-2 font-medium">Método</th>
              <th className="text-left px-3 py-2 font-medium">Cobró</th>
              <th className="text-left px-3 py-2 font-medium">Estado</th>
              <th className="text-right px-3 py-2 font-medium">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((p) => (
              <tr key={p.saleId} className={isPaid(p) ? '' : 'text-gray-400'}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link to={`/sales?sale=${p.saleId}`} className="font-medium text-blue-600 hover:text-blue-800 hover:underline">
                    {p.installment ? 'Abono' : KIND[p.kind] ?? p.kind} · Venta #{p.folio}
                  </Link>
                </td>
                <td className="px-3 py-2">{fmtDate(p.createdAt)}</td>
                <td className="px-3 py-2">{METHOD[p.paymentMethod] ?? p.paymentMethod}</td>
                <td className="px-3 py-2">{p.userName ?? '—'}</td>
                <td className="px-3 py-2"><PaymentStatus p={p} /></td>
                <td className={`px-3 py-2 text-right font-semibold ${isPaid(p) ? 'text-gray-800' : 'line-through'}`}>{fmt(p.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-100">
            {ended ? (
              // Cancelado, vencido o devuelto: ya no se va a cobrar, así que el total no aplica;
              // lo que importa es si la tienda se quedó con algo o se le devolvió todo.
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right text-gray-500">{paid > 0 ? 'Se quedó la tienda' : 'Devuelto al cliente'}</td>
                <td className={`px-3 py-2 text-right font-semibold ${paid > 0 ? 'text-green-700' : 'text-gray-500'}`}>
                  {paid > 0 ? fmt(paid) : 'Todo'}
                </td>
              </tr>
            ) : (
              <>
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-right text-gray-500">Total del apartado</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmt(apartado.total)}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-right text-gray-500">Pagado</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700">{fmt(paid)}</td>
                </tr>
              </>
            )}
            {open && (
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right text-gray-500">Falta por cobrar</td>
                <td className="px-3 py-2 text-right font-bold text-purple-700">{fmt(Math.max(pending, 0))}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  )
}
