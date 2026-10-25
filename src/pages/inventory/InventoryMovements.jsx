import { useEffect, useState } from 'react'
import { getInventoryActivity, getInventoryActivityUsers } from '../../api/inventoryActivity'
import { toLocalDateStr, todayLocalDateStr } from '../../utils/date'
import useTableSort from '../../hooks/useTableSort'
import SortableTh from '../../components/SortableTh'
import { Pagination } from '../cashcuts/common'

// Acciones que se pueden filtrar, agrupadas como se muestran en el selector. Las de
// "Stock" son el origen de un movimiento (MovementSource en el backend); las de
// "Acciones" son la bitácora (InventoryAuditAction).
const ACTION_GROUPS = [
  {
    label: 'Movimientos de stock',
    options: [
      ['SALE', 'Venta'],
      ['SALE_CANCEL', 'Cancelación de venta'],
      ['APARTADO', 'Apartado'],
      ['APARTADO_RETURN', 'Apartado devuelto'],
      ['INITIAL_STOCK', 'Stock inicial'],
      ['MANUAL_IN', 'Entrada manual'],
      ['MERMA', 'Merma'],
      ['COUNT_DIFFERENCE', 'Diferencia de conteo'],
      ['RETURN_TO_SUPPLIER', 'Devolución a proveedor'],
      ['INTERNAL_USE', 'Uso interno'],
      ['MANUAL_OUT', 'Salida manual'],
      ['STOCK_IMPORT', 'Actualización de existencias'],
      ['RAW_MATERIAL', 'Desde materia prima'],
    ],
  },
  {
    label: 'Acciones',
    options: [
      ['PRODUCT_CREATED', 'Alta de producto'],
      ['PRODUCT_UPDATED', 'Edición de producto'],
      ['PRODUCT_DEACTIVATED', 'Baja de producto'],
      ['PRODUCT_REACTIVATED', 'Reactivación de producto'],
      ['BULK_IMPORT', 'Carga masiva'],
      ['STOCK_IMPORT_FILE', 'Archivo de existencias'],
      ['BARCODES_GENERATED', 'Generó códigos'],
      ['LABELS_PRINTED', 'Imprimió etiquetas'],
      ['EXPORT', 'Descarga'],
    ],
  },
]
const ACTION_LABELS = Object.fromEntries(ACTION_GROUPS.flatMap((g) => g.options))

// Color del badge: rojo salidas/bajas, verde entradas/altas, gris el resto.
const RED = new Set(['SALE', 'APARTADO', 'MERMA', 'COUNT_DIFFERENCE', 'RETURN_TO_SUPPLIER', 'INTERNAL_USE', 'MANUAL_OUT', 'PRODUCT_DEACTIVATED'])
const GREEN = new Set(['SALE_CANCEL', 'APARTADO_RETURN', 'INITIAL_STOCK', 'MANUAL_IN', 'RAW_MATERIAL', 'PRODUCT_CREATED', 'PRODUCT_REACTIVATED'])

// Tamaño de página inicial; el usuario lo cambia con "Mostrar N por página" (mismo
// componente Pagination que el resto de las tablas).
const DEFAULT_PAGE_SIZE = 20

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toLocalDateStr(d)
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Pestaña "Movimientos" de Inventario (solo admin/supervisor/super admin): todo lo que pasó
 * con el inventario — movimientos de stock (ventas, mermas, cargas de existencias...) y
 * acciones sin stock (altas, ediciones, bajas, carga masiva, descargas, códigos,
 * etiquetas) — con quién, cuándo y el detalle. Filtros por fechas, producto, categoría,
 * usuario y tipo de acción.
 *
 * @param {{ categories: Array<{id:number, name:string}> }} props Categorías de la tienda
 *        (las mismas que ya cargó Inventario).
 */
export default function InventoryMovements({ categories }) {
  const [from, setFrom] = useState(() => daysAgo(30))
  const [to, setTo] = useState(todayLocalDateStr)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [userId, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE)
  // Orden de la tabla por encabezado (se aplica en el servidor; ver useTableSort).
  const tableSort = useTableSort('sort:inventoryActivity')
  const onSort = (k) => { tableSort.toggle(k); setPage(0) }
  const [data, setData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Búsqueda por texto con debounce, para no pedir en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Cualquier cambio de filtro regresa a la primera página.
  useEffect(() => { setPage(0) }, [from, to, q, categoryId, userId, action])

  useEffect(() => {
    if (!from || !to) return
    getInventoryActivityUsers({ from, to }).then((r) => setUsers(r.data.data ?? [])).catch(() => setUsers([]))
  }, [from, to])

  useEffect(() => {
    if (!from || !to) return
    setLoading(true)
    setError('')
    getInventoryActivity({
      from, to, page, size,
      ...tableSort.params,
      q: q || undefined,
      categoryId: categoryId || undefined,
      userId: userId || undefined,
      action: action || undefined,
    })
      .then((r) => setData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
      .catch((err) => setError(err.response?.data?.message ?? 'No se pudieron cargar los movimientos'))
      .finally(() => setLoading(false))
  }, [from, to, q, categoryId, userId, action, page, size, tableSort.sort])

  const rows = data.content ?? []
  const hasFilters = q || categoryId || userId || action

  function clearFilters() {
    setSearch('')
    setCategoryId('')
    setUserId('')
    setAction('')
  }

  return (
    <div>
      <div className="card mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Desde</label>
          <input type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Hasta</label>
          <input type="date" className="input" value={to} min={from} max={todayLocalDateStr()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="lg:col-span-2">
          <label className="text-xs font-medium text-gray-600">Producto</label>
          <input className="input" placeholder="Nombre o código…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Categoría</label>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Usuario</label>
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Todos</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className="text-xs font-medium text-gray-600">Acción</label>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Todas</option>
            {ACTION_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {hasFilters && (
          <div className="flex items-end">
            <button type="button" className="text-sm text-purple-600 hover:underline pb-2" onClick={clearFilters}>Limpiar filtros</button>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <SortableTh label="Fecha" sortKey="date" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <SortableTh label="Usuario" sortKey="user" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <SortableTh label="Acción" sortKey="action" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <SortableTh label="Producto" sortKey="product" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cantidad</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Stock</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.userName}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    RED.has(r.action) ? 'bg-red-50 text-red-700' : GREEN.has(r.action) ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                    {ACTION_LABELS[r.action] ?? r.action}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.productName ? (
                    <>
                      <p className="text-gray-900">{r.productName}</p>
                      {r.productBarcode && <p className="text-xs text-gray-400 font-mono">{r.productBarcode}</p>}
                    </>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-semibold">
                  {r.quantity == null ? <span className="text-gray-300">—</span>
                    : <span className={r.quantity < 0 ? 'text-red-600' : 'text-green-600'}>{r.quantity > 0 ? `+${r.quantity}` : r.quantity}</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                  {r.previousStock == null ? <span className="text-gray-300">—</span> : <>{r.previousStock} → <span className="font-semibold">{r.newStock}</span></>}
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-xs break-words">{r.detail || <span className="text-gray-300">—</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{loading ? 'Cargando...' : 'Sin movimientos en este periodo'}</td></tr>
            )}
          </tbody>
        </table>
        </div>
        <Pagination
          page={page} size={size} totalElements={data.totalElements ?? 0} totalPages={data.totalPages ?? 0}
          count={rows.length} onPageChange={setPage} onSizeChange={(n) => { setSize(n); setPage(0) }}
        />
      </div>
    </div>
  )
}
