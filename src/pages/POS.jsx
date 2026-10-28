import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchProducts, getProductByBarcode } from '../api/products'
import { getCategories } from '../api/categories'
import { getOffers } from '../api/offers'
import { createSale } from '../api/sales'
import { createDepositApartado } from '../api/apartados'
import { getOpenCashCut } from '../api/cashCuts'
import { printSaleTicket, openCashDrawer } from '../utils/printer'
import { resolveMediaUrl } from '../utils/media'
import { barcodeNotFoundMessage } from '../utils/barcode'
import Barcode from '../components/Barcode'
import ModalCloseButton from '../components/ModalCloseButton'
import { useNotify } from '../context/NotifyContext'
import { useAuth } from '../context/AuthContext'
import { todayLocalDateStr } from '../utils/date'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

// Mismo patrón simple que Users.jsx para validar formato de correo del lado del cliente —
// no reemplaza al @Email real del backend, solo adelanta el error más común.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Montos del anticipo: mismo tope que ApartadoDepositRequest (NUMERIC(12,2)).
const MONEY_RE = /^\d+(\.\d{1,2})?$/
const MAX_MONEY = 9999999999.99
// Campos de monto: texto sin flechitas, pero solo dígitos y un punto decimal. Los
// decimales de más no se cortan aquí — los marca validateDepositForm ("Máximo 2 decimales").
const onlyMoney = (v) => {
  const clean = v.replace(/[^\d.]/g, '')
  const dot = clean.indexOf('.')
  return dot === -1 ? clean : clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '')
}

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
  const { user, hasAction } = useAuth()
  // Anticipo = alta de apartado (APARTADOS:CREATE en el backend); sin el permiso no se muestra.
  const canDeposit = hasAction('APARTADOS', 'CREATE')
  // Para el listener global del lector (se registra una sola vez): la tienda actual, para
  // avisar si un código escaneado es de otra tienda.
  const userRef = useRef(user)
  userRef.current = user
  // Igual para `addToCart`: el listener global del lector se registra una sola vez y, sin
  // esto, usaba la versión del primer render (carrito vacío) y no respetaba el tope de stock.
  const addToCartRef = useRef(null)
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
  // Controla si el catálogo/dropdown de resultados se MUESTRA, separado de si hay datos
  // en `results` — el clic afuera/ESC (ver más abajo) solo ocultan, nunca vacían
  // `results`, para que cambiar entre Lista/Imágenes o volver a enfocar el buscador
  // pueda mostrar de nuevo el catálogo ya cargado sin tener que re-pedirlo.
  const [catalogVisible, setCatalogVisible] = useState(true)
  const [highlighted, setHighlighted] = useState(0)
  const [categories, setCategories] = useState([])
  // Modal "Registrar anticipo" (ver handleRegisterDeposit más abajo): usa el carrito tal
  // cual (mismo buscador/catálogo de siempre) para elegir qué se encarga, y solo pide
  // aparte los datos del anticipo — no es una venta normal, crea un Apartado con
  // origin=DEPOSIT directamente ACTIVE + una Sale kind=DEPOSIT por lo que se cobra ahora.
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [depositForm, setDepositForm] = useState({
    customerName: '', customerPhone: '', customerEmail: '', notes: '',
    depositAmount: '', paymentMethod: 'CASH', amountReceived: '', deliveryDate: '',
  })
  const [depositLoading, setDepositLoading] = useState(false)
  const [depositFieldErrors, setDepositFieldErrors] = useState({})

  // Modal "Agregar por concepto" (ver handleAddConcept más abajo): para algo que se
  // vende pero nunca está en el catálogo/inventario (ej. "2 jitomates"). Solo captura
  // nombre/cantidad/precio y agrega UNA línea al carrito de siempre — se puede mezclar
  // libremente con productos normales y el cobro sigue siendo el mismo de siempre
  // (botón "Cobrar" de Resumen), a diferencia del anticipo que sí es un flujo aparte.
  const [showConceptModal, setShowConceptModal] = useState(false)
  // `isWeighed`: para lo que se vende por peso en una báscula (ej. azúcar, cecina) — ahí
  // el cajero no sabe ni le interesa el precio por gramo, solo pesa y lee cuánto marcó la
  // báscula, así que captura el peso (solo informativo, se imprime junto al nombre) y el
  // TOTAL que cobró directamente, en vez de cantidad × precio unitario.
  const [conceptForm, setConceptForm] = useState({ name: '', quantity: '1', unitPrice: '', isWeighed: false, weightGrams: '', totalAmount: '' })
  const [conceptFieldErrors, setConceptFieldErrors] = useState({})

  // Ofertas vigentes de la tienda ("compra X paga Y"), con sus productos ya incluidos —
  // ver `activeOfferFor`/`offerBreakdown` más abajo, y `OfferService#findActiveOfferForProduct`
  // en el backend (misma lógica, espejada aquí solo para mostrar el precio correcto en
  // vivo mientras se arma el carrito; el backend vuelve a calcular todo al cobrar, nunca
  // se confía en lo que mande el navegador).
  const [offers, setOffers] = useState([])
  const [categoryId, setCategoryId] = useState('')
  // Se incrementa cada vez que se hace clic en un chip de categoría (incluso el que ya
  // está activo) para forzar una recarga del catálogo — ver `selectCategory` y el
  // `useEffect` de búsqueda: sin esto, clicar de nuevo la misma categoría no cambia
  // `categoryId` y por lo tanto no dispara ninguna recarga por sí solo.
  const [browseRefresh, setBrowseRefresh] = useState(0)
  // 'list': fila de texto (nombre, código, precio, disponibles) — la de siempre. 'images':
  // misma búsqueda/catálogo, mismos resultados, solo que como cuadrícula de tarjetas con
  // la foto de portada del producto (ver Product#primaryImage). No cambia nada del cobro
  // en sí (ticket físico/digital, correo, descuentos...), solo cómo se eligen los
  // productos. Se recuerda entre sesiones porque es una preferencia del cajero, no de la
  // venta en curso.
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('pos_view_mode') || 'list')
  // Filtro "Solo en oferta": oculta del catálogo (las 3 vistas) los productos que no
  // tengan una oferta vigente ligada — se aplica sobre `results` ya cargado (ver
  // `displayResults`), sin pedirle nada aparte al backend.
  const [onlyOffers, setOnlyOffers] = useState(false)
  const [cart, setCart] = useState([])
  // Ids de las líneas del carrito marcadas con su checkbox, para quitar varias a la vez
  // sin tener que darle ✕ una por una (ver `toggleSelectAll`/`removeSelected`).
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [amountReceived, setAmountReceived] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  // 'physical': imprime en la impresora térmica al cobrar, igual que siempre. 'digital': no
  // imprime nada; si se capturó un correo, el ticket en PDF se manda ahí — el correo es
  // opcional en ambos modos (digital sin correo = venta sin ticket).
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
    getOffers().then((r) => setOffers(r.data.data ?? [])).catch(() => {})
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
          if (product) addToCartRef.current(product, { fromScan: true })
          else notify(barcodeNotFoundMessage(code, userRef.current?.tienda?.id), 'error')
        }).catch(() => notify(barcodeNotFoundMessage(code, userRef.current?.tienda?.id), 'error'))
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
      // En la vista "Códigos" sin texto se muestra todo el catálogo (hasta 300), para poder
      // escanear o tocar cualquier producto desde la pantalla.
      const size = query.trim() ? 8 : viewMode === 'codes' ? 300 : 50
      searchProducts({ q: query || undefined, categoryId: categoryId || undefined, size })
        .then((r) => { setResults(r.data.data ?? []); setHighlighted(0) })
    }, 250)
    return () => clearTimeout(t)
  }, [query, categoryId, browseRefresh, viewMode])

  // Cierra la lista de resultados/catálogo con un clic afuera o Escape — sobre todo
  // importante navegando por categoría, donde la lista ya no se cierra sola al agregar un
  // producto (ver `addToCart`) y antes no había ninguna forma de quitarla de encima sin
  // cambiar de categoría. Van en un listener del documento (no en el `onKeyDown` del
  // input) para que funcionen aunque el foco ya no esté en el buscador — p. ej. después de
  // hacer scroll dentro de la lista con el mouse.
  useEffect(() => {
    function onPointerDown(e) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setCatalogVisible(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setCatalogVisible(false)
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
    setCatalogVisible(true)
    searchInputRef.current?.focus()
  }

  /** Cambia entre la vista de lista, imágenes o códigos de barras, recordando la elección para la próxima venta. */
  function changeViewMode(mode) {
    setViewMode(mode)
    localStorage.setItem('pos_view_mode', mode)
    setCatalogVisible(true)
  }

  /**
   * Agrega un producto al carrito, o incrementa su cantidad si ya estaba. Reglas de stock:
   * - Si el producto no tiene existencias (`stock <= 0`), no se agrega y se muestra un
   *   error visible.
   * - Si ya está en el carrito y sumar una unidad más superaría el stock disponible, la
   *   línea no cambia y se avisa — escaneando con la pistola el cajero no está mirando
   *   las existencias, así que sin aviso parecía que el escaneo simplemente no funcionó.
   * En ambos casos de rechazo también se limpia el buscador, para que el código escaneado
   * no se quede escrito ahí.
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
   *
   * @param refocus si regresa el foco al buscador al terminar (default `true`, pensado
   *        para seguir escaneando/tecleando). En tablet, enfocar el input de texto abre
   *        el teclado en pantalla — al agregar con un tap en la imagen/fila del producto
   *        (no desde el buscador) se manda `false` para no dispararlo sin que el cajero
   *        vaya a escribir nada.
   * @param fromScan `true` cuando viene del lector (o de un código exacto + Enter): cierra
   *        el catálogo en cualquier vista para mostrar el desglose, sin regresar el foco.
   */
  addToCartRef.current = addToCart
  function addToCart(product, { refocus = true, fromScan = false } = {}) {
    // Con lector (o código exacto + Enter) el catálogo no debe quedarse abierto en ninguna
    // vista: se cierra y se deja ver el desglose de la venta. El foco NO regresa al
    // buscador, porque su onFocus lo volvería a abrir; el lector global sigue funcionando
    // sin foco en el buscador. Lo mismo al tocar un producto en la vista "Códigos".
    const closeCatalog = fromScan || viewMode === 'codes'
    const finish = () => {
      if (closeCatalog) {
        setCatalogVisible(false)
        if (document.activeElement === searchInputRef.current) searchInputRef.current?.blur()
      } else if (refocus) {
        searchInputRef.current?.focus()
      }
    }
    const reject = (msg) => {
      setError(msg)
      notify(msg, 'error')
      if (query.trim()) setQuery('')
      finish()
    }
    // "Por pedido" (ver Product#isMadeToOrder): no hay inventario real que validar —
    // se puede agregar sin importar `stock`, siempre.
    const madeToOrder = !!product.isMadeToOrder
    if (!madeToOrder && product.stock <= 0) { reject(`"${product.name}" no tiene stock disponible`); return }
    // Si el producto tiene oferta vigente, cada "agregar" se lleva una promoción completa
    // (`offer.buyQuantity` piezas), no una sola — ver `qtyStep`/`displayQty`: la Cantidad
    // que ve el cajero son promociones, nunca piezas sueltas, cuando hay oferta.
    const offer = activeOfferFor(product.id)
    const step = offer ? offer.buyQuantity : 1
    const existingBefore = cart.find((i) => i.productId === product.id)
    if (!madeToOrder && existingBefore && existingBefore.quantity + step > product.stock) {
      reject(`Ya no hay más "${product.name}": ya tienes en la venta todo lo disponible (${product.stock})`)
      return
    }
    if (!madeToOrder && !existingBefore && step > product.stock) {
      reject(`"${product.name}" no tiene suficiente stock para una promoción completa (necesita ${step}, disponible: ${product.stock})`)
      return
    }
    setError('')
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        // Si esa línea ya tiene la oferta desactivada ("No aplicar oferta", ver
        // `toggleSkipOffer`), vuelve a agregar de a 1 pieza, no de a 1 promoción —
        // respeta lo que el cajero ya eligió para esta línea en particular.
        const existingStep = existing.skipOffer ? 1 : step
        // Tope también aquí: el estado más reciente manda, aunque `cart` de arriba
        // viniera desfasado (escaneos muy seguidos). Sin tope si es "por pedido".
        if (!madeToOrder && existing.quantity + existingStep > product.stock) return prev
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + existingStep } : i)
      }
      return [...prev, {
        productId: product.id, productName: product.name, unitPrice: product.price, quantity: step,
        stock: product.stock, minStock: product.minStock, isMadeToOrder: madeToOrder,
        // Descuento por línea: 'amount' ($ fijo) o 'percent' (%) sobre esta línea — ver
        // `lineDiscount`/`lineSubtotal` para cómo se resuelve a un monto en pesos.
        discountType: 'amount', discountValue: '',
        // "No aplicar oferta" (ver `toggleSkipOffer`): el cajero puede desactivar, línea
        // por línea, una oferta que SÍ está vigente para el producto — para un cliente
        // que no quiere/necesita aprovecharla y solo quiere llevarse piezas sueltas.
        skipOffer: false,
      }]
    })
    notify(`"${product.name}" agregado al carrito`, 'success')
    if (query.trim()) {
      setQuery('')
      setResults([])
    }
    finish()
  }

  /**
   * Resuelve la oferta vigente AHORA para un producto, si hay alguna — mismo criterio que
   * `OfferService#findActiveOfferForProduct` en el backend: activa, dentro de su rango de
   * fechas (si tiene), y si hubiera más de una, la que más piezas de regalo da.
   */
  function activeOfferFor(productId) {
    const now = new Date()
    const candidates = offers.filter((o) => {
      if (!o.isActive) return false
      if (!o.products?.some((p) => p.id === productId)) return false
      if (o.startsAt && now < new Date(o.startsAt)) return false
      if (o.endsAt && now > new Date(o.endsAt)) return false
      return true
    })
    if (candidates.length === 0) return null
    return candidates.reduce((best, o) =>
      (o.buyQuantity - o.payQuantity) > (best.buyQuantity - best.payQuantity) ? o : best
    )
  }

  /**
   * Cuántas piezas físicas representa "1" en el cuadro de Cantidad de esta línea. Si el
   * producto tiene oferta vigente, la Cantidad que captura el cajero son PROMOCIONES, no
   * piezas sueltas — captura "1" y se lleva {@link Offer#buyQuantity} piezas, captura "5"
   * y se lleva 5 veces esas piezas — así que el paso es `offer.buyQuantity`. Sin oferta,
   * el paso de siempre: 1 pieza = 1 pieza. `item.quantity` (el campo que de verdad se
   * manda al backend) SIEMPRE son piezas físicas, nunca promociones — ver `displayQty`,
   * que es la única que convierte entre lo que el cajero teclea y lo que se guarda.
   */
  function qtyStep(item) {
    if (item.skipOffer) return 1
    return activeOfferFor(item.productId)?.buyQuantity || 1
  }

  /** Lo que se le muestra al cajero en el cuadro de Cantidad — piezas físicas ÷ paso de
   *  la oferta (ver `qtyStep`), o las piezas tal cual si no hay oferta. */
  function displayQty(item) {
    if (item.quantity === '') return ''
    return item.quantity / qtyStep(item)
  }

  /**
   * Reparte la cantidad de una línea del carrito entre piezas "pagadas" (a precio normal)
   * y piezas "gratis" de la promoción, exactamente igual que `SaleService#applyOffer` en
   * el backend — misma fórmula, espejada aquí solo para que el cajero vea el total
   * correcto MIENTRAS arma la venta, no hasta que el backend responda al cobrar.
   *
   * @returns {null|{offer: object, piezasPagadas: number, piezasGratis: number, paidGross: number}}
   *          `null` si el producto no tiene oferta vigente, o la cantidad no alcanza a
   *          formar ni una promoción completa (se vende igual que sin oferta).
   */
  function offerBreakdown(item) {
    if (item.skipOffer) return null
    const offer = activeOfferFor(item.productId)
    if (!offer) return null
    const promosPosibles = Math.floor(item.quantity / offer.buyQuantity)
    const promosAplicados = offer.maxPromosPerSale != null ? Math.min(promosPosibles, offer.maxPromosPerSale) : promosPosibles
    if (promosAplicados <= 0) return null
    const piezasGratis = promosAplicados * (offer.buyQuantity - offer.payQuantity)
    const piezasPagadas = item.quantity - piezasGratis
    return { offer, piezasPagadas, piezasGratis, paidGross: item.unitPrice * piezasPagadas }
  }

  /**
   * Resuelve el descuento de una línea del carrito a un monto en pesos, sin importar si
   * el cajero lo capturó como monto fijo o como porcentaje. Siempre queda acotado entre 0
   * y el importe bruto FACTURABLE de la línea (`unitPrice * piezasPagadas` si hay oferta
   * vigente, `unitPrice * quantity` si no) — las piezas gratis de una promoción nunca
   * entran en esta cuenta, ya están a $0.00.
   */
  function lineDiscount(item) {
    const breakdown = offerBreakdown(item)
    const gross = breakdown ? breakdown.paidGross : item.unitPrice * item.quantity
    const raw = Number(item.discountValue) || 0
    const amount = item.discountType === 'percent' ? gross * (raw / 100) : raw
    return Math.min(Math.max(amount, 0), gross)
  }

  /** Importe final de una línea del carrito, ya con su descuento (y oferta, si aplica) aplicados. */
  function lineSubtotal(item) {
    const breakdown = offerBreakdown(item)
    const gross = breakdown ? breakdown.paidGross : item.unitPrice * item.quantity
    return gross - lineDiscount(item)
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
    const breakdown = offerBreakdown(item)
    const gross = breakdown ? breakdown.paidGross : item.unitPrice * item.quantity
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
   * Prende/apaga "No aplicar oferta" para una línea: el producto puede tener una
   * promoción vigente, pero este cliente en particular no la quiere (ej. solo se lleva 1
   * pieza suelta de un 2x1) — ver `skipOffer` en `SaleItemRequest.java`, que es lo que de
   * verdad le indica al backend que no aplique la oferta en esta línea.
   *
   * Al prenderlo, la cantidad vuelve a 1 pieza física (el caso típico: "solo quiero una").
   * Al apagarlo (vuelve a querer la oferta), regresa a 1 promoción completa — mismo valor
   * inicial que al agregar el producto por primera vez (ver `addToCart`).
   */
  function toggleSkipOffer(productId) {
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i
      const skipOffer = !i.skipOffer
      const newStep = skipOffer ? 1 : (activeOfferFor(i.productId)?.buyQuantity || 1)
      let qty = newStep
      if (i.stock != null && qty > i.stock) qty = Math.floor(i.stock / newStep) * newStep || newStep
      return { ...i, skipOffer, quantity: qty }
    }))
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

      const breakdown = offerBreakdown(i)
      const gross = breakdown ? breakdown.paidGross : i.unitPrice * i.quantity
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
        if (exact) { addToCart(exact, { fromScan: true }); return }
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
   * Cambia la cantidad de una línea del carrito (botones +/- y el cuadro de texto de la
   * tabla). Igual que en `addToCart`, la cantidad nunca puede bajar de 1 (para eso está
   * `removeItem`) ni superar el stock disponible que se capturó al agregar el producto;
   * en ambos casos el cambio simplemente se topa al límite, sin mensaje de error.
   */
  // Suma/resta `delta` a la cantidad de una línea, siempre a partir del estado más
  // reciente (no de `item.quantity` capturado en el render) — necesario para que
  // mantener presionado el botón (ver `startQtyHold` de abajo) acumule bien cada tick del
  // intervalo en vez de repetir el mismo valor una y otra vez. `Number(...)` por si acaso
  // `quantity` quedó como cadena vacía (mientras se edita el cuadro de texto, ver
  // `handleQtyInputChange` de abajo) al momento de presionar +/-.
  function bumpQty(productId, delta) {
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i
      const step = qtyStep(i)
      let qty = Number(i.quantity || 0) + delta * step
      if (qty < step) qty = step
      // Topa al stock disponible sin partir una promoción a la mitad: redondea hacia
      // abajo al múltiplo de `step` más cercano (si hay oferta, el stock siempre alcanza
      // para al menos una promoción completa — ver el guard en `addToCart`). Sin tope si
      // es "por pedido" (`isMadeToOrder`): no hay inventario real que respetar.
      if (!i.isMadeToOrder && i.stock != null && qty > i.stock) qty = Math.floor(i.stock / step) * step
      return { ...i, quantity: qty }
    }))
  }

  // Cantidad tecleada directamente (más rápido que +/- para carritos de muchas piezas,
  // ej. 65 de una vez). Se permite vacío TEMPORALMENTE mientras se edita — si se forzara
  // el mínimo de 1 en cada tecla, borrar el número para escribir uno nuevo se rompería
  // (se resetearía a 1 a medio borrado). Sí se topa al stock disponible en cada tecla: como
  // los dígitos se escriben de izquierda a derecha, cualquier prefijo del número final es
  // menor o igual a él, así que topar antes de terminar de escribir nunca corta un dígito
  // de más. El mínimo de 1 se corrige hasta que se sale del campo, ver `commitQtyInput`.
  function handleQtyInputChange(productId, raw) {
    const digits = raw.replace(/\D/g, '')
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i
      if (digits === '') return { ...i, quantity: '' }
      // Lo tecleado es lo que se ve en el cuadro (promociones si hay oferta, piezas si
      // no — ver `displayQty`); se guarda convertido a piezas físicas, que es lo único
      // que entiende el resto del carrito y lo que se manda al backend.
      const step = qtyStep(i)
      let qty = Number(digits) * step
      if (!i.isMadeToOrder && i.stock != null && qty > i.stock) qty = Math.floor(i.stock / step) * step
      return { ...i, quantity: qty }
    }))
  }

  // Al salir del cuadro (blur) o presionar Enter: si quedó vacío o en 0, regresa a 1 — no
  // se puede dejar una línea en 0 piezas, para eso está el botón de quitar la línea (✕).
  function commitQtyInput(productId) {
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i
      const step = qtyStep(i)
      let qty = Number(i.quantity) || 0
      if (qty < step) qty = step
      if (!i.isMadeToOrder && i.stock != null && qty > i.stock) qty = Math.floor(i.stock / step) * step
      return { ...i, quantity: qty }
    }))
  }

  // Mantener presionado +/- para subir o bajar la cantidad rápido (útil con carritos de
  // muchas piezas, ej. 65 de una vez) — un botón normal no repite solo al detenerse el
  // clic, así que se arma a mano con un timeout (arranca el repetido tras 400ms, para no
  // duplicar el bump de un clic normal) + un intervalo (un bump cada 80ms mientras se
  // sigue presionando). `bumpQty` ya topa en 1 y en el stock disponible, así que no hace
  // falta detener el intervalo al llegar al límite.
  const qtyHoldRef = useRef({ timeout: null, interval: null, repeated: false })

  function clearQtyHold() {
    clearTimeout(qtyHoldRef.current.timeout)
    clearInterval(qtyHoldRef.current.interval)
    qtyHoldRef.current.timeout = null
    qtyHoldRef.current.interval = null
  }

  function startQtyHold(productId, delta) {
    qtyHoldRef.current.repeated = false
    qtyHoldRef.current.timeout = setTimeout(() => {
      qtyHoldRef.current.repeated = true
      bumpQty(productId, delta)
      qtyHoldRef.current.interval = setInterval(() => bumpQty(productId, delta), 80)
    }, 400)
  }

  // Suelta el botón (mouseup/touchend): si nunca llegó a repetir (fue un clic normal),
  // aplica el único bump que le correspondía; si ya venía repitiendo, solo detiene el
  // intervalo sin sumar uno extra.
  function endQtyHold(productId, delta) {
    const wasRepeating = qtyHoldRef.current.repeated
    clearQtyHold()
    if (!wasRepeating) bumpQty(productId, delta)
  }

  // Por si el componente se desmonta mientras se sigue presionando (ej. el cajero navega
  // a otra pantalla sin soltar) — evita un intervalo corriendo sobre un state ya destruido.
  useEffect(() => clearQtyHold, [])

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
  // Si no hay NINGUNA oferta vigente ahora mismo (sin importar a qué producto aplique),
  // el botón "🏷️ Ofertas" no tiene nada que filtrar — se oculta en vez de dejarlo ahí sin
  // efecto. No usa `activeOfferFor` (que necesita un producto) porque aquí basta con
  // saber si existe al menos una oferta activa y dentro de su vigencia.
  const hasActiveOffers = offers.some((o) => {
    if (!o.isActive) return false
    const now = new Date()
    if (o.startsAt && now < new Date(o.startsAt)) return false
    if (o.endsAt && now > new Date(o.endsAt)) return false
    return true
  })

  // Catálogo a mostrar (las 3 vistas): `results` tal cual, o solo los que tengan oferta
  // vigente si el cajero prendió el filtro "🏷️ Ofertas" — filtrado en el navegador sobre
  // lo que ya se cargó, sin pedirle nada aparte al backend. `&& hasActiveOffers`: sin
  // esto, si las ofertas vigentes desaparecieran (se desactivaron/vencieron) mientras el
  // filtro seguía prendido, el botón se esconde pero el catálogo se quedaría vacío sin
  // ninguna forma de apagarlo.
  const displayResults = onlyOffers && hasActiveOffers ? results.filter((p) => activeOfferFor(p.id)) : results

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
  // Mismo límite que Sale.amountReceived en el backend (NUMERIC(12,2), ver SaleRequest) —
  // sin esto, un monto absurdamente grande pasaba hasta el backend y tronaba con un error
  // crudo en vez de un mensaje claro (mismo caso que ya se resolvió en Inventario).
  const amountExceedsLimit = paymentMethod === 'CASH' && amountReceivedNum != null && amountReceivedNum > 9999999999.99
  // Lo mismo para "¿Con cuánto paga?" del anticipo: tope y cambio calculados en vivo. El
  // cambio solo se muestra cuando ambos montos son números válidos.
  const depositReceivedNum = depositForm.amountReceived === '' ? null : Number(depositForm.amountReceived)
  const depositAmountNum = depositForm.depositAmount === '' ? null : Number(depositForm.depositAmount)
  const depositReceivedExceeds = depositReceivedNum != null && depositReceivedNum > MAX_MONEY
  const depositChange = depositReceivedNum != null && depositAmountNum != null
    && !Number.isNaN(depositReceivedNum) && !Number.isNaN(depositAmountNum)
    ? depositReceivedNum - depositAmountNum
    : null
  // Nombre y correo del cliente son SIEMPRE opcionales (se puede vender sin capturar
  // ninguno de los dos) — estos chequeos solo importan cuando sí se escribió algo. Máximos
  // alineados a sales.customer_name/customer_email VARCHAR(150) en el backend (SaleRequest).
  const customerNameTooLong = customerName.length > 150
  const customerEmailTooLong = customerEmail.length > 150
  const customerEmailInvalid = customerEmail.trim() !== '' && !EMAIL_RE.test(customerEmail.trim())

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
   * a la térmica igual que siempre. En digital NO se imprime nada — si hay `customerEmail`
   * el backend manda el ticket en PDF por correo (ver `SaleService.create`); si no, la
   * venta simplemente queda sin ticket.
   */
  async function handleCheckout() {
    if (cart.length === 0 || !cashCut || cashAmountMissing || amountExceedsLimit
      || customerNameTooLong || customerEmailTooLong || customerEmailInvalid) return

    // Líneas con oferta vigente a las que el cajero ADEMÁS les metió un descuento manual:
    // se le pregunta una sola vez, aquí, si quiere apilar los dos descuentos o quedarse
    // solo con el de la oferta — nunca se decide solo, ni se pregunta por cada tecleo del
    // campo de descuento (ver `updateDiscountValue`, que solo acota el monto máximo).
    const stackedLines = cart.filter((i) => offerBreakdown(i) && (Number(i.discountValue) || 0) > 0)
    let effectiveCart = cart
    if (stackedLines.length > 0) {
      const names = stackedLines.map((i) => i.productName).join(', ')
      const applyBoth = await confirmDialog(
        `"${names}" ya trae una oferta aplicada. ¿Quieres aplicar TAMBIÉN tu descuento manual encima de la oferta, o solo dejar la oferta?`,
        { confirmText: 'Aplicar ambos', cancelText: 'Solo la oferta', danger: false }
      )
      if (!applyBoth) {
        effectiveCart = cart.map((i) =>
          stackedLines.some((s) => s.productId === i.productId) ? { ...i, discountValue: '' } : i
        )
        setCart(effectiveCart)
      }
    }

    const effectiveSubtotal = effectiveCart.reduce((s, i) => s + lineSubtotal(i), 0)
    if (!(await confirmDialog(`¿Deseas realizar esta venta por ${fmt(effectiveSubtotal)}?`, { confirmText: 'Realizar venta', danger: false }))) return
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
        items: effectiveCart.map((i) => i.isConcept
          ? { productId: null, conceptName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, discount: lineDiscount(i) }
          : { productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discount: lineDiscount(i), skipOffer: i.skipOffer || undefined }),
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
      if (ticketType === 'physical') {
        printTicket(res.data.data.id)
      } else if (paymentMethod === 'CASH') {
        // El pulso que abre el cajón normalmente viaja pegado al ticket físico completo —
        // en Digital ese ticket nunca se manda a imprimir, así que el cajón tampoco se
        // abriría solo. Se pide aparte, en silencio (sin el estado "Imprimiendo..." del
        // botón de ticket): si falla (QZ Tray no instalado, impresora apagada) solo se
        // avisa, nunca tumba la venta ya registrada.
        openDrawerSilently(res.data.data.id)
      }
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al registrar venta')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Abre el modal de anticipo, precargando nombre/correo con lo que el cajero ya haya
   * tecleado en el panel de "Resumen" (campos `customerName`/`customerEmail` de la venta
   * normal) — si ya los escribió ahí antes de darse cuenta de que era un anticipo, no
   * tiene que volver a escribirlos. El teléfono no se precarga porque el panel normal no
   * lo pide (no es parte de una venta de mostrador, solo de un apartado).
   */
  function openDepositModal() {
    // El anticipo es solo para productos sin oferta (cobra a precio de lista): si el
    // carrito trae alguno con oferta vigente, ni se abre — el backend lo rechaza igual.
    const withOffer = cart.filter((i) => !i.isConcept && activeOfferFor(i.productId))
    if (withOffer.length > 0) {
      const names = withOffer.map((i) => `"${i.productName}"`).join(', ')
      notify(`No se puede registrar un anticipo con productos en oferta (${names}). El anticipo es solo para productos sin oferta — quítalos del carrito y véndelos aparte.`, 'error')
      return
    }
    setDepositForm((prev) => ({ ...prev, customerName: customerName || prev.customerName, customerEmail: customerEmail || prev.customerEmail }))
    setDepositFieldErrors({})
    setShowDepositModal(true)
  }

  // Los modales no se cierran con clic afuera (ver ModalCloseButton): solo con la X o Esc.
  useEffect(() => {
    if (!showDepositModal && !showConceptModal) return
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      setShowDepositModal(false)
      setShowConceptModal(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showDepositModal, showConceptModal])

  /** Abre el modal "Agregar por concepto", siempre con el formulario en blanco. */
  function openConceptModal() {
    setConceptForm({ name: '', quantity: '1', unitPrice: '', isWeighed: false, weightGrams: '', totalAmount: '' })
    setConceptFieldErrors({})
    setShowConceptModal(true)
  }

  /**
   * Agrega al carrito la línea "por concepto" capturada en el modal — misma validación
   * de campos marcados en rojo que el resto de la app (Inventario/Usuarios/Anticipo), solo
   * al dar clic en "Agregar". `productId` es un id sintético único (string, nunca choca con
   * un id real de producto) para que todo lo demás del carrito (cantidad, quitar línea,
   * selección) funcione sin tener que distinguir el caso en cada función.
   *
   * Si `isWeighed`, el peso es solo informativo (se anexa al nombre para el ticket, ej.
   * "Cecina (350 g)") — la línea se manda con cantidad 1 y el precio unitario es el TOTAL
   * que capturó el cajero, nunca un precio por gramo calculado a la inversa.
   */
  function handleAddConcept() {
    const errors = {}
    const name = conceptForm.name.trim()
    if (!name) errors.name = 'Captura el nombre de lo que vendes'

    let qty, price, finalName
    if (conceptForm.isWeighed) {
      const grams = Number(conceptForm.weightGrams)
      if (!grams || grams <= 0) errors.weightGrams = 'Captura el peso marcado por la báscula'
      const total = Number(conceptForm.totalAmount)
      if (conceptForm.totalAmount === '' || Number.isNaN(total) || total < 0) errors.totalAmount = 'Captura cuánto cobraste en total'
      qty = 1
      price = total
      finalName = grams > 0 ? `${name} (${grams} g)` : name
    } else {
      qty = Number(conceptForm.quantity)
      if (!qty || qty <= 0) errors.quantity = 'La cantidad debe ser mayor a 0'
      price = Number(conceptForm.unitPrice)
      if (conceptForm.unitPrice === '' || Number.isNaN(price) || price < 0) errors.unitPrice = 'Captura un precio válido'
      finalName = name
    }

    if (Object.keys(errors).length > 0) {
      setConceptFieldErrors(errors)
      return
    }
    setCart((prev) => [...prev, {
      productId: `concept-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productName: finalName, unitPrice: price, quantity: qty,
      stock: null, minStock: null, isMadeToOrder: false,
      discountType: 'amount', discountValue: '', skipOffer: false,
      isConcept: true,
    }])
    notify(`"${finalName}" agregado al carrito`, 'success')
    setShowConceptModal(false)
  }

  /** Valida el formulario del modal de anticipo del lado del cliente, antes de pedir
   *  confirmación — mismo criterio que `ApartadoDepositRequest` en el backend. */
  function validateDepositForm() {
    const errors = {}
    const name = depositForm.customerName.trim()
    if (!name) errors.customerName = 'El nombre es obligatorio'
    else if (name.length > 150) errors.customerName = 'El nombre no puede tener más de 150 caracteres'
    if (!depositForm.customerPhone) errors.customerPhone = 'El teléfono es obligatorio'
    else if (!/^[0-9]{10}$/.test(depositForm.customerPhone)) errors.customerPhone = 'El teléfono debe tener 10 dígitos'
    const email = depositForm.customerEmail.trim()
    if (email.length > 150) errors.customerEmail = 'El correo no puede tener más de 150 caracteres'
    else if (email && !EMAIL_RE.test(email)) errors.customerEmail = 'Correo inválido'
    if (depositForm.notes.length > 200) errors.notes = 'Las notas no pueden tener más de 200 caracteres'
    const amount = Number(depositForm.depositAmount)
    if (depositForm.depositAmount === '') errors.depositAmount = 'Captura cuánto dejó de anticipo'
    else if (Number.isNaN(amount) || amount <= 0) errors.depositAmount = 'El anticipo debe ser mayor a 0'
    else if (!MONEY_RE.test(depositForm.depositAmount)) errors.depositAmount = 'Máximo 2 decimales'
    else if (amount > MAX_MONEY) errors.depositAmount = 'El máximo permitido es 9,999,999,999.99'
    else if (amount >= subtotal) errors.depositAmount = `Debe ser menor al total del pedido (${fmt(subtotal)})`
    // Fecha de entrega en lugar de horas de vigencia: el anticipo no vence solo.
    if (!depositForm.deliveryDate) errors.deliveryDate = 'Elige la fecha de entrega'
    else if (depositForm.deliveryDate < todayLocalDateStr()) errors.deliveryDate = 'No puede ser anterior a hoy'
    if (depositForm.paymentMethod === 'CASH') {
      const received = Number(depositForm.amountReceived)
      if (depositForm.amountReceived === '') errors.amountReceived = 'Captura con cuánto pagó el cliente'
      else if (Number.isNaN(received) || received <= 0) errors.amountReceived = 'Captura un monto válido'
      else if (!MONEY_RE.test(depositForm.amountReceived)) errors.amountReceived = 'Máximo 2 decimales'
      else if (received > MAX_MONEY) errors.amountReceived = 'El máximo permitido es 9,999,999,999.99'
      else if (!errors.depositAmount && received < amount) errors.amountReceived = 'Debe alcanzar para cubrir el anticipo'
    }
    return errors
  }

  /**
   * Registra el apartado con anticipo usando el carrito actual (mismo buscador/catálogo
   * de siempre para elegir qué se encarga) — ver `createDepositApartado` en `api/apartados.js`.
   * A diferencia de `handleCheckout`, esto NO es una venta normal: crea el Apartado ya
   * `ACTIVE` y una venta aparte (`kind=DEPOSIT`) solo por el anticipo.
   */
  async function handleRegisterDeposit() {
    if (cart.length === 0) return
    const errors = validateDepositForm()
    if (Object.keys(errors).length > 0) {
      setDepositFieldErrors(errors)
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    if (!(await confirmDialog(
      `¿Registrar un anticipo de ${fmt(Number(depositForm.depositAmount))} para "${depositForm.customerName}"?`,
      { confirmText: 'Registrar anticipo', danger: false }
    ))) return
    setDepositLoading(true)
    setDepositFieldErrors({})
    try {
      await createDepositApartado({
        customerName: depositForm.customerName.trim(),
        customerPhone: depositForm.customerPhone,
        customerEmail: depositForm.customerEmail.trim() || null,
        notes: depositForm.notes || null,
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        deliveryDate: depositForm.deliveryDate,
        depositAmount: Number(depositForm.depositAmount),
        paymentMethod: depositForm.paymentMethod,
        amountReceived: depositForm.paymentMethod === 'CASH' ? Number(depositForm.amountReceived) : undefined,
      })
      notify('Anticipo registrado — el apartado ya quedó activo', 'success')
      setShowDepositModal(false)
      setCart([])
      setSelectedIds(new Set())
      setDepositForm({ customerName: '', customerPhone: '', customerEmail: '', notes: '',
        depositAmount: '', paymentMethod: 'CASH', amountReceived: '', deliveryDate: '' })
    } catch (err) {
      // Errores ligados a un campo ({campo: mensaje}) van debajo de su input; los demás
      // (ej. sin corte abierto, sin stock) solo en la notificación, con el mensaje real.
      const data = err.response?.data?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setDepositFieldErrors(data)
        notify('Revisa los campos marcados en rojo', 'error')
      } else {
        notify(err.response?.data?.message ?? 'No se pudo registrar el anticipo', 'error')
      }
    } finally {
      setDepositLoading(false)
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

  /**
   * Abre el cajón de una venta en efectivo cuyo ticket no se imprimió físicamente (ver
   * `handleCheckout`) — sin tocar `printing` (no es "imprimir un ticket", es solo el
   * pulso del cajón) y sin bloquear nada si falla, solo avisa.
   */
  async function openDrawerSilently(saleId) {
    try {
      await openCashDrawer(saleId)
    } catch (err) {
      notify(err.message ?? 'No se pudo abrir el cajón', 'error')
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
          <p className="text-sm text-purple-700 mb-6">
            {success.customerEmail ? `📧 Ticket enviado a ${success.customerEmail}` : 'Venta sin ticket'}
          </p>
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

        {/* searchBoxRef envuelve ESTE bloque completo (categorías + vista + buscador), no
            solo el input: si el toolbar de categorías/vista quedara afuera, el listener de
            "clic afuera cierra la lista" (más abajo) trataría un clic en un chip de
            categoría o en Lista/Imágenes como un clic fuera del buscador y vaciaría
            `results` antes de que termine de aplicarse el cambio. Los chips de categoría
            se salvaban solos porque siempre fuerzan una recarga (`browseRefresh`), pero
            cambiar de vista no, así que la lista se quedaba vacía hasta volver a tocar un
            chip. */}
        <div ref={searchBoxRef}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
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
          <div className="flex items-center gap-2 shrink-0">
          {hasActiveOffers && (
            <button
              type="button"
              title="Mostrar solo productos con oferta vigente"
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${onlyOffers ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              onClick={() => setOnlyOffers((v) => !v)}
            >🏷️ Ofertas</button>
          )}
          <div className="flex gap-1 bg-gray-100 rounded-full p-1 shrink-0">
            <button
              type="button"
              title="Vista de lista"
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => changeViewMode('list')}
            >📋 Lista</button>
            <button
              type="button"
              title="Vista con imágenes"
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${viewMode === 'images' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => changeViewMode('images')}
            >🖼️ Imágenes</button>
            <button
              type="button"
              title="Vista con códigos de barras"
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${viewMode === 'codes' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => changeViewMode('codes')}
            >🏷️ Códigos</button>
          </div>
          </div>
        </div>

        <div className="relative mb-4">
          <input
            ref={searchInputRef}
            className="input pr-10"
            placeholder="Buscar producto por nombre o código... (↑↓ + Enter para seleccionar)"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCatalogVisible(true) }}
            onFocus={() => setCatalogVisible(true)}
            onKeyDown={handleSearchKeyDown}
          />
          {catalogVisible && displayResults.length > 0 && (
            // No es "absolute": si flotara sobre el carrito de abajo, con la lista de
            // resultados abierta se llegaba a tapar productos que el cajero ya había
            // agregado. Al quedar en el flujo normal, empuja el carrito hacia abajo en
            // vez de taparlo — nunca esconde nada que ya esté en la venta.
            //
            // El contenido es el mismo catálogo/búsqueda de siempre en ambos modos — la
            // venta en sí (ticket, correo, descuentos, cobro) no cambia en nada; solo
            // cambia cómo se elige el producto (ver `viewMode`).
            viewMode === 'codes' ? (
              // Catálogo con el código de barras de cada producto: se puede escanear de la
              // pantalla (pistola de imagen) o tocar la tarjeta; ambos agregan a la venta.
              <div className="bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-[32rem] overflow-y-auto p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {displayResults.map((p) => {
                    const offer = activeOfferFor(p.id)
                    return (
                    <button
                      key={p.id}
                      type="button"
                      className="relative flex flex-col items-center text-center rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all bg-white p-3"
                      onClick={() => addToCart(p, { refocus: false })}
                    >
                      {offer && (
                        <span className="absolute top-1.5 left-1.5 bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {offer.buyQuantity}x{offer.payQuantity}
                        </span>
                      )}
                      <p className="font-medium text-gray-900 text-sm leading-snug line-clamp-2 w-full">{p.name}</p>
                      <div className="flex items-center justify-between w-full mt-1 mb-2">
                        <span className="font-bold text-purple-700 text-sm">{fmt(p.price)}</span>
                        <span className={`text-xs ${p.stock <= p.minStock ? 'text-red-500' : 'text-gray-400'}`}>Disp: {p.stock}</span>
                      </div>
                      {p.barcode
                        ? <Barcode value={p.barcode} height={44} />
                        : <span className="text-xs text-gray-400 py-6">Sin código</span>}
                    </button>
                    )
                  })}
                </div>
              </div>
            ) : viewMode === 'images' ? (
              <div className="bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-[32rem] overflow-y-auto p-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {displayResults.map((p) => {
                    const offer = activeOfferFor(p.id)
                    return (
                    <button
                      key={p.id}
                      type="button"
                      className="relative flex flex-col text-left rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all overflow-hidden bg-white"
                      onClick={() => addToCart(p, { refocus: false })}
                    >
                      {offer && (
                        <span className="absolute top-1.5 left-1.5 z-10 bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {offer.buyQuantity}x{offer.payQuantity}
                        </span>
                      )}
                      <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                        {p.primaryImage ? (
                          <img src={resolveMediaUrl(p.primaryImage)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-3xl text-gray-300">🖼️</span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">{p.name}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-bold text-purple-700 text-sm">{fmt(p.price)}</span>
                          <span className={`text-xs ${p.stock <= p.minStock ? 'text-red-500' : 'text-gray-400'}`}>
                            Disp: {p.stock}
                          </span>
                        </div>
                      </div>
                    </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-80 overflow-y-auto">
                {displayResults.map((p, idx) => {
                  const offer = activeOfferFor(p.id)
                  return (
                  <button
                    key={p.id}
                    type="button"
                    className={`w-full flex items-center justify-between px-4 py-3 text-left border-b last:border-0 ${idx === highlighted ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                    onMouseEnter={() => setHighlighted(idx)}
                    onClick={() => addToCart(p, { refocus: false })}
                  >
                    <div>
                      <p className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                        {p.name}
                        {offer && (
                          <span className="bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {offer.buyQuantity}x{offer.payQuantity}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{p.barcode} · Categoría: {p.category?.name ?? '—'}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-purple-700 text-sm block">{fmt(p.price)}</span>
                      <span className={`text-xs ${p.stock <= p.minStock ? 'text-red-500' : 'text-gray-400'}`}>
                        Disponibles: {p.stock}
                      </span>
                    </div>
                  </button>
                  )
                })}
              </div>
            )
          )}
        </div>
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
                  const breakdown = offerBreakdown(item)
                  const offer = activeOfferFor(item.productId)
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
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {item.productName}
                      {item.isConcept && (
                        <span className="block text-xs font-normal text-amber-600 mt-0.5">📋 Por concepto</span>
                      )}
                      {offer && (
                        <span
                          className={`block text-xs font-normal mt-0.5 ${item.skipOffer ? 'text-gray-400 line-through' : 'text-purple-600'}`}
                          title={offer.name}
                        >
                          🏷️ Lleva {offer.buyQuantity}, paga {offer.payQuantity}
                          {breakdown ? ` — ${breakdown.piezasGratis} gratis` : ''}
                        </span>
                      )}
                      {offer && (
                        <label className="flex items-center gap-1 mt-1 text-xs text-gray-500 font-normal cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!item.skipOffer}
                            onChange={() => toggleSkipOffer(item.productId)}
                          />
                          No aplicar oferta
                        </label>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmt(item.unitPrice)}</td>
                    <td className="px-4 py-3 text-gray-400">{item.isConcept ? '—' : item.isMadeToOrder ? <span className="italic text-xs">Por pedido</span> : item.stock}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button className="w-6 h-6 rounded border text-gray-600 hover:bg-gray-100 select-none touch-manipulation"
                          onMouseDown={() => startQtyHold(item.productId, -1)}
                          onMouseUp={() => endQtyHold(item.productId, -1)}
                          onMouseLeave={clearQtyHold}
                          onTouchStart={() => startQtyHold(item.productId, -1)}
                          onTouchEnd={() => endQtyHold(item.productId, -1)}
                          onTouchCancel={clearQtyHold}
                        >−</button>
                        <input
                          type="text" inputMode="numeric"
                          className="input w-12 !px-1 py-0.5 text-center"
                          value={displayQty(item)}
                          onChange={(e) => handleQtyInputChange(item.productId, e.target.value)}
                          onBlur={() => commitQtyInput(item.productId)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          aria-label={`${offer ? 'Promociones' : 'Cantidad'} de ${item.productName}`}
                          title={offer ? `Cada promoción son ${offer.buyQuantity} piezas` : undefined}
                        />
                        <button className="w-6 h-6 rounded border text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed select-none touch-manipulation"
                          disabled={!item.isMadeToOrder && item.stock != null && item.quantity + qtyStep(item) > item.stock}
                          onMouseDown={() => startQtyHold(item.productId, 1)}
                          onMouseUp={() => endQtyHold(item.productId, 1)}
                          onMouseLeave={clearQtyHold}
                          onTouchStart={() => startQtyHold(item.productId, 1)}
                          onTouchEnd={() => endQtyHold(item.productId, 1)}
                          onTouchCancel={clearQtyHold}
                        >+</button>
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
                      {(discount > 0 || breakdown) && (
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
            <div className={`grid gap-2 ${canDeposit ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <button
                type="button"
                className="py-2 rounded-lg text-sm font-semibold border-2 border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!cashCut}
                title={!cashCut ? 'Abre un corte de caja para poder cobrar' : 'Para algo que vendes pero no está en tu inventario, ej. 2 jitomates'}
                onClick={openConceptModal}
              >📋 Por concepto</button>
              {canDeposit && <button
                type="button"
                className="py-2 rounded-lg text-sm font-semibold border-2 border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={cart.length === 0 || !cashCut}
                title={cart.length === 0 ? 'Agrega primero lo que el cliente va a encargar' : !cashCut ? 'Abre un corte de caja para poder cobrar' : undefined}
                onClick={openDepositModal}
              >💰 Anticipo</button>}
            </div>
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
              {customerNameTooLong && (
                <p className="text-xs text-red-500 mt-1">El nombre no puede tener más de 150 caracteres</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">
                Correo para enviar el ticket (opcional)
              </label>
              {/* Sin type="email" ni required nativos a propósito: el navegador metía su
                  propio globo de validación de formato antes de que este formulario
                  alcanzara a correr, tapando nuestro manejo de errores de abajo. */}
              <input
                className="input mt-1" type="text" placeholder="cliente@correo.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Ej. cliente@gmail.com, cliente@outlook.com</p>
              {customerEmailInvalid ? (
                <p className="text-xs text-red-500 mt-1">El correo no tiene un formato válido</p>
              ) : customerEmailTooLong ? (
                <p className="text-xs text-red-500 mt-1">El correo no puede tener más de 150 caracteres</p>
              ) : null}
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
                {amountExceedsLimit && (
                  <p className="text-red-600 text-xs mt-1">El número es excesivamente grande — el máximo permitido es 9,999,999,999.99</p>
                )}
                {!amountExceedsLimit && cart.length > 0 && amountReceived !== '' && (
                  change != null && change >= 0 ? (
                    <div className="mt-2 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-center overflow-hidden">
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Cambio a entregar</p>
                      <p className="font-bold text-green-700 text-3xl mt-0.5 break-words">{fmt(change)}</p>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-center overflow-hidden">
                      <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Falta por cobrar</p>
                      <p className="font-bold text-red-600 text-3xl mt-0.5 break-words">{fmt(subtotal - amountReceivedNum)}</p>
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
            disabled={cart.length === 0 || loading || !cashCut || cashAmountMissing || amountExceedsLimit
              || customerNameTooLong || customerEmailTooLong || customerEmailInvalid}
            title={!cashCut ? 'Abre un corte de caja para poder cobrar' : amountExceedsLimit ? 'El monto capturado es excesivamente grande' : cashAmountMissing ? 'Captura cuánto pagó el cliente en efectivo' : customerEmailInvalid ? 'El correo capturado no es válido' : (customerNameTooLong || customerEmailTooLong) ? 'Revisa los campos marcados en rojo' : undefined}
          >
            {loading ? 'Procesando...'
              : !cashCut ? 'Abre un corte para cobrar'
              : amountExceedsLimit ? 'El monto es excesivamente grande'
              : cashAmountMissing ? 'Captura el monto recibido'
              : customerEmailInvalid ? 'Revisa el correo del cliente'
              : (customerNameTooLong || customerEmailTooLong) ? 'Revisa los campos marcados en rojo'
              : `Cobrar ${fmt(subtotal)}`}
          </button>
        </div>
      </div>

      {showConceptModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <ModalCloseButton onClick={() => setShowConceptModal(false)} />
            <h3 className="text-lg font-bold mb-1 pr-8">Agregar por concepto</h3>
            <p className="text-xs text-gray-500 mb-4">
              Para algo que vendes pero que no está en tu catálogo/inventario, ej. "2 jitomates" o "3 huevos". Se agrega como una línea más del carrito — puedes seguir agregando productos normales después.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Nombre del producto <span className={conceptFieldErrors.name ? 'text-red-600' : ''}>*</span></label>
                <input
                  className="input" placeholder="Ej. Jitomates" autoFocus
                  value={conceptForm.name}
                  onChange={(e) => setConceptForm({ ...conceptForm, name: e.target.value })}
                />
                {conceptFieldErrors.name && <p className="text-red-600 text-xs mt-1">{conceptFieldErrors.name}</p>}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={conceptForm.isWeighed}
                  onChange={(e) => setConceptForm({ ...conceptForm, isWeighed: e.target.checked })}
                />
                Se vende por peso (ej. azúcar, cecina)
              </label>

              {conceptForm.isWeighed ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Peso (gramos) <span className={conceptFieldErrors.weightGrams ? 'text-red-600' : ''}>*</span></label>
                    <input
                      type="number" min="0" step="any" className="input" placeholder="Ej. 350"
                      value={conceptForm.weightGrams}
                      onChange={(e) => setConceptForm({ ...conceptForm, weightGrams: e.target.value })}
                    />
                    {conceptFieldErrors.weightGrams && <p className="text-red-600 text-xs mt-1">{conceptFieldErrors.weightGrams}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Total cobrado <span className={conceptFieldErrors.totalAmount ? 'text-red-600' : ''}>*</span></label>
                    <input
                      type="number" min="0" step="0.01" className="input" placeholder="0.00"
                      value={conceptForm.totalAmount}
                      onChange={(e) => setConceptForm({ ...conceptForm, totalAmount: e.target.value })}
                    />
                    {conceptFieldErrors.totalAmount && <p className="text-red-600 text-xs mt-1">{conceptFieldErrors.totalAmount}</p>}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Cantidad <span className={conceptFieldErrors.quantity ? 'text-red-600' : ''}>*</span></label>
                    <input
                      type="number" min="0" step="any" className="input"
                      value={conceptForm.quantity}
                      onChange={(e) => setConceptForm({ ...conceptForm, quantity: e.target.value })}
                    />
                    {conceptFieldErrors.quantity && <p className="text-red-600 text-xs mt-1">{conceptFieldErrors.quantity}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Precio unitario <span className={conceptFieldErrors.unitPrice ? 'text-red-600' : ''}>*</span></label>
                    <input
                      type="number" min="0" step="0.01" className="input" placeholder="0.00"
                      value={conceptForm.unitPrice}
                      onChange={(e) => setConceptForm({ ...conceptForm, unitPrice: e.target.value })}
                    />
                    {conceptFieldErrors.unitPrice && <p className="text-red-600 text-xs mt-1">{conceptFieldErrors.unitPrice}</p>}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" className="btn-secondary flex-1" onClick={() => setShowConceptModal(false)}>Cancelar</button>
              <button type="button" className="btn-primary flex-1" onClick={handleAddConcept}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {showDepositModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <ModalCloseButton onClick={() => setShowDepositModal(false)} />
            <h3 className="text-lg font-bold mb-1 pr-8">Registrar anticipo</h3>
            <p className="text-xs text-gray-500 mb-4">
              El cliente deja un anticipo de lo que trae en el carrito ({fmt(subtotal)} en total) — se registra como un apartado activo y una venta aparte solo por el anticipo.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Nombre del cliente <span className={depositFieldErrors.customerName ? 'text-red-600' : ''}>*</span></label>
                <input className="input" value={depositForm.customerName} onChange={(e) => setDepositForm({ ...depositForm, customerName: e.target.value })} />
                {depositFieldErrors.customerName && <p className="text-red-600 text-xs mt-1">{depositFieldErrors.customerName}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Teléfono <span className={depositFieldErrors.customerPhone ? 'text-red-600' : ''}>*</span></label>
                <input className="input" inputMode="numeric" placeholder="10 dígitos" value={depositForm.customerPhone}
                  onChange={(e) => setDepositForm({ ...depositForm, customerPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                {depositFieldErrors.customerPhone && <p className="text-red-600 text-xs mt-1">{depositFieldErrors.customerPhone}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Correo (opcional)</label>
                <input className="input" value={depositForm.customerEmail} onChange={(e) => setDepositForm({ ...depositForm, customerEmail: e.target.value })} />
                {depositFieldErrors.customerEmail && <p className="text-red-600 text-xs mt-1">{depositFieldErrors.customerEmail}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Notas (opcional)</label>
                <textarea className="input" rows={2} value={depositForm.notes} onChange={(e) => setDepositForm({ ...depositForm, notes: e.target.value })} />
                <p className={`text-xs text-right ${depositForm.notes.length > 200 ? 'text-red-600' : 'text-gray-400'}`}>{depositForm.notes.length}/200</p>
                {depositFieldErrors.notes && <p className="text-red-600 text-xs mt-1">{depositFieldErrors.notes}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Anticipo <span className={depositFieldErrors.depositAmount ? 'text-red-600' : ''}>*</span></label>
                  <input className="input" type="text" inputMode="decimal" value={depositForm.depositAmount}
                    onChange={(e) => setDepositForm({ ...depositForm, depositAmount: onlyMoney(e.target.value) })} />
                  {depositFieldErrors.depositAmount && <p className="text-red-600 text-xs mt-1">{depositFieldErrors.depositAmount}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Fecha de entrega <span className={depositFieldErrors.deliveryDate ? 'text-red-600' : ''}>*</span></label>
                  <input className="input" type="date" value={depositForm.deliveryDate}
                    onChange={(e) => setDepositForm({ ...depositForm, deliveryDate: e.target.value })} />
                  {depositFieldErrors.deliveryDate && <p className="text-red-600 text-xs mt-1">{depositFieldErrors.deliveryDate}</p>}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Método de pago del anticipo</label>
                <select className="input" value={depositForm.paymentMethod} onChange={(e) => setDepositForm({ ...depositForm, paymentMethod: e.target.value })}>
                  <option value="CASH">💵 Efectivo</option>
                  <option value="CARD">💳 Tarjeta</option>
                  <option value="TRANSFER">🏦 Transferencia</option>
                </select>
              </div>
              {depositForm.paymentMethod === 'CASH' && (
                <div>
                  <label className="text-xs font-medium text-gray-600">¿Con cuánto paga el cliente? <span className={depositFieldErrors.amountReceived ? 'text-red-600' : ''}>*</span></label>
                  {/* Mismo comportamiento en vivo que "¿Con cuánto paga el cliente?" de la venta:
                      tope de monto mientras se escribe y cambio/falta por cobrar al instante. */}
                  <input className="input mt-1" type="text" inputMode="decimal" placeholder="0.00" value={depositForm.amountReceived}
                    onChange={(e) => {
                      setDepositForm({ ...depositForm, amountReceived: onlyMoney(e.target.value) })
                      setDepositFieldErrors(({ amountReceived, ...rest }) => rest)
                    }} />
                  {depositReceivedExceeds ? (
                    <p className="text-red-600 text-xs mt-1">El número es excesivamente grande — el máximo permitido es 9,999,999,999.99</p>
                  ) : depositFieldErrors.amountReceived ? (
                    <p className="text-red-600 text-xs mt-1">{depositFieldErrors.amountReceived}</p>
                  ) : depositChange != null && (
                    depositChange >= 0 ? (
                      <div className="mt-2 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-center overflow-hidden">
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Cambio a entregar</p>
                        <p className="font-bold text-green-700 text-3xl mt-0.5 break-words">{fmt(depositChange)}</p>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-center overflow-hidden">
                        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Falta por cobrar</p>
                        <p className="font-bold text-red-600 text-3xl mt-0.5 break-words">{fmt(-depositChange)}</p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <button type="button" className="btn-secondary" onClick={() => setShowDepositModal(false)}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={depositLoading} onClick={handleRegisterDeposit}>
                {depositLoading ? 'Guardando...' : 'Registrar anticipo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
