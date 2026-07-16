import { useEffect, useState } from 'react'
import { getSales, cancelSale } from '../api/sales'
import { useAuth } from '../context/AuthContext'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDate = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

const METHOD_LABELS = { CASH: '💵 Efectivo', CARD: '💳 Tarjeta', TRANSFER: '🏦 Transferencia' }

export default function Sales() {
  const { isAdmin } = useAuth()
  const [sales, setSales] = useState([])
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    getSales({ size: 50 }).then((r) => setSales(r.data.data ?? [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCancel(id) {
    if (!confirm('¿Cancelar esta venta? Se revertirá el stock.')) return
    await cancelSale(id)
    load()
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Ventas</h2>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['#', 'Fecha', 'Cliente', 'Método', 'Total', 'Estado', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sales.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{s.id}</td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(s.createdAt)}</td>
                <td className="px-4 py-3 text-gray-700">{s.customerName ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{METHOD_LABELS[s.paymentMethod]}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{fmt(s.total)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    s.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>{s.status === 'COMPLETED' ? 'Completada' : 'Cancelada'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="text-blue-600 hover:underline text-xs" onClick={() => setDetail(s)}>Ver</button>
                    {isAdmin && s.status === 'COMPLETED' && (
                      <button className="text-red-500 hover:underline text-xs" onClick={() => handleCancel(s.id)}>Cancelar</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && sales.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin ventas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold">Venta #{detail.id}</h3>
                <p className="text-sm text-gray-500">{fmtDate(detail.createdAt)}</p>
              </div>
              <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => setDetail(null)}>✕</button>
            </div>

            <div className="space-y-1 text-sm mb-4">
              <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span>{detail.customerName ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Método</span><span>{METHOD_LABELS[detail.paymentMethod]}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Estado</span><span>{detail.status}</span></div>
            </div>

            <table className="w-full text-sm mb-4">
              <thead className="border-b border-gray-100">
                <tr>
                  <th className="text-left py-2 text-gray-600">Producto</th>
                  <th className="text-right py-2 text-gray-600">Cant.</th>
                  <th className="text-right py-2 text-gray-600">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(detail.items ?? []).map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-800">{item.productName}</td>
                    <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-2 text-right font-medium">{fmt(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-base">
              <span>Total</span><span className="text-purple-700">{fmt(detail.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
