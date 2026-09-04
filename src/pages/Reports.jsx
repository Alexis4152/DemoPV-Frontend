import { useEffect, useState } from 'react'
import {
  getSalesSummary, getSalesByDay, getTopProducts, getInventoryStatus,
  getSalesByPaymentMethod, getTopSellers, getSalesByMonth, getTopProductsByMargin,
  getSalesByCategory, getYearOverYear, getReportPdf,
} from '../api/reports'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const METODO_PAGO_ES = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }

// Convierte un objeto Date a 'YYYY-MM-DD' para los inputs de tipo date y los query params.
function toYYYYMMDD(d) { return d.toISOString().slice(0, 10) }

/**
 * Pantalla de "Reportes": muestra estadísticas de ventas e inventario de la tienda del
 * usuario (o de todas si es `SUPER_ADMIN`, según lo que filtre el backend) dentro de un
 * rango de fechas seleccionable. Sirve a todos los roles con la sección `REPORTS` habilitada.
 *
 * Incluye: totales del rango (ventas, transacciones, ticket promedio) con su comparativo
 * contra el mismo rango del año anterior; gráficas de ventas por día, por mes (para ver
 * temporadas altas/bajas) y por categoría; tablas de productos más vendidos, más rentables,
 * ventas por método de pago y ranking de vendedores; y la tabla de stock bajo (esta última
 * no depende del rango de fechas, es el estado actual del inventario). El botón "Generar
 * reporte PDF" descarga estos mismos datos, en tablas, listos para archivarse o imprimirse.
 *
 * Nota: las filas de los reportes agregados llegan como arreglos posicionales (ej.
 * `row[1]`, `row[2]`) en vez de objetos con nombres de campo — es el formato en el que el
 * backend devuelve estos reportes.
 */
export default function Reports() {
  const { user } = useAuth()
  const { notify } = useNotify()
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const [from, setFrom] = useState(toYYYYMMDD(firstOfMonth))
  const [to, setTo] = useState(toYYYYMMDD(today))
  const [summary, setSummary] = useState(null)
  const [byDay, setByDay] = useState([])
  const [byMonth, setByMonth] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [byCategory, setByCategory] = useState([])
  const [byPaymentMethod, setByPaymentMethod] = useState([])
  const [topSellers, setTopSellers] = useState([])
  const [margins, setMargins] = useState([])
  const [yoy, setYoy] = useState(null)
  const [inventory, setInventory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  /**
   * Carga en paralelo todos los reportes de la pantalla para el rango [from, to] actual y
   * normaliza las filas posicionales que devuelve el backend a objetos con nombres de
   * campo, listos para alimentar las gráficas de Recharts. Se invoca al montar el
   * componente y cada vez que el usuario pulsa "Aplicar".
   */
  function load() {
    setLoading(true)
    Promise.all([
      getSalesSummary(from, to),
      getSalesByDay(from, to),
      getTopProducts(from, to, 8),
      getInventoryStatus(),
      getSalesByPaymentMethod(from, to),
      getTopSellers(from, to, 5),
      getSalesByMonth(from, to),
      getTopProductsByMargin(from, to, 8),
      getSalesByCategory(from, to),
      getYearOverYear(from, to),
    ]).then(([s, d, t, inv, pm, sellers, month, margin, cat, y]) => {
      setSummary(s.data.data)
      setByDay((d.data.data ?? []).map((row) => ({ date: String(row[0]).slice(5, 10), total: Number(row[1]), count: Number(row[2]) })))
      setTopProducts((t.data.data ?? []).map((row) => ({ name: String(row[1]).slice(0, 20), qty: Number(row[2]), revenue: Number(row[3]) })))
      setInventory(inv.data.data)
      setByPaymentMethod((pm.data.data ?? []).map((row) => ({ method: row[0], total: Number(row[1]), count: Number(row[2]) })))
      setTopSellers((sellers.data.data ?? []).map((row) => ({ name: row[1], total: Number(row[2]), count: Number(row[3]) })))
      setByMonth((month.data.data ?? []).map((row) => {
        const dt = new Date(row[0])
        return { label: `${MESES[dt.getMonth()]} ${dt.getFullYear()}`, total: Number(row[1]), count: Number(row[2]) }
      }))
      setMargins((margin.data.data ?? []).map((row) => ({ name: String(row[1]).slice(0, 20), revenue: Number(row[2]), cost: Number(row[3]), margin: Number(row[4]) })))
      setByCategory((cat.data.data ?? []).map((row) => ({ name: String(row[1]).slice(0, 20), qty: Number(row[2]), total: Number(row[3]) })))
      setYoy(y.data.data)
    }).finally(() => setLoading(false))
  }

  // Carga inicial con el rango por defecto (mes en curso a hoy).
  useEffect(() => { load() }, [])

  /**
   * Descarga el reporte PDF del rango actual y lo guarda con un nombre que incluye el
   * nombre de la tienda y las fechas, para que sea fácil de identificar entre varios
   * descargados. El PDF llega como blob (binario), no como JSON — se arma una URL temporal
   * para el navegador y se libera justo después de disparar la descarga.
   */
  async function handleDownloadPdf() {
    setGeneratingPdf(true)
    try {
      const res = await getReportPdf(from, to)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const tiendaSlug = (user?.tienda?.name || 'reporte').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const a = document.createElement('a')
      a.href = url
      a.download = `${tiendaSlug}-${from}-a-${to}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      notify('No se pudo generar el reporte en PDF', 'error')
    } finally {
      setGeneratingPdf(false)
    }
  }

  const changePercent = yoy?.changePercent != null ? Number(yoy.changePercent) : null

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Reportes</h2>

      {/* Date filter */}
      <div className="flex flex-wrap gap-3 items-end mb-6">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Desde</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Hasta</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={load} disabled={loading}>{loading ? '...' : 'Aplicar'}</button>
        <button className="btn-primary" onClick={handleDownloadPdf} disabled={generatingPdf || loading}>
          📄 {generatingPdf ? 'Generando...' : 'Generar reporte PDF'}
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total ventas', value: fmt(summary.totalSales), color: 'text-purple-700' },
            { label: 'Transacciones', value: summary.totalTransactions, color: 'text-blue-600' },
            { label: 'Ticket promedio', value: fmt(summary.averageTicket), color: 'text-green-600' },
          ].map((s) => (
            <div key={s.label} className="card">
              <p className="text-sm text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
          <div className="card">
            <p className="text-sm text-gray-500">Vs. año anterior</p>
            {changePercent != null ? (
              <p className={`text-2xl font-bold mt-1 ${changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {changePercent >= 0 ? '▲' : '▼'} {Math.abs(changePercent).toFixed(1)}%
              </p>
            ) : (
              <p className="text-sm text-gray-400 mt-2">Sin datos del año anterior</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sales by day */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Ventas por día</h3>
          {byDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="total" fill="rgb(var(--brand-600))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>}
        </div>

        {/* Top products */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Productos más vendidos</h3>
          {topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="qty" fill="rgb(var(--brand-700))" radius={[0, 4, 4, 0]} name="Unidades" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>}
        </div>

        {/* Sales by month (seasonality) */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-1">Ventas por mes</h3>
          <p className="text-xs text-gray-400 mb-4">Útil para detectar temporadas altas y bajas en rangos largos.</p>
          {byMonth.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="total" fill="rgb(var(--brand-600))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>}
        </div>

        {/* Sales by category */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Ventas por categoría</h3>
          {byCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byCategory} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="total" fill="rgb(var(--brand-700))" radius={[0, 4, 4, 0]} name="Vendido" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Sales by payment method */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">💳 Ventas por método de pago</h3>
          {byPaymentMethod.length > 0 ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {byPaymentMethod.map((row) => (
                  <tr key={row.method}>
                    <td className="py-2 text-gray-700">{METODO_PAGO_ES[row.method] ?? row.method}</td>
                    <td className="py-2 text-right text-gray-500">{row.count} venta{row.count === 1 ? '' : 's'}</td>
                    <td className="py-2 text-right font-semibold text-gray-800">{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>}
        </div>

        {/* Top sellers */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">🏆 Ranking de vendedores</h3>
          {topSellers.length > 0 ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {topSellers.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-700">{row.name}</td>
                    <td className="py-2 text-right text-gray-500">{row.count} venta{row.count === 1 ? '' : 's'}</td>
                    <td className="py-2 text-right font-semibold text-gray-800">{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>}
        </div>

        {/* Profitability */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-1">💰 Rentabilidad por producto</h3>
          <p className="text-xs text-gray-400 mb-3">Usa el costo actual del producto, no el histórico.</p>
          {margins.length > 0 ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {margins.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-700">{row.name}</td>
                    <td className="py-2 text-right font-semibold text-green-600">{fmt(row.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>}
        </div>
      </div>

      {/* Low stock */}
      {inventory?.lowStockProducts?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">⚠️ Productos con stock bajo</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead className="border-b border-gray-100">
                <tr>
                  {['Producto', 'Stock actual', 'Stock mínimo'].map((h) => (
                    <th key={h} className="text-left py-2 font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {inventory.lowStockProducts.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-800">{row[1]}</td>
                    <td className="py-2 font-semibold text-red-600">{row[2]}</td>
                    <td className="py-2 text-gray-500">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
