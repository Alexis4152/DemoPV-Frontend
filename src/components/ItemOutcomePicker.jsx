/**
 * Por artículo, qué pasó físicamente con el producto al cancelar una venta, devolverla o
 * cancelar un apartado (ver StockReturnService en el backend):
 *  - RESTOCK: regresó en buen estado → vuelve al stock vendible.
 *  - WASTE: regresó pero ya no sirve (dañado, caducado, abierto) → queda como merma.
 *  - NOT_RETURNED: no regresó (el cliente se lo quedó o se perdió) → el stock no cambia.
 *
 * `items`: [{ id, name, quantity }] — solo los que tienen inventario.
 * `value`: { [id]: outcome } (lo que falte cuenta como RESTOCK). `onChange(nuevoValor)`.
 */
export const OUTCOMES = [
  { value: 'RESTOCK', label: 'Regresa', help: 'Vuelve al inventario', on: 'bg-green-600 text-white border-green-600' },
  { value: 'WASTE', label: 'Merma', help: 'Regresó pero no sirve', on: 'bg-amber-500 text-white border-amber-500' },
  { value: 'NOT_RETURNED', label: 'No regresó', help: 'El cliente se lo quedó o se perdió', on: 'bg-gray-600 text-white border-gray-600' },
]

export const OUTCOME_LABELS = {
  RESTOCK: 'Regresó al inventario',
  WASTE: 'Merma',
  NOT_RETURNED: 'No regresó',
}

/** Lista para mandar al backend: [{ itemId, outcome }]. */
export const outcomesPayload = (items, value) => items.map((i) => ({ itemId: i.id, outcome: value[i.id] ?? 'RESTOCK' }))

/** ¿Algún producto no vuelve al stock vendible? (entonces el motivo es obligatorio) */
export const anyNotRestocked = (items, value) => items.some((i) => (value[i.id] ?? 'RESTOCK') !== 'RESTOCK')

export default function ItemOutcomePicker({ items, value, onChange }) {
  if (items.length === 0) return null
  const setAll = (outcome) => onChange(Object.fromEntries(items.map((i) => [i.id, outcome])))
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <p className="text-xs font-medium text-gray-600">¿Qué pasó con cada producto?</p>
        <button type="button" className="text-xs text-purple-700 hover:underline" onClick={() => setAll('RESTOCK')}>Todo regresa</button>
      </div>
      <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
        {items.map((i) => {
          const current = value[i.id] ?? 'RESTOCK'
          return (
            <div key={i.id} className="px-3 py-2">
              <p className="text-sm text-gray-800 mb-1.5">
                {i.name} <span className="text-gray-400">x{Number(i.quantity)}</span>
              </p>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`Qué pasó con ${i.name}`}>
                {OUTCOMES.map((o) => (
                  <button
                    key={o.value} type="button" role="radio" aria-checked={current === o.value} title={o.help}
                    className={`text-xs font-medium px-2 py-1.5 rounded-lg border ${current === o.value ? o.on : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => onChange({ ...value, [i.id]: o.value })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Regresa: vuelve al inventario · Merma: regresó pero no sirve · No regresó: el cliente se lo quedó o se perdió.
      </p>
    </div>
  )
}
