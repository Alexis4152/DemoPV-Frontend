import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchProducts, getProductByBarcode } from '../api/products'
import { getCategories } from '../api/categories'
import { createSale } from '../api/sales'
import { getOpenCashCut } from '../api/cashCuts'
import { printSaleTicket } from '../utils/printer'
import { useNotify } from '../context/NotifyContext'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

/**
 * Página "Punto de Venta" (POS): pantalla operativa donde el cajero busca/escanea
 * productos, arma el carrito, elige la forma de pago y cobra. Es el flujo central del
 * sistema — todo lo demás (inventario, cortes de caja, reportes) gira alrededor de las
 * ventas que se registran aquí.
 *
 * Requisito de corte de caja abierto: al montar, la pantalla consulta si el cajero ya
 * tiene un corte de caja abierto (`getOpenCashCut`). Si no lo tiene, NO bloquea la
 * búsqueda ni el armado del carrito — el cajero puede seguir explorando productos — pero
 * sí deshabilita el botón de cobro y muestra un aviso con enlace a "Cortes de Caja" para
 * abrir uno; solo hasta que exista un corte abierto se puede completar el cobro
 * (`handleCheckout`).
 *
 * Validación de stock: el carrito nunca permite superar las existencias que el buscador
 * reportó al momento de agregar el producto (`product.stock`, guardado como snapshot en
 * cada línea del carrito). Como es un snapshot, si el stock real cambia en el servidor
 * mientras el producto ya está en el carrito (p. ej. otra caja vendió el mismo producto),
 * esta pantalla no se entera hasta que el backend rechace el cobro.
 *
 * Cambio en efectivo: cuando el método de pago es CASH, el cajero debe capturar con
 * cuánto paga el cliente antes de poder cobrar (el botón queda deshabilitado hasta que el
 * monto alcance el total) — el cambio a entregar se calcula en pantalla al instante, y el
 * backend vuelve a calcularlo y a guardarlo con la venta (aparece también en el ticket).
 */
export default function POS() {
  const { notify } = useNotify()
  const [printing, setPrinting] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [highlighted, setHighlighted] = useState(0)
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [amountReceived, setAmountReceived] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [cashCut, setCashCut] = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState('')
  const searchInputRef = useRef(null)

  // Al montar: revisa si el cajero ya tiene un corte de caja abierto (silenciosamente —
  // el .catch vacío trata "no hay corte abierto" como estado normal, no como error) y
  // carga las categorías para los chips de filtro rápido.
  useEffect(() => {
    getOpenCashCut().then((r) => setCashCut(r.data.data)).catch(() => {})
    getCategories().then((r) => setCategories(r.data.data ?? []))
  }, [])

  // Búsqueda de productos con debounce de 250ms para no golpear la API en cada tecla.
  // Si no hay texto ni categoría seleccionada, limpia resultados sin llamar al backend.
  // Con texto se piden hasta 8 coincidencias (autocompletar); solo con categoría (sin
  // texto) se listan hasta 50, a modo de catálogo navegable por categoría.
  useEffect(() => {
    if (!query.trim() && !categoryId) { setResults([]); return }
    const t = setTimeout(() => {
      searchProducts({ q: query || undefined, categoryId: categoryId || undefined, size: query.trim() ? 8 : 50 })
        .then((r) => { setResults(r.data.data ?? []); setHighlighted(0) })
    }, 250)
    return () => clearTimeout(t)
  }, [query, categoryId])

  /** Selecciona una categoría para filtrar el catálogo; volver a hacer clic en la misma la deselecciona (toggle). */
  function selectCategory(id) {
    setCategoryId((prev) => prev === id ? '' : id)
    searchInputRef.current?.focus()
  }

  /**
   * Agrega un producto al carrito, o incrementa su cantidad si ya estaba. Reglas de stock:
   * - Si el producto no tiene existencias (`stock <= 0`), no se agrega y se muestra un
   *   error visible.
   * - Si ya está en el carrito y sumar una unidad más superaría el stock disponible, la
   *   línea simplemente no cambia (sin mensaje de error) — el buscador ya muestra las
   *   existencias junto a cada resultado, así que se asume que el cajero puede verlas.
   * Al agregar, limpia la búsqueda y regresa el foco al input para poder seguir
   * escaneando/tecleando el siguiente producto sin usar el mouse.
   */
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

  /**
   * Navegación por teclado en el dropdown de resultados de búsqueda: flechas para mover
   * el resaltado, Enter para agregar un producto al carrito, Escape para cerrar el
   * dropdown. Pensado para que un cajero pueda operar el POS sin soltar el teclado, o
   * usando una pistola lectora de código de barras que simula tecleo + Enter.
   *
   * Al presionar Enter, se prioriza una búsqueda EXACTA por código de barras sobre el
   * resultado resaltado de la búsqueda por texto (`results`): un lector manda el Enter
   * casi de inmediato después de "teclear" el código, más rápido que el debounce de
   * 250ms de la búsqueda por texto, así que `results` puede seguir vacío/desactualizado
   * en ese instante. Si el texto no parece un código (trae espacios, es un nombre
   * tecleado a mano) o no hay coincidencia exacta, cae de vuelta al resaltado normal.
   */
  async function handleSearchKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const code = query.trim()
      if (code && !code.includes(' ')) {
        const exact = (await getProductByBarcode(code).catch(() => null))?.data?.data
        if (exact) { addToCart(exact); return }
      }
      const product = results[highlighted]
      if (product) addToCart(product)
      return
    }
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Escape') {
      setResults([])
    }
  }

  /**
   * Cambia la cantidad de una línea del carrito (usado por los botones +/- de la tabla).
   * Igual que en `addToCart`, la cantidad nunca puede bajar de 1 (para eso está
   * `removeItem`) ni superar el stock disponible que se capturó al agregar el producto;
   * en ambos casos el cambio simplemente se ignora, sin mensaje de error.
   */
  function updateQty(productId, qty) {
    if (qty < 1) return
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i
      if (i.stock != null && qty > i.stock) return i
      return { ...i, quantity: qty }
    }))
  }

  /** Quita por completo una línea del carrito. */
  function removeItem(productId) {
    setCart((prev) => prev.filter((i) => i.productId !== productId))
  }

  // El POS no maneja impuestos ni descuentos: el total a cobrar es simplemente la suma de
  // precio unitario × cantidad de cada línea del carrito.
  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  // Cambio a entregar en efectivo: solo tiene sentido para CASH, y solo una vez que el
  // cajero capturó un monto recibido válido (numérico y >= al total) — con cualquier otro
  // método de pago, o sin capturar nada todavía, queda en null (no se muestra ni se cobra).
  const amountReceivedNum = amountReceived === '' ? null : Number(amountReceived)
  const change = paymentMethod === 'CASH' && amountReceivedNum != null && !Number.isNaN(amountReceivedNum)
    ? amountReceivedNum - subtotal
    : null
  // En efectivo, cobrar exige un monto recibido válido que alcance para cubrir el total —
  // el backend vuelve a validar esto de todas formas, esta es solo la barrera de UI.
  const cashAmountMissing = paymentMethod === 'CASH' && (change === null || change < 0)

  /** Cambia el método de pago, limpiando el monto recibido si ya no aplica (no es CASH). */
  function handlePaymentMethodChange(value) {
    setPaymentMethod(value)
    if (value !== 'CASH') setAmountReceived('')
  }

  /**
   * Cobra el carrito: registra la venta en el backend (que la asocia al corte de caja
   * abierto del cajero) y muestra la pantalla de éxito con el ticket. No hace nada si el
   * carrito está vacío o si no hay corte de caja abierto (`cashCut`) — este último caso ya
   * debería estar cubierto por el botón deshabilitado, esta es una segunda barrera.
   *
   * Aviso de stock mínimo post-venta: antes de vaciar el carrito, calcula qué líneas
   * quedarán en su stock mínimo o por debajo (`stock - quantity <= minStock`) usando los
   * valores de stock que ya traía el carrito (no se vuelve a consultar el backend), y se
   * los pasa a la pantalla de éxito para avisarle al cajero que debe reabastecer pronto.
   * Si el backend rechaza la venta (p. ej. por stock insuficiente detectado del lado del
   * servidor), se muestra el mensaje de error y el carrito se conserva intacto para poder
   * corregir y reintentar.
   */
  async function handleCheckout() {
    if (cart.length === 0 || !cashCut || cashAmountMissing) return
    setLoading(true)
    setError('')
    try {
      const res = await createSale({
        customerName: customerName || null,
        customerEmail: customerEmail || null,
        paymentMethod,
        // Solo se manda en efectivo; el backend lo exige ahí y lo ignora para los demás
        // métodos, pero no tiene sentido enviarlo si el cajero ni lo capturó.
        amountReceived: paymentMethod === 'CASH' ? amountReceivedNum : undefined,
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
      })
      const lowStockWarnings = cart.filter((i) => i.minStock != null && (i.stock - i.quantity) <= i.minStock)
      setSuccess({ ...res.data.data, lowStockWarnings })
      setCart([])
      setCustomerName('')
      setCustomerEmail('')
      setAmountReceived('')
      // Se imprime "al vuelo": si la caja no tiene QZ Tray instalado/corriendo, o la
      // impresora está apagada, no debe tumbar la venta ya registrada — solo se avisa
      // para que el cajero pueda usar "Reimprimir ticket" en cuanto lo resuelva.
      printTicket(res.data.data.id)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al registrar venta')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Manda el ticket de una venta ya registrada a la impresora térmica vía QZ Tray (ver
   * `utils/printer.js`). Nunca bloquea el flujo de venta: si falla (impresora apagada,
   * QZ Tray no instalado, etc.) solo se avisa al cajero, quien puede reimprimir cuando
   * quiera desde la pantalla de éxito.
   */
  async function printTicket(saleId) {
    setPrinting(true)
    try {
      await printSaleTicket(saleId)
    } catch (err) {
      notify(err.message ?? 'No se pudo imprimir el ticket', 'error')
    } finally {
      setPrinting(false)
    }
  }

  // Pantalla de confirmación tras un cobro exitoso: reemplaza toda la pantalla del POS
  // (early return) hasta que el cajero pulse "Nueva venta", mostrando el folio, el total
  // y — si aplica — el aviso de productos que quedaron en stock mínimo (ver handleCheckout).
  if (success) {
    return (
      <div className="max-w-md mx-auto mt-16 card text-center">
        <div className="text-5xl mb-4">✅</div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Venta registrada</h3>
        <p className="text-gray-500 mb-1">Ticket #{success.id}</p>
        <p className="text-2xl font-bold text-purple-700 mb-1">{fmt(success.total)}</p>
        {success.amountReceived != null && (
          <div className="text-sm text-gray-500 mb-6">
            <p>Recibido: {fmt(success.amountReceived)}</p>
            <p className="font-semibold text-gray-700">Cambio: {fmt(success.changeGiven)}</p>
          </div>
        )}
        {success.amountReceived == null && <div className="mb-6" />}
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
        <button
          className="btn-secondary w-full mb-3"
          onClick={() => printTicket(success.id)}
          disabled={printing}
        >
          🖨️ {printing ? 'Imprimiendo…' : 'Reimprimir ticket'}
        </button>
        <button className="btn-primary" onClick={() => setSuccess(null)}>Nueva venta</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Product search */}
      <div className="flex-1 min-w-0">
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
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
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
          </div>
        )}
      </div>

      {/* Checkout panel */}
      <div className="w-full lg:w-80 lg:flex-shrink-0">
        <div className="card lg:sticky lg:top-0">
          <h3 className="font-bold text-gray-900 mb-4">Resumen</h3>

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Cliente (opcional)</label>
              <input className="input mt-1" placeholder="Nombre del cliente" value={customerName}
                onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Correo para enviar el ticket (opcional)</label>
              <input className="input mt-1" type="email" placeholder="cliente@correo.com" value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Método de pago</label>
              <select className="input mt-1" value={paymentMethod} onChange={(e) => handlePaymentMethodChange(e.target.value)}>
                <option value="CASH">💵 Efectivo</option>
                <option value="CARD">💳 Tarjeta</option>
                <option value="TRANSFER">🏦 Transferencia</option>
              </select>
            </div>

            {paymentMethod === 'CASH' && (
              <div>
                <label className="text-xs font-medium text-gray-600">¿Con cuánto paga el cliente?</label>
                <input
                  className="input mt-1"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                />
                {amountReceived !== '' && (
                  change != null && change >= 0 ? (
                    <p className="text-sm font-semibold text-green-600 mt-1">Cambio: {fmt(change)}</p>
                  ) : (
                    <p className="text-sm font-semibold text-red-500 mt-1">Falta {fmt(subtotal - amountReceivedNum)}</p>
                  )
                )}
              </div>
            )}
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
            disabled={cart.length === 0 || loading || !cashCut || cashAmountMissing}
            title={!cashCut ? 'Abre un corte de caja para poder cobrar' : cashAmountMissing ? 'Captura cuánto pagó el cliente en efectivo' : undefined}
          >
            {loading ? 'Procesando...'
              : !cashCut ? 'Abre un corte para cobrar'
              : cashAmountMissing ? 'Captura el monto recibido'
              : `Cobrar ${fmt(subtotal)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
