import { useEffect, useState } from 'react'
import { getProducts, createProduct, updateProduct, adjustStock, deleteProduct, searchProducts } from '../api/products'
import { getCategories, createCategory } from '../api/categories'
import { useAuth } from '../context/AuthContext'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

const emptyForm = { name: '', description: '', barcode: '', price: '', cost: '', stock: '', minStock: 5, unit: 'pieza', categoryId: '' }

export default function Inventory() {
  const { isAdmin } = useAuth()
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

  function load() {
    getProducts().then((r) => setProducts(r.data.data ?? []))
    getCategories().then((r) => setCategories(r.data.data ?? []))
    searchProducts({ lowStock: true, size: 200 }).then((r) => setLowStockItems(r.data.data ?? []))
  }

  useEffect(() => { load() }, [])

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    const matchQ = !q || p.name?.toLowerCase().includes(q) || p.barcode?.includes(q)
    const matchC = !filterCat || String(p.category?.id) === filterCat
    return matchQ && matchC
  })

  function openNew() {
    setEditProduct(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

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

  const adjustQtyNum = Math.abs(Number(adjustQty) || 0)
  const adjustSignedQty = adjustDirection === 'OUT' ? -adjustQtyNum : adjustQtyNum
  const adjustPreviewStock = adjustModal ? adjustModal.stock + adjustSignedQty : null

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
      alert(err.response?.data?.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(p) {
    if (!confirm(`¿Desactivar "${p.name}"?`)) return
    await deleteProduct(p.id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Inventario</h2>
        {isAdmin && <button className="btn-primary" onClick={openNew}>+ Nuevo producto</button>}
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

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input className="input max-w-xs" placeholder="Buscar por nombre o código..." value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-xs" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
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
                      <>
                        <button className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(p)}>Editar</button>
                        <button className="text-purple-600 hover:underline text-xs"
                          onClick={() => { setAdjustModal(p); setAdjustDirection('IN'); setAdjustQty(''); setAdjustReason('') }}>Ajustar</button>
                        <button className="text-red-500 hover:underline text-xs" onClick={() => handleDelete(p)}>Desact.</button>
                      </>
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

      {/* Product modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold mb-4">{editProduct ? 'Editar producto' : 'Nuevo producto'}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-1">Ajustar stock</h3>
            <p className="text-sm text-gray-500 mb-4">{adjustModal.name} — actual: {adjustModal.stock} {adjustModal.unit}</p>
            <form onSubmit={handleAdjust} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">¿Qué quieres hacer? *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      adjustDirection === 'IN' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => setAdjustDirection('IN')}
                  >➕ Agregar piezas</button>
                  <button type="button"
                    className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      adjustDirection === 'OUT' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => setAdjustDirection('OUT')}
                  >➖ Quitar piezas</button>
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
