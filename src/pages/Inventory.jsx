import { useEffect, useRef, useState } from 'react'
import { getProducts, createProduct, updateProduct, adjustStock, deleteProduct, searchProducts, getProductByBarcode } from '../api/products'
import { getCategories, createCategory } from '../api/categories'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

const emptyForm = { name: '', description: '', barcode: '', price: '', cost: '', stock: '', minStock: 5, unit: 'pieza', categoryId: '' }

/**
 * Página "Inventario": administración del catálogo de productos de la tienda del usuario
 * (alta/edición/desactivación) y ajustes manuales de stock fuera del flujo normal de venta
 * (entradas por compra, salidas por merma/corrección). También muestra un aviso persistente
 * con los productos que están en su stock mínimo o por debajo (`lowStockItems`).
 *
 * A diferencia de páginas como Sales/CashCuts, esta pantalla NO pagina contra el backend:
 * `getProducts()` trae el catálogo completo de la tienda y el filtro de texto/categoría
 * (`filtered`) se aplica en el cliente sobre ese arreglo ya cargado.
 *
 * Control de acceso (vía `isAdmin`, solo frontend — el backend es quien realmente lo hace
 * cumplir): crear/editar/desactivar productos y registrar salidas de stock (ajuste "OUT",
 * es decir reducir stock manualmente fuera de una venta) están reservados a ADMIN. Cualquier
 * usuario con acceso a esta pantalla puede registrar entradas de stock ("IN").
 *
 * Lector de código de barras (altas/bajas): el campo "Escanear código de barras" es
 * independiente del filtro de texto — al presionar Enter (lo que manda un lector
 * automáticamente tras "teclear" el código) hace una búsqueda EXACTA. Si el código ya
 * existe, abre directo el modal de "Ajustar stock" de ese producto (en modo "Agregar
 * piezas", pensado para registrar mercancía que va llegando); si no existe, abre el modal
 * de "Nuevo producto" con el código ya precargado, para dar de alta sin volver a teclearlo.
 */
export default function Inventory() {
  const { isAdmin } = useAuth()
  const { notify, confirmDialog } = useNotify()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [adjustModal, setAdjustModal] = useState(null)
  const [adjustDirection, setAdjustDirection] = useState('IN')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lowStockItems, setLowStockItems] = useState([])
  const [adjustNotice, setAdjustNotice] = useState('')
  const [scanCode, setScanCode] = useState('')
  const scanInputRef = useRef(null)

  /**
   * Recarga, en paralelo, las tres fuentes de datos que usa la pantalla: el catálogo
   * completo de productos, las categorías (para el filtro y el formulario), y la lista de
   * productos en stock mínimo o por debajo (`lowStock: true`, hasta 200) que alimenta el
   * aviso amarillo persistente. Se llama tanto al montar como después de cualquier
   * operación que pueda cambiar existencias o catálogo (guardar producto, ajustar stock,
   * desactivar producto).
   */
  function load() {
    getProducts().then((r) => setProducts(r.data.data ?? []))
    getCategories().then((r) => setCategories(r.data.data ?? []))
    searchProducts({ lowStock: true, size: 200 }).then((r) => setLowStockItems(r.data.data ?? []))
  }

  useEffect(() => { load() }, [])

  // Filtro 100% client-side (no hay paginación server-side en esta pantalla): busca por
  // nombre o código de barras y opcionalmente restringe a una categoría.
  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    const matchQ = !q || p.name?.toLowerCase().includes(q) || p.barcode?.includes(q)
    const matchC = !filterCat || String(p.category?.id) === filterCat
    return matchQ && matchC
  })

  /**
   * Abre el modal de producto en modo "alta": limpia el formulario y cualquier error
   * previo. Si viene de un escaneo de un código desconocido (`prefillBarcode`), lo
   * precarga en el formulario para no tener que volver a teclearlo.
   */
  function openNew(prefillBarcode) {
    setEditProduct(null)
    setForm({ ...emptyForm, barcode: prefillBarcode ?? '' })
    setError('')
    setShowModal(true)
  }

  /** Abre el modal de producto en modo "edición", precargando el formulario con los datos del producto seleccionado. */
  function openEdit(p) {
    setEditProduct(p)
    setForm({
      name: p.name, description: p.description ?? '', barcode: p.barcode ?? '',
      price: p.price, cost: p.cost ?? '', stock: p.stock,
      minStock: p.minStock, unit: p.unit, categoryId: p.category?.id ?? ''
    })
    setError('')
    setShowModal(true)
  }

  /**
   * Maneja el Enter del campo "Escanear código de barras" (lo manda automáticamente un
   * lector tras "teclear" el código). Busca coincidencia EXACTA: si el producto ya existe,
   * abre directo su modal de "Ajustar stock" en modo "Agregar piezas" (pensado para
   * registrar mercancía entrante); si no existe, abre "Nuevo producto" con el código ya
   * precargado. En ambos casos limpia el campo para poder seguir escaneando de corrido.
   */
  async function handleScanKeyDown(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const code = scanCode.trim()
    if (!code) return
    setScanCode('')
    const found = (await getProductByBarcode(code).catch(() => null))?.data?.data
    if (found) {
      setAdjustModal(found)
      setAdjustDirection('IN')
      setAdjustQty('')
      setAdjustReason('')
    } else {
      notify(`Código "${code}" no encontrado — completa los datos para darlo de alta`, 'info')
      openNew(code)
    }
    scanInputRef.current?.focus()
  }

  /**
   * Guarda el formulario de producto, ya sea creando uno nuevo o actualizando
   * `editProduct` según cuál esté seteado. Convierte los campos numéricos (vienen como
   * string desde los inputs) antes de enviarlos. Si el backend rechaza la operación,
   * muestra el mensaje de error dentro del propio modal (no usa `notify`) para que el
   * usuario pueda corregir sin perder lo capturado. Al guardar con éxito cierra el modal
   * y recarga el catálogo completo (para reflejar el nuevo/actualizado producto y, si
   * cambió el stock inicial, el aviso de stock mínimo).
   */
  async function handleSave(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = { ...form, price: Number(form.price), cost: form.cost ? Number(form.cost) : null,
        stock: Number(form.stock), minStock: Number(form.minStock), categoryId: Number(form.categoryId) }
      if (editProduct) await updateProduct(editProduct.id, payload)
      else await createProduct(payload)
      setShowModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  // Valores derivados del modal de "Ajustar stock", recalculados en cada render mientras
  // el modal está abierto:
  // - adjustQtyNum: cantidad siempre positiva que el usuario capturó (el signo lo decide
  //   `adjustDirection`, no el input).
  // - adjustSignedQty: la cantidad ya con signo según la dirección elegida (IN suma, OUT
  //   resta) — es lo que se manda al backend.
  // - adjustPreviewStock: stock resultante que se le muestra al usuario ANTES de confirmar,
  //   para que vea el efecto del ajuste; si queda negativo, el formulario bloquea el envío
  //   (ver `disabled` del botón "Guardar" más abajo) porque el stock no puede ser negativo.
  const adjustQtyNum = Math.abs(Number(adjustQty) || 0)
  const adjustSignedQty = adjustDirection === 'OUT' ? -adjustQtyNum : adjustQtyNum
  const adjustPreviewStock = adjustModal ? adjustModal.stock + adjustSignedQty : null

  /**
   * Envía el ajuste manual de stock (entrada o salida, ver `adjustSignedQty`) para el
   * producto en `adjustModal`. Tras un ajuste exitoso recarga el catálogo/lista de stock
   * mínimo y, si el producto quedó en su nivel mínimo o por debajo, muestra un aviso rojo
   * adicional (`adjustNotice`) con el nombre y las existencias restantes — distinto del
   * aviso amarillo general de `lowStockItems`, que solo se refresca al volver a cargar.
   */
  async function handleAdjust(e) {
    e.preventDefault()
    if (adjustSignedQty === 0) return
    setLoading(true)
    try {
      const res = await adjustStock(adjustModal.id, { quantity: adjustSignedQty, reason: adjustReason })
      const updated = res.data.data
      setAdjustModal(null)
      setAdjustQty('')
      setAdjustReason('')
      load()
      if (updated && updated.stock <= updated.minStock) {
        setAdjustNotice(`⚠️ "${updated.name}" ya está en su nivel mínimo de stock (${updated.stock} ${updated.unit} disponibles)`)
      }
    } catch (err) {
      notify(err.response?.data?.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Da de baja un producto. Pide confirmación primero. El texto de la UI ("Desactivar",
   * no "Eliminar") sugiere que el backend hace una baja lógica (soft delete) en vez de
   * borrar el registro, para conservar el historial de ventas/movimientos que lo
   * referencian — pero esto no puede confirmarse desde el frontend, solo se documenta lo
   * que la UI comunica.
   */
  async function handleDelete(p) {
    if (!(await confirmDialog(`¿Desactivar "${p.name}"?`, { confirmText: 'Desactivar' }))) return
    await deleteProduct(p.id)
    load()
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Inventario</h2>
        {isAdmin && <button className="btn-primary" onClick={() => openNew()}>+ Nuevo producto</button>}
      </div>

      {adjustNotice && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <span>{adjustNotice}</span>
          <button className="text-red-400 hover:text-red-600 ml-4" onClick={() => setAdjustNotice('')}>✕</button>
        </div>
      )}

      {lowStockItems.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3 mb-4">
          ⚠️ {lowStockItems.length} producto{lowStockItems.length > 1 ? 's' : ''} en stock mínimo o por debajo: {' '}
          {lowStockItems.map((p) => p.name).join(', ')}
        </div>
      )}

      {/* Escaneo de código de barras: alta/ajuste rápido, independiente del filtro de abajo */}
      <div className="card mb-4 bg-purple-50/50 border-purple-100">
        <label className="text-xs font-medium text-gray-600 block mb-1">📷 Escanear código de barras (alta / ajuste rápido)</label>
        <input
          ref={scanInputRef}
          className="input"
          placeholder="Escanea o teclea el código y presiona Enter..."
          value={scanCode}
          onChange={(e) => setScanCode(e.target.value)}
          onKeyDown={handleScanKeyDown}
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <input className="input sm:max-w-xs" placeholder="Buscar por nombre o código..." value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <select className="input sm:max-w-xs" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Producto', 'Categoría', 'Código', 'Precio', 'Stock', 'Mín.', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 text-gray-500">{p.category?.name}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.barcode}</td>
                <td className="px-4 py-3 text-gray-700">{fmt(p.price)}</td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${p.stock <= p.minStock ? 'text-red-600' : 'text-green-600'}`}>
                    {p.stock} {p.unit}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">{p.minStock}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    {isAdmin && (
                      <button className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(p)}>Editar</button>
                    )}
                    <button className="text-purple-600 hover:underline text-xs"
                      onClick={() => { setAdjustModal(p); setAdjustDirection('IN'); setAdjustQty(''); setAdjustReason('') }}>Ajustar</button>
                    {isAdmin && (
                      <button className="text-red-500 hover:underline text-xs" onClick={() => handleDelete(p)}>Desact.</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin productos</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Product modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editProduct ? 'Editar producto' : 'Nuevo producto'}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-600">Nombre *</label>
                  <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="text-xs font-medium text-gray-600">Código de barras</label>
                  <input className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
                <div><label className="text-xs font-medium text-gray-600">Precio venta *</label>
                  <input className="input" type="number" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                <div><label className="text-xs font-medium text-gray-600">Costo</label>
                  <input className="input" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
                <div><label className="text-xs font-medium text-gray-600">Stock inicial</label>
                  <input className="input" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
                <div><label className="text-xs font-medium text-gray-600">Stock mínimo</label>
                  <input className="input" type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></div>
                <div><label className="text-xs font-medium text-gray-600">Unidad</label>
                  <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
                <div><label className="text-xs font-medium text-gray-600">Categoría *</label>
                  <select className="input" required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
              </div>
              <div><label className="text-xs font-medium text-gray-600">Descripción</label>
                <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust modal */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-1">Ajustar stock</h3>
            <p className="text-sm text-gray-500 mb-4">{adjustModal.name} — actual: {adjustModal.stock} {adjustModal.unit}</p>
            <form onSubmit={handleAdjust} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">¿Qué quieres hacer? *</label>
                <div className={`grid gap-2 ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <button type="button"
                    className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      adjustDirection === 'IN' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => setAdjustDirection('IN')}
                  >➕ Agregar piezas</button>
                  {isAdmin && (
                    <button type="button"
                      className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        adjustDirection === 'OUT' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                      onClick={() => setAdjustDirection('OUT')}
                    >➖ Quitar piezas</button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Cantidad de piezas *</label>
                <div className="flex items-center gap-2">
                  <button type="button" className="w-9 h-9 rounded border text-gray-600 hover:bg-gray-100 text-lg leading-none"
                    onClick={() => setAdjustQty((q) => String(Math.max(0, (Number(q) || 0) - 1)))}>−</button>
                  <input className="input text-center" type="number" min="1" required value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)} />
                  <button type="button" className="w-9 h-9 rounded border text-gray-600 hover:bg-gray-100 text-lg leading-none"
                    onClick={() => setAdjustQty((q) => String((Number(q) || 0) + 1))}>+</button>
                </div>
              </div>
              {adjustQtyNum > 0 && (
                <div className={`text-sm rounded-lg px-3 py-2 ${adjustPreviewStock < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
                  Nuevo stock: <span className="font-bold">{adjustPreviewStock}</span> {adjustModal.unit}
                  {adjustPreviewStock < 0 && ' — no puede ser negativo'}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600">Motivo</label>
                <input className="input" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Compra, merma, corrección..." />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setAdjustModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={loading || adjustQtyNum === 0 || adjustPreviewStock < 0}>
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
