import { useEffect, useState } from 'react'
import { getCashCuts, getOpenCashCut, getMyTodayCashCut, openCashCut, closeCashCut, getCashCutSummary } from '../api/cashCuts'
import { useAuth } from '../context/AuthContext'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function CashCuts() {
  const { isAdmin } = useAuth()
  const [cuts, setCuts] = useState([])
  const [openCut, setOpenCut] = useState(null)
  const [myToday, setMyToday] = useState(null)
  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [openAmount, setOpenAmount] = useState('')
  const [expenses, setExpenses] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [summary, setSummary] = useState(null)

  function load() {
    // el historial completo (la tabla) solo lo puede ver el administrador
    if (isAdmin) {
      getCashCuts({ size: 30 }).then((r) => setCuts(r.data.data ?? [])).catch(() => setCuts([]))
    }
    getOpenCashCut().then((r) => setOpenCut(r.data.data)).catch(() => setOpenCut(null))
    // el corte propio de hoy: sigue visible aunque ya se haya cerrado
    getMyTodayCashCut().then((r) => setMyToday(r.data.data)).catch(() => setMyToday(null))
  }

  useEffect(() => { load() }, [])

  async function handleOpen(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await openCashCut({ amount: Number(openAmount), notes })
      setShowOpen(false)
      setOpenAmount('')
      setNotes('')
      load()
    } catch (err) {
      alert(err.response?.data?.message ?? 'Error')
    } finally { setLoading(false) }
  }

  async function openCloseModal() {
    setNotes('')
    setExpenses('')
    setSummary(null)
    setShowClose(true)
    try {
      const r = await getCashCutSummary(openCut.id)
      setSummary(r.data.data)
    } catch {
      setSummary(null)
    }
  }

  async function openDetail(c) {
    if (c.status !== 'OPEN') { setDetail(c); return }
    setDetail(c)
    try {
      const r = await getCashCutSummary(c.id)
      setDetail({ ...c, ...r.data.data })
    } catch {
      // keep the stale (zeroed) values if the summary fetch fails
    }
  }

  const expectedCash = summary
    ? Number(summary.openingAmount) + Number(summary.cashSales) - (Number(expenses) || 0)
    : null

  async function handleClose(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await closeCashCut(openCut.id, { expenses: Number(expenses) || 0, notes })
      setShowClose(false)
      setExpenses('')
      setNotes('')
      load()
    } catch (err) {
      alert(err.response?.data?.message ?? 'Error')
    } finally { setLoading(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Cortes de Caja</h2>
        {openCut ? (
          <button className="btn-danger" onClick={openCloseModal}>Cerrar corte</button>
        ) : (
          <button className="btn-primary" onClick={() => { setShowOpen(true); setNotes('') }}>Abrir corte</button>
        )}
      </div>

      {openCut && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="font-semibold text-green-800">Corte abierto #{openCut.id}</p>
            <p className="text-sm text-green-600">Desde {fmtDate(openCut.openedAt)} · Apertura: {fmt(openCut.openingAmount)}</p>
          </div>
          <span className="text-2xl">🟢</span>
        </div>
      )}

      {/* corte propio del día, ya cerrado: solo aplica a no-admins, admin lo ve todo en la tabla */}
      {!isAdmin && !openCut && myToday && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-800">Tu corte de hoy — #{myToday.id} (cerrado)</p>
            <p className="text-sm text-gray-500">
              {fmtDate(myToday.openedAt)} – {fmtDate(myToday.closedAt)} · Total: {fmt(myToday.totalSales)}
            </p>
          </div>
          <button className="text-blue-600 hover:underline text-xs" onClick={() => openDetail(myToday)}>Ver detalle</button>
        </div>
      )}

      {!isAdmin && !openCut && !myToday && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-sm text-gray-500">
          Aún no has abierto un corte de caja hoy.
        </div>
      )}

      {isAdmin && (
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['#', 'Apertura', 'Cierre', 'Ventas', 'Transac.', 'Estado', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {cuts.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{c.id}</td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(c.openedAt)}</td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(c.closedAt)}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{fmt(c.totalSales)}</td>
                <td className="px-4 py-3 text-gray-600">{c.totalTransactions ?? 0}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    c.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>{c.status === 'OPEN' ? 'Abierto' : 'Cerrado'}</span>
                </td>
                <td className="px-4 py-3">
                  <button className="text-blue-600 hover:underline text-xs" onClick={() => openDetail(c)}>Ver</button>
                </td>
              </tr>
            ))}
            {cuts.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin cortes</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Open modal */}
      {showOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-4">Abrir corte de caja</h3>
            <form onSubmit={handleOpen} className="space-y-3">
              <div><label className="text-xs font-medium text-gray-600">Fondo inicial ($)</label>
                <input className="input" type="number" step="0.01" required value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} /></div>
              <div><label className="text-xs font-medium text-gray-600">Notas</label>
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? '...' : 'Abrir'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close modal */}
      {showClose && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-4">Cerrar corte de caja</h3>
            <form onSubmit={handleClose} className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Fondo inicial</span>
                  <span className="font-medium">{fmt(summary?.openingAmount)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Ventas en efectivo</span>
                  <span className="font-medium">{fmt(summary?.cashSales)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Ventas tarjeta/transf.</span>
                  <span className="font-medium">{fmt((summary?.cardSales ?? 0) + (summary?.transferSales ?? 0))}</span></div>
                <p className="text-xs text-red-500 italic pt-1">
                  Tarjeta y transferencia no son dinero físico, por eso no se suman al efectivo esperado en caja.
                </p>
                {summary?.cancelledCount > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Ventas canceladas ({summary.cancelledCount})</span>
                    <span className="font-medium">-{fmt(summary.cancelledTotal)}</span>
                  </div>
                )}
              </div>
              <div><label className="text-xs font-medium text-gray-600">Gastos adicionales ($)</label>
                <input className="input" type="number" step="0.01" min="0" value={expenses} onChange={(e) => setExpenses(e.target.value)} placeholder="0.00" /></div>
              <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                <span className="text-sm font-semibold text-gray-700">Efectivo esperado en caja</span>
                <span className="text-lg font-bold text-purple-700">{fmt(expectedCash)}</span>
              </div>
              <div><label className="text-xs font-medium text-gray-600">Notas</label>
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowClose(false)}>Cancelar</button>
                <button type="submit" className="btn-danger" disabled={loading}>{loading ? '...' : 'Cerrar corte'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold">Corte #{detail.id}</h3>
              <button className="text-gray-400 text-xl" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ['Apertura', fmtDate(detail.openedAt)],
                ['Cierre', fmtDate(detail.closedAt)],
                ['Fondo inicial', fmt(detail.openingAmount)],
                ['Gastos', detail.status === 'OPEN' ? '— (se captura al cerrar)' : fmt(detail.expenses)],
                ['Fondo final (calculado)', detail.status === 'OPEN' ? '— (pendiente de cierre)' : fmt(detail.closingAmount)],
                ['Total ventas', fmt(detail.totalSales)],
                ['  · Efectivo', fmt(detail.cashSales)],
                ['  · Tarjeta', fmt(detail.cardSales)],
                ['  · Transferencia', fmt(detail.transferSales)],
                ['Transacciones', detail.totalTransactions ?? 0],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
              {detail.cancelledCount > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Ventas canceladas ({detail.cancelledCount})</span>
                  <span className="font-medium">-{fmt(detail.cancelledTotal)}</span>
                </div>
              )}
              {detail.notes && <p className="text-gray-400 text-xs mt-2">{detail.notes}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
