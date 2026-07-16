import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSalesSummary } from '../api/reports'
import { getOpenCashCut } from '../api/cashCuts'
import { searchProducts } from '../api/products'

function StatCard({ label, value, sub, color }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [cashCut, setCashCut] = useState(null)
  const [lowStock, setLowStock] = useState(0)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const firstOfMonth = today.slice(0, 8) + '01'

    getSalesSummary(firstOfMonth, today)
      .then((r) => setSummary(r.data.data))
      .catch(() => {})

    getOpenCashCut()
      .then((r) => setCashCut(r.data.data))
      .catch(() => {})

    searchProducts({ lowStock: true, size: 200 })
      .then((r) => setLowStock(r.data.data?.length ?? 0))
      .catch(() => {})
  }, [])

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Ventas del mes"
          value={fmt(summary?.totalSales)}
          sub={`${summary?.totalTransactions ?? 0} transacciones`}
          color="text-purple-700"
        />
        <StatCard
          label="Ticket promedio"
          value={fmt(summary?.averageTicket)}
          color="text-blue-600"
        />
        <StatCard
          label="Corte de caja"
          value={cashCut ? 'Abierto' : 'Cerrado'}
          sub={cashCut ? `Desde ${new Date(cashCut.openedAt).toLocaleString('es-MX')}` : ''}
          color={cashCut ? 'text-green-600' : 'text-gray-400'}
        />
        <StatCard
          label="Stock bajo"
          value={lowStock}
          sub="productos con bajo inventario"
          color={lowStock > 0 ? 'text-red-600' : 'text-green-600'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/pos" className="card hover:shadow-md transition-shadow flex items-center gap-4 cursor-pointer">
          <span className="text-3xl">🛒</span>
          <div>
            <p className="font-semibold text-gray-900">Nueva Venta</p>
            <p className="text-sm text-gray-500">Ir al punto de venta</p>
          </div>
        </Link>
        <Link to="/inventory" className="card hover:shadow-md transition-shadow flex items-center gap-4 cursor-pointer">
          <span className="text-3xl">📦</span>
          <div>
            <p className="font-semibold text-gray-900">Inventario</p>
            <p className="text-sm text-gray-500">Gestionar productos</p>
          </div>
        </Link>
        <Link to="/reports" className="card hover:shadow-md transition-shadow flex items-center gap-4 cursor-pointer">
          <span className="text-3xl">📈</span>
          <div>
            <p className="font-semibold text-gray-900">Reportes</p>
            <p className="text-sm text-gray-500">Ver estadísticas</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
