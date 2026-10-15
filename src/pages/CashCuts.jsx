import { useEffect, useState } from 'react'
import { getUnresolvedHandoverCount } from '../api/cashRegisters'
import { getPendingReimbursementTotal } from '../api/reimbursements'
import { useAuth } from '../context/AuthContext'
import HistoryTab from './cashcuts/HistoryTab'
import MyCashTab from './cashcuts/MyCashTab'
import RegistersTab from './cashcuts/RegistersTab'
import ReimbursementsTab from './cashcuts/ReimbursementsTab'

/**
 * Página "Cortes de Caja", en pestañas:
 * - **Mi caja** (todos): abrir corte recibiendo una caja, registrar entradas/salidas
 *   durante el turno y cerrar con arqueo.
 * - **Cajas** (admin/supervisor): estado de cada caja, retiros/entradas con la caja
 *   cerrada, cierre forzado y entregas entre turnos (con "Resolver" para las diferencias).
 * - **Historial** (admin/supervisor): todos los cortes, con filtros y detalle.
 * - **Reembolsos** (admin/supervisor): lo que se le debe a quien puso dinero de su bolsa.
 *
 * Las pestañas de admin muestran un contador cuando hay algo pendiente (entregas con
 * diferencia sin resolver, reembolsos pendientes).
 */
export default function CashCuts() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('mine')
  const [unresolved, setUnresolved] = useState(0)
  const [pendingTotal, setPendingTotal] = useState(0)

  function loadBadges() {
    if (!isAdmin) return
    getUnresolvedHandoverCount().then((r) => setUnresolved(r.data.data ?? 0)).catch(() => {})
    getPendingReimbursementTotal().then((r) => setPendingTotal(Number(r.data.data ?? 0))).catch(() => {})
  }
  useEffect(() => { loadBadges() }, [isAdmin])

  const tabs = [
    { key: 'mine', label: 'Mi caja' },
    ...(isAdmin ? [
      { key: 'registers', label: 'Cajas', badge: unresolved > 0 ? unresolved : null },
      { key: 'history', label: 'Historial' },
      { key: 'reimbursements', label: 'Reembolsos', badge: pendingTotal > 0 ? '•' : null },
    ] : []),
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Cortes de Caja</h2>

      {tabs.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-200 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              className={`min-h-[44px] px-4 -mb-px border-b-2 text-sm font-semibold flex items-center gap-2 ${tab === t.key ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.badge != null && <span className="min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-xs leading-5 text-center">{t.badge}</span>}
            </button>
          ))}
        </div>
      )}

      {tab === 'mine' && <MyCashTab onChanged={loadBadges} />}
      {tab === 'registers' && isAdmin && <RegistersTab onChanged={loadBadges} />}
      {tab === 'history' && isAdmin && <HistoryTab />}
      {tab === 'reimbursements' && isAdmin && <ReimbursementsTab onChanged={loadBadges} />}
    </div>
  )
}
