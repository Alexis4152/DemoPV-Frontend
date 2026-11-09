import { OUTCOME_LABELS } from '../components/ItemOutcomePicker'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDate = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Subtabla "Productos" bajo una fila de Apartados: cada línea con cantidad, precio,
 * descuento e importe y, si el apartado se canceló o devolvió, qué pasó con el producto.
 */
export default function ApartadoItems({ apartado }) {
  const items = apartado.items ?? []
  const hasDiscount = items.some((i) => Number(i.discount) > 0)
  const hasOutcome = items.some((i) => i.returnOutcome)
  // Entrega por renglón: fecha y quién en cada producto; "Pendiente" lo que falta.
  const delivered = items.some((i) => i.deliveredAt) || (apartado.status === 'COMPLETED' && !!apartado.pendingDelivery)
  const closed = !!apartado.refundedAt || apartado.status === 'CANCELLED' || apartado.status === 'EXPIRED'
  const cols = 4 + (hasDiscount ? 1 : 0) + (delivered ? 1 : 0) + (hasOutcome ? 1 : 0)
  const after = (delivered ? 1 : 0) + (hasOutcome ? 1 : 0)

  return (
    <div className="px-4 py-3">
      <p className="text-xs font-semibold text-gray-600 mb-2">Productos del apartado #{apartado.folio}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs bg-white rounded-lg border border-gray-100">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Producto</th>
              <th className="text-right px-3 py-2 font-medium">Cantidad</th>
              <th className="text-right px-3 py-2 font-medium">Precio</th>
              {hasDiscount && <th className="text-right px-3 py-2 font-medium">Descuento</th>}
              <th className="text-right px-3 py-2 font-medium">Importe</th>
              {delivered && <th className="text-left px-3 py-2 font-medium">Entregado</th>}
              {hasOutcome && <th className="text-left px-3 py-2 font-medium">Qué pasó</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2 font-medium text-gray-800 [overflow-wrap:anywhere]">
                  {i.productName}
                  {i.product?.isMadeToOrder && <span className="ml-1 italic font-normal text-gray-400">· por pedido</span>}
                  {i.onOrder && <span className="ml-1 italic font-normal text-gray-400">· sobre pedido</span>}
                </td>
                <td className="px-3 py-2 text-right">{Number(i.quantity)}</td>
                <td className="px-3 py-2 text-right">{fmt(i.unitPrice)}</td>
                {hasDiscount && <td className="px-3 py-2 text-right text-green-700">{Number(i.discount) > 0 ? `-${fmt(i.discount)}` : '—'}</td>}
                <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmt(i.subtotal)}</td>
                {delivered && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    {i.deliveredAt ? (
                      <>
                        <span className="block text-teal-700">{fmtDate(i.deliveredAt)}</span>
                        {i.deliveredByName && <span className="block text-gray-400">{i.deliveredByName}</span>}
                      </>
                    ) : <span className="text-gray-400">{closed ? 'No se entregó' : 'Pendiente'}</span>}
                  </td>
                )}
                {hasOutcome && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    {i.returnOutcome ? (
                      <>
                        <span className="block text-gray-800">{OUTCOME_LABELS[i.returnOutcome] ?? i.returnOutcome}</span>
                        {apartado.outcomeAt && <span className="block text-gray-500">{fmtDate(apartado.outcomeAt)}</span>}
                        {apartado.outcomeByName && <span className="block text-gray-400">{apartado.outcomeByName}</span>}
                      </>
                    ) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-100">
            <tr>
              <td colSpan={cols - after - 1} className="px-3 py-2 text-right text-gray-500">Total del apartado</td>
              <td className="px-3 py-2 text-right font-bold text-gray-900">{fmt(apartado.total)}</td>
              {after > 0 && <td colSpan={after} />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
