import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchProducts } from '../api/products'
import { getCategories } from '../api/categories'
import { createSale } from '../api/sales'
import { getOpenCashCut } from '../api/cashCuts'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

export default function POS() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [highlighted, setHighlighted] = useState(0)
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [customerName, setCustomerName] = useState('')
  const [cashCut, setCashCut] = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState('')
  const searchInputRef = useRef(null)

  useEffect(() => {
    getOpenCashCut().then((r) => setCashCut(r.data.data)).catch(() => {})
    getCategories().then((r) => setCategories(r.data.data ?? []))
  }, [])

  useEffect(() => {
    if (!query.trim() && !categoryId) { setResults([]); return }
    const t = setTimeout(() => {
      searchProducts({ q: query || undefined, categoryId: categoryId || undefined, size: query.trim() ? 8 : 50 })
        .then((r) => { setResults(r.data.data ?? []); setHighlighted(0) })
    }, 250)
    return () => clearTimeout(t)
  }, [query, categoryId])

  function selectCategory(id) {
    setCategoryId((prev) => prev === id ? '' : id)
    searchInputRef.current?.focus()
  }

  function addToCart(product) {
    if (product.stock <= 0) { setError(`"${product.name}" no tiene stock disponible`); return }
    setError('')
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        if (existing.quantity + 1 > product.stock) return prev
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { productId: product.id, productName: product.name, unitPrice: product.price, quantity: 1, stock: product.stock, minStock: product.minStock }]
    })
    setQuery('')
    setResults([])
    searchInputRef.current?.focus()
  }

  function handleSearchKeyDown(e) {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const product = results[highlighted]
      if (product) addToCart(product)
    } else if (e.key === 'Escape') {
      setResults([])
    }
  }

  function updateQty(productId, qty) {
    if (qty < 1) return
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i
      if (i.stock != null && qty > i.stock) return i
      return { ...i, quantity: qty }
    }))
  }

  function removeItem(productId) {
    setCart((prev) => prev.filter((i) => i.productId !== productId))
  }

  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  async function handleCheckout() {
    if (cart.length === 0 || !cashCut) return
    setLoading(true)
    setError('')
    try {
      const res = await createSale({
        customerName: customerName || null,
        paymentMethod,
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
      })
      const lowStockWarnings = cart.filter((i) => i.minStock != null && (i.stock - i.quantity) <= i.minStock)
      setSuccess({ ...res.data.data, lowStockWarnings })
      setCart([])
      setCustomerName('')
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al registrar venta')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto mt-16 card text-center">
        <div className="text-5xl mb-4">✅</div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Venta registrada</h3>
        <p className="text-gray-500 mb-1">Ticket #{success.id}</p>
        <p className="text-2xl font-bold text-purple-700 mb-6">{fmt(success.total)}</p>
        {success.lowStockWarnings?.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3 mb-6 text-left">
            ⚠️ Producto{success.lowStockWarnings.length > 1 ? 's' : ''} en nivel mínimo de stock:
            <ul className="list-disc list-inside mt-1">
              {success.lowStockWarnings.map((i) => (
                <li key={i.productId}>{i.productName} — quedan {i.stock - i.quantity}</li>
              ))}
            </ul>
          </div>
        )}
        <button className="btn-primary" onClick={() => setSuccess(null)}>Nueva venta</button>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Product search */}
      <div className="flex-1">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Punto de Venta</h2>

        {!cashCut && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-4">
            ⚠️ No hay corte de caja abierto. Debes <Link to="/cash-cuts" className="underline font-semibold">abrir un corte</Link> antes de poder registrar ventas.
          </div>
        )}

        {/* Categories */}
        <div className="flex gap-2 mb-3 flex-wrap">
          <button
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${!categoryId ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            onClick={() => selectCategory('')}
          >Todas</button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${String(categoryId) === String(c.id) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              onClick={() => selectCategory(c.id)}
            >{c.name}</button>
          ))}
        </div>

        <div className="relative mb-4">
          <input
            ref={searchInputRef}
            className="input pr-10"
            placeholder="Buscar producto por nombre o código... (↑↓ + Enter para seleccionar)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {results.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 mt-1 max-h-80 overflow-y-auto">
              {results.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full flex items-center justify-between px-4 py-3 text-left border-b last:border-0 ${idx === highlighted ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                  onMouseEnter={() => setHighlighted(idx)}
                  onClick={() => addToCart(p)}
                >
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.barcode} · Categoría: {p.category?.name ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-purple-700 text-sm block">{fmt(p.price)}</span>
                    <span className={`text-xs ${p.stock <= p.minStock ? 'text-red-500' : 'text-gray-400'}`}>
                      Disponibles: {p.stock}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart */}
        {cart.length === 0 ? (
          <div className="card text-center text-gray-400 py-16">
            <p className="text-3xl mb-2">🛒</p>
            <p>Busca productos para agregar al carrito</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Producto', 'Precio', 'Disp.', 'Cantidad', 'Subtotal', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cart.map((item) => (
                  <tr key={item.productId}>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                    <td className="px-4 py-3 text-gray-600">{fmt(item.unitPrice)}</td>
                    <td className="px-4 py-3 text-gray-400">{item.stock}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button className="w-6 h-6 rounded border text-gray-600 hover:bg-gray-100"
                          onClick={() => updateQty(item.productId, item.quantity - 1)}>−</button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <button className="w-6 h-6 rounded border text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                          disabled={item.stock != null && item.quantity >= item.stock}
                          onClick={() => updateQty(item.productId, item.quantity + 1)}>+</button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{fmt(item.unitPrice * item.quantity)}</td>
                    <td className="px-4 py-3">
                      <button className="text-red-400 hover:text-red-600" onClick={() => removeItem(item.productId)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Checkout panel */}
      <div className="w-80 flex-shrink-0">
        <div className="card sticky top-0">
          <h3 className="font-bold text-gray-900 mb-4">Resumen</h3>

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Cliente (opcional)</label>
              <input className="input mt-1" placeholder="Nombre del cliente" value={customerName}
                onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Método de pago</label>
              <select className="input mt-1" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="CASH">💵 Efectivo</option>
                <option value="CARD">💳 Tarjeta</option>
                <option value="TRANSFER">🏦 Transferencia</option>
              </select>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg text-gray-900">
              <span>Total</span><span className="text-purple-700">{fmt(subtotal)}</span>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

          <button
            className="btn-primary w-full py-3 text-base disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleCheckout}
            disabled={cart.length === 0 || loading || !cashCut}
            title={!cashCut ? 'Abre un corte de caja para poder cobrar' : undefined}
          >
            {loading ? 'Procesando...' : !cashCut ? 'Abre un corte para cobrar' : `Cobrar ${fmt(subtotal)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
