import { useEffect, useState } from 'react'
import { getCashCutSaleItems } from '../../api/cashCuts'
import { fmt } from './common'

// Qué pasó con cada producto (ver StockReturnService en el backend); concepto / por pedido no
// tienen inventario que regresar.
const OUTCOME = {
  RESTOCK: ['Regresó al inventario', 'text-green-700'],
  WASTE: ['Merma', 'text-amber-700'],
  NOT_RETURNED: ['No regresó', 'text-red-700'],
}
// Concepto / por pedido no tienen inventario; los demás son productos del apartado de un
// anticipo en el que todavía no se decidió qué pasó con ellos.
const KIND = {
  CONCEPT: 'Concepto',
  MADE_TO_ORDER: 'Por pedido',
  RESERVED: 'Sigue apartado',
  DELIVERED: 'Se entregó al cliente',
  REVIEW: 'Inventario por revisar',
}

/**
 * Subtabla con los productos de una venta cancelada o devuelta en un corte (fila desplegable
 * de la tabla de movimientos del turno): cantidad, importe y qué pasó con cada producto.
 */
export default function CutSaleItems({ cutId, saleId }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    getCashCutSaleItems(cutId, saleId)
      .then((r) => setItems(r.data.data ?? []))
      .catch(() => setError(true))
  }, [cutId, saleId])

  if (error) return <p className="text-xs text-red-600 px-4 py-2">No se pudieron cargar los productos.</p>
  if (items === null) return <p className="text-xs text-gray-400 px-4 py-2">Cargando productos…</p>

  return (
    <div className="px-4 py-2">
      <table className="w-full text-xs bg-white rounded-lg border border-gray-100">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="text-left px-3 py-1.5 font-medium">Producto</th>
            <th className="text-right px-3 py-1.5 font-medium">Cant.</th>
            <th className="text-right px-3 py-1.5 font-medium">Importe</th>
            <th className="text-left px-3 py-1.5 font-medium">Qué pasó con el producto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map((i, idx) => {
            const [label, color] = i.returnOutcome ? OUTCOME[i.returnOutcome] : [KIND[i.stockKind] ?? '—', 'text-gray-400']
            return (
              <tr key={idx}>
                <td className="px-3 py-1.5 text-gray-800 [overflow-wrap:anywhere]">{i.productName}</td>
                <td className="px-3 py-1.5 text-right">{Number(i.quantity)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(i.subtotal)}</td>
                <td className={`px-3 py-1.5 font-medium ${color}`}>{label}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
