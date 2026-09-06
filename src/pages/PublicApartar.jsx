import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicTienda, getPublicCategories, getPublicProducts, createPublicApartado } from '../api/public'
import { applyTiendaBrand } from '../utils/theme'
import defaultLogo from '../assets/logo.png'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

/**
 * Tienda pública de apartados (`/apartar/:slug`) — la única pantalla de la aplicación que
 * un cliente final visita SIN cuenta ni login. El aislamiento entre tiendas de dueños
 * distintos lo da `slug` (de la URL), resuelto enteramente por el backend
 * (`PublicController`); esta página nunca ve ni necesita nada de otra tienda.
 *
 * Vive fuera del `Layout`/`PrivateRoute` de la app autenticada (ver `App.jsx`) — sin
 * sidebar, sin sesión. El color de marca de la tienda se aplica igual que en la app
 * autenticada (`applyTiendaBrand`), para que se sienta parte de "su" tienda.
 *
 * Flujo: explorar catálogo (con filtro de categoría) → agregar productos a una lista de
 * apartado (carrito local, sin persistir hasta enviar) → capturar datos de contacto →
 * enviar. La solicitud queda `PENDING` (el stock NO se descuenta todavía — lo hace un
 * cajero/admin al confirmarla) y aquí se muestra una confirmación simple, sin nada que
 * dé seguimiento en vivo (no hay cuenta con la que "iniciar sesión" después a consultarlo).
 */
export default function PublicApartar() {
  const { slug } = useParams()
  const [tienda, setTienda] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [pageData, setPageData] = useState({ content: [], totalPages: 0 })
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  const [cart, setCart] = useState([]) // [{ productId, name, price, stock, quantity }]
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    getPublicTienda(slug)
      .then((r) => { setTienda(r.data.data); applyTiendaBrand(r.data.data.primaryColor) })
      .catch(() => setNotFound(true))
    getPublicCategories(slug).then((r) => setCategories(r.data.data ?? [])).catch(() => {})
  }, [slug])

  // Debounce de 250ms sobre el texto de búsqueda (mismo patrón que Inventory.jsx/POS.jsx),
  // para no pegarle a la API en cada tecla; categoría/página disparan de inmediato.
  useEffect(() => {
    if (notFound) return
    setLoading(true)
    const t = setTimeout(() => {
      getPublicProducts(slug, { categoryId: categoryId || undefined, q: search.trim() || undefined, page, size: 12 })
        .then((r) => setPageData(r.data.data ?? { content: [], totalPages: 0 }))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [slug, categoryId, search, page, notFound])

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        if (existing.quantity >= product.stock) return prev
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      // `price` es lo que de verdad se cobra (ya con la oferta aplicada, si tiene);
      // `originalPrice` solo se usa para mostrarlo tachado en el carrito.
      return [...prev, {
        productId: product.id, name: product.name,
        price: product.finalPrice ?? product.price, originalPrice: product.price,
        stock: product.stock, quantity: 1,
      }]
    })
  }

  function updateQty(productId, qty) {
    if (qty < 1) { setCart((prev) => prev.filter((i) => i.productId !== productId)); return }
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: Math.min(qty, i.stock) } : i))
  }

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    if (cart.length === 0) { setError('Agrega al menos un producto'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await createPublicApartado(slug, {
        customerName,
        customerPhone: customerPhone || null,
        customerEmail: customerEmail || null,
        notes: notes || null,
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      })
      setSuccess(res.data.data)
      setCart([])
      setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setNotes('')
    } catch (err) {
      setError(err.response?.data?.message ?? 'No se pudo registrar tu apartado')
    } finally {
      setSubmitting(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-purple-50/40 px-4">
        <div className="text-center">
          <p className="text-4xl mb-3">🔍</p>
          <h1 className="text-xl font-bold text-gray-800">Tienda no encontrada</h1>
          <p className="text-gray-500 text-sm mt-1">Revisa el link, o esta tienda todavía no tiene apartados habilitados.</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-purple-50/40 px-4">
        <div className="card max-w-md w-full text-center border-t-2 border-t-purple-400">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">¡Apartado registrado!</h2>
          <p className="text-gray-500 text-sm mb-4">Folio #{success.id} — en breve la tienda te confirmará.</p>
          <div className="text-left bg-purple-50/60 rounded-lg p-4 mb-4 text-sm">
            {success.items.map((i, idx) => (
              <div key={idx} className="flex justify-between py-1">
                <span>{Number(i.quantity)} x {i.productName}</span>
                <span className="font-medium">{fmt(i.subtotal)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 mt-2 border-t border-purple-100 font-bold text-purple-800">
              <span>Total</span><span>{fmt(success.total)}</span>
            </div>
          </div>
          <button className="btn-primary w-full" onClick={() => setSuccess(null)}>Hacer otro apartado</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-purple-50/40">
      {/* Encabezado con el color de marca de la tienda (--brand-*, ver utils/theme.js) a
          todo lo ancho — antes solo aparecía en botones/acentos chicos, aquí es lo primero
          que se ve al entrar, para que la vitrina se sienta "de esa tienda" y no genérica. */}
      <header className="bg-gradient-to-r from-purple-700 to-purple-900 px-4 py-5 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        {/* Mismo fallback que el sidebar/Datos de la tienda (Layout.jsx/StoreInfo.jsx): si
            la tienda no subió un logo propio, se usa el de Nexora en vez de dejar el
            encabezado sin nada. */}
        <img src={tienda?.logoPath || defaultLogo} alt={tienda?.name ?? 'Logo'} className="w-11 h-11 rounded-full object-cover border-2 border-white/40" />
        <div>
          <h1 className="font-bold text-white">{tienda?.name ?? 'Cargando...'}</h1>
          <p className="text-xs text-purple-100">Aparta tus productos favoritos</p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Catálogo */}
        <div className="lg:col-span-2">
          <input
            className="input mb-3" placeholder="🔍 Buscar producto por nombre..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          />
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${!categoryId ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-purple-700 border-purple-200'}`}
              onClick={() => { setCategoryId(''); setPage(0) }}
            >Todas</button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${String(categoryId) === String(c.id) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-purple-700 border-purple-200'}`}
                onClick={() => { setCategoryId(c.id); setPage(0) }}
              >{c.name}</button>
            ))}
          </div>

          {loading ? (
            <p className="text-gray-400 text-sm text-center py-12">Cargando productos...</p>
          ) : pageData.content.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-12">
              {search.trim() ? `No encontramos productos con "${search.trim()}".` : 'Todavía no hay productos disponibles para apartar.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {pageData.content.map((p) => (
                <div key={p.id} className="card p-3 flex flex-col border-t-2 border-t-purple-300">
                  <div className="w-full aspect-square bg-purple-50 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">📦</span>
                    )}
                  </div>
                  <p className="font-medium text-sm text-gray-900 line-clamp-2">{p.name}</p>
                  {p.discountPercent > 0 ? (
                    <div className="mt-1">
                      <span className="text-xs text-gray-400 line-through mr-1">{fmt(p.price)}</span>
                      <span className="text-xs font-bold bg-red-500 text-white px-1.5 py-0.5 rounded">-{Number(p.discountPercent)}%</span>
                      <p className="font-bold text-purple-700">{fmt(p.finalPrice)}</p>
                    </div>
                  ) : (
                    <p className="font-bold text-purple-700 mt-1">{fmt(p.price)}</p>
                  )}
                  <button className="btn-primary text-xs mt-2 py-1.5" onClick={() => addToCart(p)}>+ Apartar</button>
                </div>
              ))}
            </div>
          )}

          {pageData.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button className="btn-secondary py-1 px-3 text-xs disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
              <span className="text-xs text-purple-700 font-medium self-center">Página {page + 1} de {pageData.totalPages}</span>
              <button className="btn-secondary py-1 px-3 text-xs disabled:opacity-40" disabled={page + 1 >= pageData.totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          )}
        </div>

        {/* Carrito + formulario */}
        <div className="card h-fit sticky top-20 border-t-2 border-t-purple-400">
          <h3 className="font-bold text-purple-800 mb-3">🛍️ Tu apartado</h3>
          {cart.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Agrega productos del catálogo</p>
          ) : (
            <div className="space-y-2 mb-4">
              {cart.map((i) => (
                <div key={i.productId} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-gray-800">{i.name}</p>
                    <p className="text-xs text-gray-400">
                      {i.originalPrice > i.price && <span className="line-through mr-1">{fmt(i.originalPrice)}</span>}
                      {fmt(i.price)} c/u
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="w-6 h-6 rounded border border-purple-200 text-purple-700 hover:bg-purple-50" onClick={() => updateQty(i.productId, i.quantity - 1)}>−</button>
                    <span className="w-6 text-center">{i.quantity}</span>
                    <button className="w-6 h-6 rounded border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-30" disabled={i.quantity >= i.stock} onClick={() => updateQty(i.productId, i.quantity + 1)}>+</button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-gray-100 font-bold text-gray-900">
                <span>Total</span><span>{fmt(total)}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Tu nombre *</label>
              <input className="input" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Teléfono *</label>
              <input className="input" required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Para avisarte cuando esté listo" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Correo (opcional)</label>
              <input className="input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Notas (opcional)</label>
              <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={submitting || cart.length === 0}>
              {submitting ? 'Enviando...' : 'Enviar solicitud de apartado'}
            </button>
            <p className="text-xs text-gray-400 text-center">No se cobra nada en línea — pagas al recogerlo en la tienda.</p>
          </form>
        </div>
      </div>
    </div>
  )
}
