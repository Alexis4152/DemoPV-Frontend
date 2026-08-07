import { useEffect, useState } from 'react'
import { getSales, cancelSale } from '../api/sales'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDate = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

const METHOD_LABELS = { CASH: '💵 Efectivo', CARD: '💳 Tarjeta', TRANSFER: '🏦 Transferencia' }
const PAGE_SIZES = [10, 20, 50, 100]

const EMPTY_FILTERS = { from: '', to: '', customerName: '', paymentMethod: '', status: '' }

export default function Sales() {
  const { isAdmin } = useAuth()
  const { confirmDialog } = useNotify()
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    const params = {
      page,
      size,
      customerName: appliedFilters.customerName || undefined,
      paymentMethod: appliedFilters.paymentMethod || undefined,
      status: appliedFilters.status || undefined,
      from: appliedFilters.from ? `${appliedFilters.from}T00:00:00` : undefined,
      to: appliedFilters.to ? `${appliedFilters.to}T23:59:59` : undefined,
    }
    getSales(params)
      .then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [page, size, appliedFilters])

  function handleApplyFilters(e) {
    e.preventDefault()
    setPage(0)
    setAppliedFilters(filters)
  }

  function handleClearFilters() {
    setFilters(EMPTY_FILTERS)
    setAppliedFilters(EMPTY_FILTERS)
    setPage(0)
  }

  async function handleCancel(id) {
    if (!(await confirmDialog('¿Cancelar esta venta? Se revertirá el stock.', { confirmText: 'Cancelar venta' }))) return
    await cancelSale(id)
    load()
  }

  const sales = pageData.content ?? []
  const totalPages = pageData.totalPages ?? 0
  const totalElements = pageData.totalElements ?? 0
  const from = totalElements === 0 ? 0 : page * size + 1
  const to = Math.min(totalElements, page * size + sales.length)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Ventas</h2>

      <form onSubmit={handleApplyFilters} className="card mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Desde</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Hasta</label>
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Cliente</label>
          <input type="text" className="input" placeholder="Nombre del cliente" value={filters.customerName} onChange={(e) => setFilters({ ...filters, customerName: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Método</label>
          <select className="input" value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}>
            <option value="">Todos</option>
            <option value="CASH">Efectivo</option>
            <option value="CARD">Tarjeta</option>
            <option value="TRANSFER">Transferencia</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
          <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Todos</option>
            <option value="COMPLETED">Completada</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1">Filtrar</button>
          <button type="button" className="btn-secondary" onClick={handleClearFilters}>Limpiar</button>
        </div>
      </form>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['#', 'Fecha', 'Cliente', 'Vendedor', 'Método', 'Total', 'Estado', ''].map((h) => (
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
                <td className="px-4 py-3 text-gray-600">{s.user?.name ?? '—'}</td>
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
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin ventas</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <span>Mostrar</span>
            <select
              className="input !w-auto py-1"
              value={size}
              onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>por página · {totalElements === 0 ? 'sin resultados' : `${from}–${to} de ${totalElements}`}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ‹ Anterior
            </button>
            <span className="text-gray-500 text-xs">Página {totalPages === 0 ? 0 : page + 1} de {totalPages}</span>
            <button
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente ›
            </button>
          </div>
        </div>
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
              <div className="flex justify-between"><span className="text-gray-500">Vendedor</span><span>{detail.user?.name ?? '—'}</span></div>
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
