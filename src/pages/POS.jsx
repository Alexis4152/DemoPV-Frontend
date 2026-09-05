import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchProducts, getProductByBarcode } from '../api/products'
import { getCategories } from '../api/categories'
import { createSale } from '../api/sales'
import { getOpenCashCut } from '../api/cashCuts'
import { printSaleTicket } from '../utils/printer'
import { useNotify } from '../context/NotifyContext'
import { useAuth } from '../context/AuthContext'

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
  const { notify, confirmDialog } = useNotify()
  const { user } = useAuth()
  // Límites de descuento por línea que el ADMIN fijó en "Datos de la tienda" (ver
  // `resolveDiscountCap`); llegan como parte de la sesión (`user.tienda`), sin necesitar
  // una llamada aparte — se actualizan solos si el admin los cambia y refresca su sesión.
  const tienda = user?.tienda
  // Sin ningún límite configurado por el ADMIN, los descuentos quedan deshabilitados por
  // completo (ver `resolveDiscountCap`) — no hay un "sin restricción" implícito.
  const discountsDisabled = tienda?.maxDiscountAmount == null && tienda?.maxDiscountPercent == null
  const [printing, setPrinting] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [highlighted, setHighlighted] = useState(0)
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  // Se incrementa cada vez que se hace clic en un chip de categoría (incluso el que ya
  // está activo) para forzar una recarga del catálogo — ver `selectCategory` y el
  // `useEffect` de búsqueda: sin esto, clicar de nuevo la misma categoría no cambia
  // `categoryId` y por lo tanto no dispara ninguna recarga por sí solo.
  const [browseRefresh, setBrowseRefresh] = useState(0)
  const [cart, setCart] = useState([])
  // Ids de las líneas del carrito marcadas con su checkbox, para quitar varias a la vez
  // sin tener que darle ✕ una por una (ver `toggleSelectAll`/`removeSelected`).
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [amountReceived, setAmountReceived] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  // 'physical': imprime en la impresora térmica al cobrar, igual que siempre. 'digital': no
  // imprime nada, solo envía el ticket en PDF por correo — por eso exige capturar el email
  // (ver `digitalEmailMissing` y el label del campo, más abajo).
  const [ticketType, setTicketType] = useState('physical')
  const [cashCut, setCashCut] = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState('')
  const searchInputRef = useRef(null)
  const successRef = useRef(success)
  const searchBoxRef = useRef(null)

  // Al montar: revisa si el cajero ya tiene un corte de caja abierto (silenciosamente —
  // el .catch vacío trata "no hay corte abierto" como estado normal, no como error) y
  // carga las categorías para los chips de filtro rápido.
  useEffect(() => {
    getOpenCashCut().then((r) => setCashCut(r.data.data)).catch(() => {})
    getCategories().then((r) => setCategories(r.data.data ?? []))
  }, [])

  useEffect(() => { successRef.current = success }, [success])

  // Captura de escaneo "global": una pistola lectora de código de barras funciona como un
  // teclado que teclea cada carácter en milisegundos y termina con Enter — mucho más rápido
  // que cualquier persona escribiendo a mano. Este listener vive en todo el documento (no
  // solo en el input de búsqueda) para que un escaneo agregue el producto al carrito sin
  // importar en qué campo esté el foco (cliente, correo, monto recibido, o ninguno).
  //
  // Para no confundir un tecleo humano normal con un escaneo, se descarta cualquier
  // secuencia donde el tiempo entre teclas supere SCAN_GAP_MS: si al momento de Enter la
  // última tecla no llegó "pegada" a las anteriores, se asume que fue un Enter cualquiera
  // (enviar un formulario, etc.) y se ignora. Cuando el foco ya está en el buscador del POS,
  // se deja pasar: ese input ya maneja su propio Enter con prioridad a código exacto.
  useEffect(() => {
    const SCAN_GAP_MS = 50
    const MIN_CODE_LENGTH = 3
    let buffer = ''
    let lastTime = 0

    function onKeyDown(e) {
      if (successRef.current || e.ctrlKey || e.metaKey || e.altKey) return
      const now = Date.now()
      const gap = now - lastTime
      lastTime = now

      if (e.key === 'Enter') {
        const code = buffer
        buffer = ''
        if (code.length < MIN_CODE_LENGTH || gap >= SCAN_GAP_MS) return
        if (document.activeElement === searchInputRef.current) return
        e.preventDefault()
        getProductByBarcode(code).then((r) => {
          const product = r?.data?.data
          if (product) addToCart(product)
          else notify(`Código "${code}" no encontrado`, 'error')
        }).catch(() => notify(`Código "${code}" no encontrado`, 'error'))
        return
      }

      if (e.key.length === 1) {
        buffer = gap < SCAN_GAP_MS ? buffer + e.key : e.key
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Búsqueda de productos con debounce de 250ms para no golpear la API en cada tecla.
  // Con texto se piden hasta 8 coincidencias (autocompletar); sin texto se listan hasta 50
  // (con o sin categoría — "Todas" también es un catálogo navegable, no solo las
  // categorías específicas). `browseRefresh` fuerza una recarga cuando se hace clic en un
  // chip de categoría aunque `categoryId` no cambie de valor (ver `selectCategory`).
  useEffect(() => {
    const t = setTimeout(() => {
      searchProducts({ q: query || undefined, categoryId: categoryId || undefined, size: query.trim() ? 8 : 50 })
        .then((r) => { setResults(r.data.data ?? []); setHighlighted(0) })
    }, 250)
    return () => clearTimeout(t)
  }, [query, categoryId, browseRefresh])

  // Cierra la lista de resultados/catálogo con un clic afuera o Escape — sobre todo
  // importante navegando por categoría, donde la lista ya no se cierra sola al agregar un
  // producto (ver `addToCart`) y antes no había ninguna forma de quitarla de encima sin
  // cambiar de categoría. Van en un listener del documento (no en el `onKeyDown` del
  // input) para que funcionen aunque el foco ya no esté en el buscador — p. ej. después de
  // hacer scroll dentro de la lista con el mouse.
  useEffect(() => {
    function onPointerDown(e) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setResults([])
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setResults([])
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  /**
   * Selecciona una categoría para filtrar el catálogo (o "Todas" con `id=''`, que quita el
   * filtro). Ya NO alterna al volver a hacer clic en la misma categoría — antes eso la
   * deseleccionaba (toggle), lo cual, combinado con cerrar la lista con clic afuera/Escape,
   * dejaba sin ninguna forma de "recargarla" sin cambiar de categoría e ir y volver.
   * `browseRefresh` fuerza la recarga siempre, incluso si `categoryId` termina en el mismo
   * valor que ya tenía.
   */
  function selectCategory(id) {
    setCategoryId(id)
    setBrowseRefresh((n) => n + 1)
    searchInputRef.current?.focus()
  }

  /**
   * Agrega un producto al carrito, o incrementa su cantidad si ya estaba. Reglas de stock:
   * - Si el producto no tiene existencias (`stock <= 0`), no se agrega y se muestra un
   *   error visible.
   * - Si ya está en el carrito y sumar una unidad más superaría el stock disponible, la
   *   línea simplemente no cambia (sin mensaje de error) — el buscador ya muestra las
   *   existencias junto a cada resultado, así que se asume que el cajero puede verlas.
   * Al agregar, si el cajero estaba tecleando una búsqueda por texto, la limpia junto con
   * los resultados (buscó un producto puntual, lo agregó, listo para el siguiente). Pero
   * si solo estaba navegando una categoría (sin texto, el buscador funciona como catálogo
   * navegable — ver el `useEffect` de arriba), la lista se queda tal cual: limpiarla ahí
   * dejaba la pantalla sin nada que mostrar hasta cambiar de categoría y regresar, ya que
   * nada vuelve a pedirla sola (el `useEffect` solo reacciona a cambios de `query`/
   * `categoryId`, no a que la lista se haya vaciado). Siempre regresa el foco al input
   * para poder seguir escaneando/tecleando o clicando el siguiente producto sin fricción.
   *
   * Muestra un toast rápido ("<producto> agregado") cada vez que sí se agrega — sobre
   * todo útil navegando por categoría, donde el carrito no siempre está a la vista y sin
   * esto no había ninguna confirmación de qué se acababa de agregar. No se muestra si el
   * intento no cambió nada (sin stock, o ya en el tope de existencias).
   */
  function addToCart(product) {
    if (product.stock <= 0) { setError(`"${product.name}" no tiene stock disponible`); return }
    const existingBefore = cart.find((i) => i.productId === product.id)
    if (existingBefore && existingBefore.quantity + 1 > product.stock) return
    setError('')
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, {
        productId: product.id, productName: product.name, unitPrice: product.price, quantity: 1,
        stock: product.stock, minStock: product.minStock,
        // Descuento por línea: 'amount' ($ fijo) o 'percent' (%) sobre esta línea — ver
        // `lineDiscount`/`lineSubtotal` para cómo se resuelve a un monto en pesos.
        discountType: 'amount', discountValue: '',
      }]
    })
    notify(`"${product.name}" agregado al carrito`, 'success')
    if (query.trim()) {
      setQuery('')
      setResults([])
    }
    searchInputRef.current?.focus()
  }

  /**
   * Resuelve el descuento de una línea del carrito a un monto en pesos, sin importar si
   * el cajero lo capturó como monto fijo o como porcentaje. Siempre queda acotado entre 0
   * y el importe bruto de la línea (`unitPrice * quantity`), para que nunca pueda dejar
   * esa línea en subtotal negativo ni un porcentaje mayor a 100 la deje en negativo.
   */
  function lineDiscount(item) {
    const gross = item.unitPrice * item.quantity
    const raw = Number(item.discountValue) || 0
    const amount = item.discountType === 'percent' ? gross * (raw / 100) : raw
    return Math.min(Math.max(amount, 0), gross)
  }

  /** Importe final de una línea del carrito, ya con su descuento aplicado. */
  function lineSubtotal(item) {
    return item.unitPrice * item.quantity - lineDiscount(item)
  }

  /**
   * Resuelve, para una línea del carrito, el tope de descuento (en pesos) que fijó el ADMIN
   * en "Datos de la tienda" (`tienda.maxDiscountAmount`/`maxDiscountPercent` — ver
   * `StoreInfo.jsx`). Ambos límites son independientes y opcionales: si los dos están
   * definidos, aplica el que resulte más restrictivo para esta línea en particular.
   *
   * Si el ADMIN no configuró NINGUNO de los dos, los descuentos quedan deshabilitados por
   * completo (tope $0, `reason: 'disabled'`) — no existe un límite "sin restricción"
   * implícito. El backend aplica exactamente la misma regla (ver `validateDiscountLimit`
   * en `SaleService.java`), así que esto es solo para avisar de inmediato en el navegador.
   *
   * @returns {{ capAmount: number, reason: 'amount'|'percent'|'disabled'|null, maxAmount: number|null, maxPercent: number|null }}
   */
  function resolveDiscountCap(item) {
    const gross = item.unitPrice * item.quantity
    const maxAmount = tienda?.maxDiscountAmount != null ? Number(tienda.maxDiscountAmount) : null
    const maxPercent = tienda?.maxDiscountPercent != null ? Number(tienda.maxDiscountPercent) : null

    if (maxAmount == null && maxPercent == null) {
      return { capAmount: 0, reason: 'disabled', maxAmount, maxPercent }
    }

    const fromPercent = maxPercent != null ? gross * maxPercent / 100 : null
    let capAmount = gross
    let reason = null
    if (maxAmount != null && maxAmount < capAmount) { capAmount = maxAmount; reason = 'amount' }
    if (fromPercent != null && fromPercent < capAmount) { capAmount = fromPercent; reason = 'percent' }
    return { capAmount, reason, maxAmount, maxPercent }
  }

  /** Cambia el tipo de descuento ($/%) de una línea; conserva el valor capturado tal cual. */
  function updateDiscountType(productId, discountType) {
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, discountType } : i))
  }

  /**
   * Cambia el valor de descuento capturado para una línea (interpretado según su
   * discountType). Si el monto que implica supera el límite configurado por el ADMIN (ver
   * `resolveDiscountCap`), se avisa con un toast y el valor se ajusta al máximo permitido
   * en vez de dejarlo tal cual — "restringir", no solo advertir.
   */
  function updateDiscountValue(productId, rawValue) {
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i
      const num = Number(rawValue)
      if (rawValue === '' || Number.isNaN(num)) return { ...i, discountValue: rawValue }

      const gross = i.unitPrice * i.quantity
      const attemptedAmount = i.discountType === 'percent' ? gross * num / 100 : num
      const { capAmount, reason, maxAmount, maxPercent } = resolveDiscountCap(i)

      if (attemptedAmount > capAmount + 0.001) {
        notify(
          reason === 'disabled'
            ? 'Los descuentos están deshabilitados: el administrador debe configurar un límite de descuento en Datos de la tienda.'
            : reason === 'percent'
              ? `Ese porcentaje de descuento no está permitido, el porcentaje máximo permitido es ${maxPercent}%`
              : `Ese descuento no está permitido, el monto máximo permitido es ${fmt(maxAmount)}`,
          'error'
        )
        const clamped = i.discountType === 'percent' ? (gross > 0 ? (capAmount / gross) * 100 : 0) : capAmount
        return { ...i, discountValue: String(Math.round(clamped * 100) / 100) }
      }
      return { ...i, discountValue: rawValue }
    }))
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

  /**
   * Quita por completo una línea del carrito. Si era la última que quedaba, también
   * limpia "¿Con cuánto paga el cliente?" (ver el `disabled` de ese input): sin productos
   * no tiene sentido dejar un monto capturado esperando a que el carrito se vuelva a
   * llenar, podría quedar mostrando un cambio que ya no corresponde a nada.
   */
  function removeItem(productId) {
    setCart((prev) => prev.filter((i) => i.productId !== productId))
    setSelectedIds((prev) => {
      if (!prev.has(productId)) return prev
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
    if (cart.length <= 1) setAmountReceived('')
  }

  /** Marca/desmarca el checkbox de una línea del carrito. */
  function toggleSelect(productId) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  /** Marca todas las líneas si no están todas ya marcadas; si ya lo estaban, las desmarca. */
  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === cart.length ? new Set() : new Set(cart.map((i) => i.productId))))
  }

  /** Quita del carrito todas las líneas marcadas de una sola vez. Igual que en `removeItem`,
   * si con eso el carrito queda vacío, también limpia "¿Con cuánto paga el cliente?". */
  function removeSelected() {
    const emptiesCart = selectedIds.size >= cart.length
    setCart((prev) => prev.filter((i) => !selectedIds.has(i.productId)))
    setSelectedIds(new Set())
    if (emptiesCart) setAmountReceived('')
  }

  /** Vacía el carrito por completo, previa confirmación (es fácil de deshacer con un vistazo,
   * pero un solo click borra todo, así que conviene preguntar antes). También limpia
   * "¿Con cuánto paga el cliente?" — ver `removeItem`. */
  async function clearCart() {
    if (!(await confirmDialog('¿Vaciar todo el carrito? Se quitarán todos los productos agregados.', { confirmText: 'Vaciar carrito', danger: true }))) return
    setCart([])
    setSelectedIds(new Set())
    setAmountReceived('')
  }

  // El total a cobrar es la suma de cada línea YA con su descuento aplicado (ver
  // `lineSubtotal`). `totalDiscount` es solo para mostrarlo desglosado en el resumen y en
  // el ticket (que también reciben este mismo total agregado, calculado por el backend a
  // partir del descuento de cada línea que se manda en `handleCheckout`).
  const subtotal = cart.reduce((s, i) => s + lineSubtotal(i), 0)
  const totalDiscount = cart.reduce((s, i) => s + lineDiscount(i), 0)

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
  // Ticket digital exige correo del cliente (es el único medio de entrega en ese modo,
  // a diferencia del físico donde el correo es opcional).
  const digitalEmailMissing = ticketType === 'digital' && !customerEmail.trim()

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
   *
   * Pide confirmación explícita antes de registrar el cobro, para evitar cerrar una venta
   * por accidente (p. ej. un doble clic o un Enter de más).
   *
   * Ticket físico vs digital (`ticketType`): en físico, tras cobrar se manda a imprimir
   * a la térmica igual que siempre. En digital NO se imprime nada — el ticket en PDF ya
   * lo manda el backend por correo (ver `SaleService.create`, dispara el envío cuando hay
   * `customerEmail`), que en este modo es obligatorio (`digitalEmailMissing`).
   */
  async function handleCheckout() {
    if (cart.length === 0 || !cashCut || cashAmountMissing || digitalEmailMissing) return
    if (!(await confirmDialog(`¿Deseas realizar esta venta por ${fmt(subtotal)}?`, { confirmText: 'Realizar venta', danger: false }))) return
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
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discount: lineDiscount(i) })),
      })
      const lowStockWarnings = cart.filter((i) => i.minStock != null && (i.stock - i.quantity) <= i.minStock)
      setSuccess({ ...res.data.data, lowStockWarnings, ticketType })
      setCart([])
      setSelectedIds(new Set())
      setCustomerName('')
      setCustomerEmail('')
      setAmountReceived('')
      setTicketType('physical')
      // Se imprime "al vuelo" SOLO en modo físico: si la caja no tiene QZ Tray instalado/
      // corriendo, o la impresora está apagada, no debe tumbar la venta ya registrada —
      // solo se avisa para que el cajero pueda usar "Reimprimir ticket" en cuanto lo resuelva.
      if (ticketType === 'physical') printTicket(res.data.data.id)
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
        {success.discount > 0 && (
          <p className="text-sm text-green-600 mb-1">Descuento aplicado: -{fmt(success.discount)}</p>
        )}
        {success.amountReceived != null && (
          <div className="text-sm text-gray-500 mb-1">
            <p>Recibido: {fmt(success.amountReceived)}</p>
            <p className="font-semibold text-gray-700">Cambio: {fmt(success.changeGiven)}</p>
          </div>
        )}
        {success.ticketType === 'digital' ? (
          <p className="text-sm text-purple-700 mb-6">📧 Ticket enviado a {success.customerEmail}</p>
        ) : (
          success.amountReceived == null && <div className="mb-6" />
        )}
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

        <div className="relative mb-4" ref={searchBoxRef}>
          <input
            ref={searchInputRef}
            className="input pr-10"
            placeholder="Buscar producto por nombre o código... (↑↓ + Enter para seleccionar)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {results.length > 0 && (
            // No es "absolute": si flotara sobre el carrito de abajo, con la lista de
            // resultados abierta se llegaba a tapar productos que el cajero ya había
            // agregado. Al quedar en el flujo normal, empuja el carrito hacia abajo en
            // vez de taparlo — nunca esconde nada que ya esté en la venta.
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-80 overflow-y-auto">
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
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-500">
                {selectedIds.size > 0 ? `${selectedIds.size} seleccionado${selectedIds.size === 1 ? '' : 's'}` : `${cart.length} producto${cart.length === 1 ? '' : 's'}`}
              </span>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                    onClick={removeSelected}
                  >
                    Quitar seleccionados ({selectedIds.size})
                  </button>
                )}
                <button
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-purple-600 text-purple-600 hover:bg-purple-50 transition-colors"
                  onClick={clearCart}
                >
                  Vaciar carrito
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={cart.length > 0 && selectedIds.size === cart.length}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todos los productos"
                    />
                  </th>
                  {['Producto', 'Precio', 'Disp.', 'Cantidad', 'Descuento', 'Subtotal', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cart.map((item) => {
                  const discount = lineDiscount(item)
                  return (
                  <tr key={item.productId} className={selectedIds.has(item.productId) ? 'bg-purple-50/50' : undefined}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.productId)}
                        onChange={() => toggleSelect(item.productId)}
                        aria-label={`Seleccionar ${item.productName}`}
                      />
                    </td>
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
                    <td className="px-4 py-3">
                      {discountsDisabled ? (
                        <span
                          className="text-xs text-gray-400 italic"
                          title="El administrador debe configurar un límite de descuento en Datos de la tienda para poder usar esta opción"
                        >
                          No disponible
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <select
                            className="input !w-14 !py-1 !px-1 text-xs"
                            value={item.discountType}
                            onChange={(e) => updateDiscountType(item.productId, e.target.value)}
                          >
                            <option value="amount">$</option>
                            <option value="percent">%</option>
                          </select>
                          <input
                            type="number" min="0" step="0.01"
                            className="input !w-20 !py-1 text-xs"
                            placeholder="0"
                            value={item.discountValue}
                            onChange={(e) => updateDiscountValue(item.productId, e.target.value)}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {fmt(lineSubtotal(item))}
                      {discount > 0 && (
                        <span className="block text-xs font-normal text-gray-400 line-through">{fmt(item.unitPrice * item.quantity)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-red-400 hover:text-red-600" onClick={() => removeItem(item.productId)}>✕</button>
                    </td>
                  </tr>
                  )
                })}
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
              <label className="text-xs font-medium text-gray-600">Ticket</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    ticketType === 'physical' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => setTicketType('physical')}
                >🖨️ Físico</button>
                <button
                  type="button"
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    ticketType === 'digital' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => setTicketType('digital')}
                >📧 Digital</button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Cliente (opcional)</label>
              <input className="input mt-1" placeholder="Nombre del cliente" value={customerName}
                onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">
                Correo para enviar el ticket {ticketType === 'digital' ? <span className="text-red-500">*</span> : '(opcional)'}
              </label>
              <input
                className="input mt-1" type="email" placeholder="cliente@correo.com"
                required={ticketType === 'digital'}
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
              {digitalEmailMissing && (
                <p className="text-xs text-red-500 mt-1">El ticket digital se manda por correo, captura uno para poder cobrar.</p>
              )}
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
                  className="input mt-1 disabled:opacity-60 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  disabled={cart.length === 0}
                />
                {cart.length > 0 && amountReceived !== '' && (
                  change != null && change >= 0 ? (
                    <div className="mt-2 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-center">
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Cambio a entregar</p>
                      <p className="text-3xl font-bold text-green-700 mt-0.5">{fmt(change)}</p>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-center">
                      <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Falta por cobrar</p>
                      <p className="text-3xl font-bold text-red-600 mt-0.5">{fmt(subtotal - amountReceivedNum)}</p>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4 mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Subtotal</span><span>{fmt(subtotal + totalDiscount)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600 mb-1">
                <span>Descuento</span><span>-{fmt(totalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg text-gray-900">
              <span>Total</span><span className="text-purple-700">{fmt(subtotal)}</span>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

          <button
            className="btn-primary w-full py-3 text-base disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleCheckout}
            disabled={cart.length === 0 || loading || !cashCut || cashAmountMissing || digitalEmailMissing}
            title={!cashCut ? 'Abre un corte de caja para poder cobrar' : cashAmountMissing ? 'Captura cuánto pagó el cliente en efectivo' : digitalEmailMissing ? 'Captura el correo del cliente para el ticket digital' : undefined}
          >
            {loading ? 'Procesando...'
              : !cashCut ? 'Abre un corte para cobrar'
              : digitalEmailMissing ? 'Captura el correo del cliente'
              : cashAmountMissing ? 'Captura el monto recibido'
              : `Cobrar ${fmt(subtotal)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
