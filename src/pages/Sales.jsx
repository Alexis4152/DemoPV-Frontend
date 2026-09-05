import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getSales, cancelSale } from '../api/sales'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDate = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

const METHOD_LABELS = { CASH: '💵 Efectivo', CARD: '💳 Tarjeta', TRANSFER: '🏦 Transferencia' }
const PAGE_SIZES = [10, 20, 50, 100]

const EMPTY_FILTERS = { from: '', to: '', customerName: '', paymentMethod: '', status: '' }

/**
 * Página "Ventas": historial paginado de las ventas registradas en el POS (de la tienda
 * del usuario, o de todas si es `SUPER_ADMIN` — el backend ya aplica ese filtro, aquí solo
 * se muestra lo recibido). Permite filtrar por rango de fechas, cliente, forma de pago y
 * estado, ver el detalle (partidas y totales) de una venta, y — solo administradores —
 * cancelarla.
 *
 * Patrón de filtros + paginación (se repite igual en otras páginas de listado, como
 * CashCuts): existen dos copias del estado de filtros, `filters` (lo que el usuario va
 * tecleando en el formulario) y `appliedFilters` (lo que realmente se envía al backend).
 * Solo al enviar el formulario (`handleApplyFilters`) se copian los `filters` a
 * `appliedFilters`, lo que dispara la recarga vía el `useEffect` de abajo; así se evita
 * pegarle a la API en cada tecleo. La paginación es server-side: `page`/`size` viajan como
 * query params y el backend responde `{content, page, size, totalElements, totalPages}`;
 * el rango "X–Y de Z" que se muestra en el pie de la tabla se calcula localmente a partir
 * de esos totales.
 *
 * Cancelar una venta (`handleCancel`) es una operación destructiva en términos de negocio
 * (revierte el stock de los productos vendidos) por lo que se pide confirmación explícita
 * y solo está disponible para ventas `COMPLETED`; la fila nunca se borra, el backend solo
 * le cambia el `status` a `CANCELLED` (por eso sigue apareciendo en el listado).
 *
 * Permite llegar con un rango de fechas ya aplicado desde afuera (ej. la tarjeta "Ventas
 * del mes" del Dashboard enlaza a `/sales?from=YYYY-MM-DD&to=YYYY-MM-DD`) — se lee una
 * sola vez al montar, tanto en `filters` (para que el formulario lo muestre) como en
 * `appliedFilters` (para que cargue de inmediato, sin esperar a que el usuario pulse
 * "Aplicar").
 */
export default function Sales() {
  const { isAdmin } = useAuth()
  const { confirmDialog } = useNotify()
  const [searchParams] = useSearchParams()
  const initialFilters = () => ({
    ...EMPTY_FILTERS,
    from: searchParams.get('from') || EMPTY_FILTERS.from,
    to: searchParams.get('to') || EMPTY_FILTERS.to,
  })
  const [filters, setFilters] = useState(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState(initialFilters)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  /**
   * Trae la página actual de ventas usando `page`/`size` y los `appliedFilters` vigentes.
   * Las fechas se envían como rango de día completo: `from` se ancla a las 00:00:00 y `to`
   * a las 23:59:59 para incluir todas las ventas del día seleccionado, no solo la medianoche.
   * Se re-ejecuta automáticamente (ver `useEffect` de abajo) cada vez que cambian `page`,
   * `size` o `appliedFilters`.
   */
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

  /**
   * Aplica los filtros capturados en el formulario: los copia a `appliedFilters` (lo que
   * dispara la recarga) y reinicia la paginación a la primera página, para no quedar
   * "atorado" en una página que ya no existe con el nuevo filtro.
   */
  function handleApplyFilters(e) {
    e.preventDefault()
    setPage(0)
    setAppliedFilters(filters)
  }

  /** Limpia filtros capturados y aplicados, y vuelve a la primera página. */
  function handleClearFilters() {
    setFilters(EMPTY_FILTERS)
    setAppliedFilters(EMPTY_FILTERS)
    setPage(0)
  }

  /**
   * Cancela una venta completada. Pide confirmación porque la cancelación revierte el
   * stock de los productos vendidos (efecto secundario en inventario) y queda registrada
   * en el backend (quién/cuándo la canceló); la fila de la venta no se elimina, solo cambia
   * su estado a CANCELLED. Solo se ofrece este botón a administradores y solo sobre ventas
   * `COMPLETED` (ver JSX de la tabla). Al terminar, recarga el listado para reflejar el
   * nuevo estado.
   */
  async function handleCancel(id) {
    if (!(await confirmDialog('¿Cancelar esta venta? Se revertirá el stock.', { confirmText: 'Cancelar venta' }))) return
    await cancelSale(id)
    load()
  }

  const sales = pageData.content ?? []
  const totalPages = pageData.totalPages ?? 0
  const totalElements = pageData.totalElements ?? 0
  // Rango "X–Y de Z" mostrado junto al selector de tamaño de página, calculado localmente
  // a partir de la página/tamaño actuales y el total que reporta el backend.
  const from = totalElements === 0 ? 0 : page * size + 1
  const to = Math.min(totalElements, page * size + sales.length)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Ventas</h2>

      <form onSubmit={handleApplyFilters} className="card mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
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
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
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
        </div>

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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
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

            <div className="overflow-x-auto">
            <table className="w-full text-sm mb-4 min-w-[420px]">
              <thead className="border-b border-gray-100">
                <tr>
                  <th className="text-left py-2 text-gray-600">Producto</th>
                  <th className="text-right py-2 text-gray-600">Cant.</th>
                  <th className="text-right py-2 text-gray-600">Descuento</th>
                  <th className="text-right py-2 text-gray-600">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(detail.items ?? []).map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-800">{item.productName}</td>
                    <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-2 text-right text-green-600">{item.discount > 0 ? `-${fmt(item.discount)}` : '—'}</td>
                    <td className="py-2 text-right font-medium">{fmt(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <div className="border-t border-gray-100 pt-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span><span>{fmt(detail.subtotal)}</span>
              </div>
              {detail.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Descuento</span><span>-{fmt(detail.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base text-gray-900">
                <span>Total</span><span className="text-purple-700">{fmt(detail.total)}</span>
              </div>
            </div>
            {detail.amountReceived != null && (
              <div className="text-sm text-gray-500 mt-1">
                <div className="flex justify-between"><span>Recibido</span><span>{fmt(detail.amountReceived)}</span></div>
                <div className="flex justify-between font-medium text-gray-700"><span>Cambio</span><span>{fmt(detail.changeGiven)}</span></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
