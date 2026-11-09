import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getOpenCashCut } from '../api/cashCuts'

/**
 * Corte de caja abierto del usuario en sesión: `undefined` mientras carga, `null` si no
 * tiene. Lo usan las devoluciones en efectivo, que sacan el dinero de SU caja.
 */
export function useMyOpenCut(enabled = true) {
  const [cut, setCut] = useState(undefined)
  useEffect(() => {
    if (!enabled) return
    getOpenCashCut().then((r) => setCut(r.data.data ?? null)).catch(() => setCut(null))
  }, [enabled])
  return cut
}

/**
 * Aviso de "no hay corte abierto" con enlace a abrir uno — mismo que el del Punto de Venta.
 * `action`: lo que no se puede hacer sin corte, p. ej. "registrar devoluciones en efectivo".
 */
export default function NoOpenCutNotice({ action, className = 'mb-4' }) {
  return (
    <div className={`bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 ${className}`}>
      ⚠️ No hay corte de caja abierto. Debes <Link to="/cash-cuts" className="underline font-semibold">abrir un corte</Link> antes de poder {action}.
    </div>
  )
}
