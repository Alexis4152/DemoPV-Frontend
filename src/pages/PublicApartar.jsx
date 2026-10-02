import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicTienda, getPublicCategories, getPublicProducts, getPublicProductsByIds, createPublicApartado, lookupPublicApartado, lookupPublicApartadosByPhone, selfCancelPublicApartado } from '../api/public'
import { applyTiendaBrand } from '../utils/theme'
import { resolveMediaUrl } from '../utils/media'
import { useNotify } from '../context/NotifyContext'
import useEscapeClose from '../hooks/useEscapeClose'
import defaultLogo from '../assets/logo.png'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDateTime = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

// Texto/color por estado para la vista "Consultar mi apartado" — mismos 5 estados que
// ApartadoStatus en el backend.
const STATUS_INFO = {
  PENDING: { label: 'Pendiente de revisión', color: 'bg-amber-100 text-amber-700', icon: '⏳' },
  ACTIVE: { label: 'Confirmado', color: 'bg-green-100 text-green-700', icon: '✅' },
  COMPLETED: { label: 'Completado', color: 'bg-blue-100 text-blue-700', icon: '🎉' },
  CANCELLED: { label: 'Cancelado', color: 'bg-red-100 text-red-700', icon: '❌' },
  EXPIRED: { label: 'Vencido', color: 'bg-gray-200 text-gray-600', icon: '⏰' },
}
// Mismo patrón que Users.jsx/POS.jsx para validar formato de correo del lado del cliente.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Celular mexicano: exactamente 10 dígitos, sin lada de país ni separadores — se filtra
// tecla por tecla en el input (nunca deja escribir una letra o símbolo), así que el estado
// siempre contiene solo dígitos y a lo más 10 de ellos (ver `onlyDigits`). Mismo criterio
// en los tres campos de teléfono de esta pantalla (el del apartado y los dos de "Consultar
// mi apartado") y en el backend (`ApartadoRequest#customerPhone`).
const PHONE_DIGITS = 10
const onlyDigits = (value, maxLen) => value.replace(/\D/g, '').slice(0, maxLen)

// Un carrito por tienda (por `slug`), para que dos vitrinas distintas abiertas en el mismo
// navegador no se mezclen entre sí.
const cartStorageKey = (slug) => `apartado_cart_${slug}`

// Plazo que dura un apartado ya confirmado (Tienda.defaultApartadoHours), en el texto de
// la pantalla de confirmación — en días si son horas exactas de un día completo (ej. 48h
// -> "2 días"), si no en horas.
function fmtPlazo(hours) {
  if (!hours) return 'un plazo que la tienda te confirmará'
  if (hours % 24 === 0) {
    const days = hours / 24
    return `${days} día${days === 1 ? '' : 's'}`
  }
  return `${hours} hora${hours === 1 ? '' : 's'}`
}

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
 * Flujo estilo e-commerce, con tres "vistas" internas controladas por `view` (sin ruta
 * propia — no hay nada que compartir por URL, todo es estado local que se pierde con solo
 * recargar): `'catalog'` (solo el catálogo, a todo lo ancho — buscar/filtrar y "+ Apartar"),
 * `'cart'` (revisar lo apartado, ajustar cantidades y llenar los datos de contacto, con
 * "← Seguir comprando" para volver al catálogo sin perder lo ya agregado) y `'lookup'`
 * (consultar el estado de un apartado ya hecho, por folio + teléfono — sin esto, antes la
 * ÚNICA forma de saber si ya se confirmó, o cuánto plazo queda para recogerlo, era llamar a
 * la tienda o esperar un correo opcional). "+ Apartar" NUNCA cambia de vista por sí solo —
 * solo muestra el toast y actualiza el contador del botón flotante del encabezado, igual
 * que un carrito real: agregar varios productos seguidos no debería ir y venir de pantalla.
 * La solicitud queda `PENDING` (el stock NO se descuenta todavía — lo hace un cajero/admin
 * al confirmarla).
 */
export default function PublicApartar() {
  const { slug } = useParams()
  const { notify, confirmDialog } = useNotify()
  const [tienda, setTienda] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [pageData, setPageData] = useState({ content: [], totalPages: 0 })
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  // Acordeón "Información y contacto" (dirección/teléfono/horario/etc.) — colapsado por
  // defecto, ver el bloque donde se usa.
  const [showStoreInfo, setShowStoreInfo] = useState(false)
  // Modal de detalle de producto (galería completa + descripción) — se abre al tocar la
  // imagen/nombre de una tarjeta del catálogo, nunca al tocar "+ Apartar" (ese sigue
  // agregando directo, sin interrumpir). `detailProduct` es el mismo objeto que ya trae
  // `pageData.content`, no un fetch aparte. `detailImageIndex` es la foto actual dentro
  // de la galería del modal, se reinicia a 0 cada vez que se abre uno nuevo.
  const [detailProduct, setDetailProduct] = useState(null)
  const [detailImageIndex, setDetailImageIndex] = useState(0)

  // 'catalog' (solo productos, a todo lo ancho) o 'cart' (revisar + datos de contacto) — ver
  // el JSDoc de arriba.
  const [view, setView] = useState('catalog')
  const [cart, setCart] = useState([]) // [{ productId, name, price, stock, quantity }]
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [notes, setNotes] = useState('')
  // Qué campos ya "tocó" el visitante (perdió el foco al menos una vez) — el mensaje de
  // "obligatorio" de Nombre/Teléfono solo se muestra para un campo ya tocado, para no
  // recibir a alguien que apenas abre la página con dos errores en rojo sin haber escrito
  // nada. Los demás mensajes (formato de correo, límite de caracteres) siguen en vivo sin
  // esta restricción: esos solo aparecen cuando SÍ hay algo escrito, nunca al cargar.
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // Errores de campo que solo puede saber el BACKEND (ej. si algún día valida algo que el
  // cliente no puede replicar) — { nombreDelCampo: mensaje }, mismo formato que
  // GlobalExceptionHandler ya manda para @Valid. Se combinan con `fieldErrors` (en vivo,
  // ver abajo) para el render; los del backend se limpian solos en cuanto el visitante
  // vuelve a intentar enviar.
  const [backendFieldErrors, setBackendFieldErrors] = useState({})
  const [success, setSuccess] = useState(null)

  // Vista 'lookup' ("Consultar mi apartado") — totalmente independiente del formulario de
  // arriba, su propio folio/teléfono, no el que se esté capturando para un apartado nuevo.
  const [lookupId, setLookupId] = useState('')
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  // Teléfono YA VERIFICADO que produjo `lookupResult` (del formulario de folio, o del que se
  // usó para la búsqueda sin folio) — es lo que se manda a cancelar/editar: el servidor lo
  // vuelve a revalidar desde cero (nunca confía en que ya se verificó al consultar), pero
  // el frontend necesita saber CUÁL de los dos teléfonos fue el que de verdad encontró este
  // apartado, no cuál de los dos inputs tiene algo escrito en este momento.
  const [lookupVerifiedPhone, setLookupVerifiedPhone] = useState('')
  const [selfActionLoading, setSelfActionLoading] = useState(false)
  // Sub-modo "¿no tienes tu folio?" — busca solo por teléfono y lista coincidencias para
  // elegir una, que al dar clic se mete a `lookupResult` igual que la consulta normal (la
  // tarjeta de detalle de abajo es la misma para ambos caminos).
  const [lookupMode, setLookupMode] = useState('folio') // 'folio' | 'phone'
  const [phoneOnlyPhone, setPhoneOnlyPhone] = useState('')
  const [phoneOnlyLoading, setPhoneOnlyLoading] = useState(false)
  const [phoneOnlyError, setPhoneOnlyError] = useState('')
  const [phoneOnlyResults, setPhoneOnlyResults] = useState(null) // null = aún no se buscó, [] = sin resultados

  // Evita que el efecto de guardado de abajo pise el `localStorage` con un carrito vacío
  // mientras el de restauración (asíncrono, ver el siguiente useEffect) todavía no termina
  // de revalidarlo — sin esto, el primer render (carrito en blanco) se guardaría ANTES de
  // que la restauración real alcance a aplicarse, perdiéndola.
  const cartRestoredRef = useRef(false)

  useEffect(() => {
    getPublicTienda(slug)
      .then((r) => { setTienda(r.data.data); applyTiendaBrand(r.data.data.primaryColor) })
      .catch(() => setNotFound(true))
    getPublicCategories(slug).then((r) => setCategories(r.data.data ?? [])).catch(() => {})
  }, [slug])

  /**
   * Revalida una lista de líneas `{productId, quantity, name}` contra el catálogo ACTUAL de
   * esta tienda (stock/precio/oferta/imagen/descripción) y arma lo que `cart` necesita —
   * compartido entre restaurar el carrito guardado en `localStorage` (ver el useEffect de
   * abajo) y "editar" desde la vista 'lookup' (cancelar + reconstruir el carrito con los
   * mismos productos para reenviarlo). Un producto que ya no existe, se desactivó, dejó de
   * ser reservable o se quedó sin stock se excluye (reportado en `unavailable`, para avisar
   * con un toast); al resto se le recorta la cantidad si ya no alcanza.
   */
  async function reconcileItemsToCart(items) {
    if (!items || items.length === 0) return { cart: [], unavailable: [] }
    const res = await getPublicProductsByIds(slug, items.map((i) => i.productId))
    const fresh = res.data.data ?? []
    const unavailable = []
    const cart = items
      .map((i) => {
        const p = fresh.find((f) => f.id === i.productId)
        if (!p || p.stock <= 0) { unavailable.push(i.name); return null }
        return {
          productId: p.id, name: p.name, image: p.images?.[0] ?? null, description: p.description || null,
          price: p.finalPrice ?? p.price, originalPrice: p.price,
          stock: p.stock, quantity: Math.min(i.quantity, p.stock),
        }
      })
      .filter(Boolean)
    return { cart, unavailable }
  }

  // Restaura el carrito guardado de una visita anterior a esta misma tienda (si hay) y lo
  // revalida contra el catálogo ACTUAL (ver `reconcileItemsToCart`) — así una recarga de
  // página, cierre accidental de pestaña, etc. no borra lo que el cliente ya había armado,
  // pero tampoco reaparece con datos obsoletos.
  useEffect(() => {
    cartRestoredRef.current = false
    let cancelled = false
    let saved
    try {
      saved = JSON.parse(localStorage.getItem(cartStorageKey(slug)) || '[]')
    } catch {
      saved = []
    }
    if (!Array.isArray(saved) || saved.length === 0) {
      cartRestoredRef.current = true
      return
    }
    reconcileItemsToCart(saved)
      .then(({ cart: reconciled, unavailable }) => {
        if (cancelled) return
        setCart(reconciled)
        if (unavailable.length > 0) {
          notify(
            `${unavailable.join(', ')} ya no ${unavailable.length === 1 ? 'está disponible' : 'están disponibles'} y se quitó de tu apartado guardado`,
            'error',
          )
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) cartRestoredRef.current = true })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Guarda el carrito en cuanto cambia (agregar/quitar/ajustar cantidad) — ver el useEffect
  // de arriba para la restauración.
  useEffect(() => {
    if (!cartRestoredRef.current) return
    try {
      if (cart.length === 0) localStorage.removeItem(cartStorageKey(slug))
      else localStorage.setItem(cartStorageKey(slug), JSON.stringify(cart))
    } catch {
      // localStorage puede no estar disponible (navegación privada, almacenamiento
      // bloqueado) — degrada en silencio a "sin persistencia", nunca rompe el carrito en
      // memoria ni el resto de la pantalla.
    }
  }, [cart, slug])

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

  // Cierra con ESC el modal de detalle de producto (mismo patrón que los modales de la app
  // autenticada, ej. Inventory.jsx).
  useEscapeClose(!!detailProduct, () => setDetailProduct(null))

  /**
   * Igual que `addToCart` de POS.jsx: muestra un toast rápido ("<producto> agregado")
   * cada vez que sí se agrega, y no dice nada si el intento no cambió nada (ya está en el
   * tope de piezas disponibles).
   */
  function addToCart(product) {
    const existingBefore = cart.find((i) => i.productId === product.id)
    if (existingBefore && existingBefore.quantity >= product.stock) return
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      // `price` es lo que de verdad se cobra (ya con la oferta aplicada, si tiene);
      // `originalPrice` solo se usa para mostrarlo tachado en el carrito. `image`/
      // `description` viajan también para mostrarse en la vista de carrito (ver abajo).
      return [...prev, {
        productId: product.id, name: product.name, image: product.images?.[0] ?? null,
        description: product.description || null,
        price: product.finalPrice ?? product.price, originalPrice: product.price,
        stock: product.stock, quantity: 1,
      }]
    })
    notify(`"${product.name}" agregado a tu apartado`, 'success')
  }

  function updateQty(productId, qty) {
    if (qty < 1) { setCart((prev) => prev.filter((i) => i.productId !== productId)); return }
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: Math.min(qty, i.stock) } : i))
  }

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  // Suma de piezas (no de productos distintos) — mismo criterio que un badge de carrito de
  // e-commerce normal, para el botón flotante del encabezado.
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)

  /**
   * Errores de validación EN VIVO: se recalculan en cada render, así que el mensaje debajo
   * de cada campo (y el asterisco en rojo) aparece o desaparece mientras el visitante
   * teclea, sin tener que dar clic en "Enviar solicitud" primero (mismo patrón que POS.jsx
   * usa para el monto recibido). Replican los límites que ya exige `ApartadoRequest` en el
   * backend (mismos textos de mensaje) — importa más aquí que en cualquier otro formulario
   * del sistema: esta es la ÚNICA pantalla sin autenticación, cualquiera en internet la
   * manda directo, sin un cajero revisando antes.
   *
   * Se combinan con `backendFieldErrors` (solo por si el backend algún día rechaza algo que
   * el cliente no pudo prever) — lo en vivo manda: en cuanto el campo vuelve a ser válido
   * aquí, deja de mostrarse aunque el backend lo hubiera marcado en el intento anterior.
   */
  const liveFieldErrors = {}
  if (!customerName.trim()) liveFieldErrors.customerName = 'El nombre es obligatorio'
  else if (customerName.length > 150) liveFieldErrors.customerName = 'El nombre no puede tener más de 150 caracteres'
  if (!customerPhone) liveFieldErrors.customerPhone = 'El teléfono es obligatorio'
  else if (customerPhone.length !== PHONE_DIGITS) liveFieldErrors.customerPhone = `El teléfono debe tener ${PHONE_DIGITS} dígitos`
  if (customerEmail.trim() !== '') {
    if (!EMAIL_RE.test(customerEmail.trim())) liveFieldErrors.customerEmail = 'El correo no tiene un formato válido'
    else if (customerEmail.length > 150) liveFieldErrors.customerEmail = 'El correo no puede tener más de 150 caracteres'
  }
  if (notes.length > 100) liveFieldErrors.notes = 'Las notas no pueden tener más de 100 caracteres'
  const fieldErrors = { ...backendFieldErrors, ...liveFieldErrors }

  async function handleSubmit(e) {
    e.preventDefault()
    if (cart.length === 0) { setError('Agrega al menos un producto'); return }
    // La validación ya se refleja en vivo en `fieldErrors` (ver arriba) — aquí solo se
    // decide si BLOQUEA el envío, sin volver a calcularla. Marca Nombre/Teléfono como
    // "tocados" por si acaso (ver `touched`): así, si de algún modo se intenta enviar sin
    // haber pasado por esos campos, sus mensajes de "obligatorio" si se muestran.
    if (Object.keys(liveFieldErrors).length > 0) {
      setTouched((t) => ({ ...t, customerName: true, customerPhone: true }))
      setError('')
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    // Mismo patrón que el resto del portal (Inventory.jsx/Roles.jsx/etc.): confirmación
    // explícita antes de mandar algo que ya no se puede deshacer desde aquí (una vez
    // enviada, la solicitud solo se puede cancelar llamando a la tienda).
    if (!(await confirmDialog(
      `¿Confirmas que quieres apartar ${cart.length} producto${cart.length === 1 ? '' : 's'} por un total de ${fmt(total)}?`,
      { confirmText: 'Sí, apartar', danger: false },
    ))) return
    setBackendFieldErrors({})
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
      setBackendFieldErrors({})
      setTouched({})
    } catch (err) {
      // Errores de validación (@Valid, ver GlobalExceptionHandler en el backend) traen
      // { campo: mensaje } en `data` — se reparten a `backendFieldErrors` para mostrarse
      // justo debajo de cada input (se combinan con los en vivo, ver arriba). Cualquier
      // otro tipo de error va al mensaje general.
      const data = err.response?.data?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setBackendFieldErrors(data)
        setError('')
      } else {
        setBackendFieldErrors({})
        setError(err.response?.data?.message ?? 'No se pudo registrar tu apartado')
      }
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Consulta un apartado por folio + teléfono (vista 'lookup') — sin validación en vivo
   * como el formulario de arriba porque es un formulario chico de dos campos: el backend
   * ya regresa un solo mensaje genérico ("No encontramos un apartado...") sea cual sea el
   * problema (folio inexistente, de otra tienda, o teléfono que no coincide), a propósito,
   * para no ayudar a nadie a adivinar folios ajenos probando por eliminación.
   */
  async function handleLookup(e) {
    e.preventDefault()
    if (!lookupId.trim() || !lookupPhone.trim()) {
      setLookupError('Captura el folio y el teléfono')
      return
    }
    setLookupLoading(true)
    setLookupError('')
    try {
      const res = await lookupPublicApartado(slug, { id: Number(lookupId), phone: lookupPhone })
      setLookupResult(res.data.data)
      setLookupVerifiedPhone(lookupPhone)
    } catch (err) {
      setLookupResult(null)
      setLookupError(err.response?.data?.message ?? 'No se pudo consultar tu apartado')
    } finally {
      setLookupLoading(false)
    }
  }

  /**
   * "¿No tienes tu folio?" — busca por teléfono solo y lista coincidencias (hasta 10, más
   * recientes primero) para que el visitante elija la suya. Menos estricto a propósito que
   * `handleLookup` (ver el comentario de `lookupPublicApartadosByPhone` en `api/public.js`)
   * así que, a diferencia de ese, SÍ puede regresar una lista vacía sin ser un error.
   */
  async function handlePhoneOnlySearch(e) {
    e.preventDefault()
    if (!phoneOnlyPhone.trim()) {
      setPhoneOnlyError('Captura tu teléfono')
      return
    }
    setPhoneOnlyLoading(true)
    setPhoneOnlyError('')
    try {
      const res = await lookupPublicApartadosByPhone(slug, { phone: phoneOnlyPhone })
      setPhoneOnlyResults(res.data.data ?? [])
    } catch (err) {
      setPhoneOnlyResults(null)
      setPhoneOnlyError(err.response?.data?.message ?? 'No se pudo buscar')
    } finally {
      setPhoneOnlyLoading(false)
    }
  }

  /** Limpia toda la vista 'lookup' (ambos sub-modos) para empezar de cero. */
  function resetLookup() {
    setLookupResult(null)
    setLookupError('')
    setLookupId('')
    setLookupPhone('')
    setLookupVerifiedPhone('')
    setLookupMode('folio')
    setPhoneOnlyPhone('')
    setPhoneOnlyError('')
    setPhoneOnlyResults(null)
  }

  /**
   * El cliente cancela su propio apartado (botón dentro del detalle de `lookupResult`) —
   * mismo folio+teléfono verificado (`lookupVerifiedPhone`) que ya lo encontró, el servidor
   * lo vuelve a validar desde cero. Solo disponible para PENDING/ACTIVE (el botón ni
   * aparece para los demás estados, ver el JSX). Actualiza `lookupResult` con la respuesta
   * (ya CANCELLED) en vez de cerrar la vista, para que vea de inmediato que sí se aplicó.
   */
  async function handleSelfCancel() {
    if (!(await confirmDialog('¿Seguro que quieres cancelar tu apartado?', { confirmText: 'Sí, cancelar' }))) return
    setSelfActionLoading(true)
    try {
      const res = await selfCancelPublicApartado(slug, { id: lookupResult.id, phone: lookupVerifiedPhone })
      setLookupResult(res.data.data)
      notify('Tu apartado fue cancelado', 'success')
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo cancelar tu apartado', 'error')
    } finally {
      setSelfActionLoading(false)
    }
  }

  /**
   * "Editar" = cancelar este apartado (misma ruta que `handleSelfCancel`, libera el stock
   * de inmediato si ya estaba confirmado) y reconstruir el carrito con los mismos productos
   * (revalidados contra el catálogo actual, ver `reconcileItemsToCart`) para que el cliente
   * los ajuste y mande una solicitud NUEVA desde la vista 'cart' — vuelve a quedar en
   * revisión igual que cualquier apartado nuevo, sin inventar un mecanismo de "editar en el
   * mismo folio". Los productos que ya no existan/tengan stock se avisan y se excluyen.
   */
  async function handleSelfEdit() {
    if (!(await confirmDialog(
      '¿Editar este apartado? Se cancelará el actual y podrás armar uno nuevo con los mismos productos.',
      { confirmText: 'Sí, editar', danger: false },
    ))) return
    setSelfActionLoading(true)
    try {
      await selfCancelPublicApartado(slug, { id: lookupResult.id, phone: lookupVerifiedPhone })
      const items = lookupResult.items
        .filter((i) => i.productId != null)
        .map((i) => ({ productId: i.productId, quantity: Number(i.quantity), name: i.productName }))
      const { cart: reconciled, unavailable } = await reconcileItemsToCart(items)
      setCart(reconciled)
      if (unavailable.length > 0) {
        notify(`${unavailable.join(', ')} ya no ${unavailable.length === 1 ? 'está disponible' : 'están disponibles'}`, 'error')
      }
      resetLookup()
      setView('cart')
      notify('Apartado cancelado — ajusta los productos y envía tu nueva solicitud', 'success')
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo editar tu apartado', 'error')
    } finally {
      setSelfActionLoading(false)
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
          <p className="text-gray-500 text-sm mb-4">Folio #{success.id}</p>
          <div className="text-left bg-gray-50 border border-gray-100 rounded-lg p-4 mb-4 text-xs text-gray-600 space-y-2">
            <p className="font-semibold text-gray-800 text-sm">¿Qué sigue?</p>
            <p>Tu solicitud queda <span className="font-medium">pendiente de revisión</span>.</p>
            <p>✅ Si hay disponibilidad, la tienda la <span className="font-medium">confirma</span>: desde ahí tienes {fmtPlazo(tienda?.defaultApartadoHours)} para recogerlo y pagarlo en la tienda.</p>
            <p>❌ Si algún producto ya no está disponible, la tienda te avisará por teléfono o correo (si dejaste uno).</p>
            <p>⏰ Si se confirma y no lo recoges dentro del plazo, el apartado se libera solo y el producto vuelve a estar disponible.</p>
          </div>
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
          <p className="text-xs text-gray-400 mb-3">
            Guarda tu folio — con él y tu teléfono puedes consultar el estado de tu apartado cuando quieras, sin tener que llamar.
          </p>
          <button className="btn-primary w-full mb-2" onClick={() => { setSuccess(null); setView('catalog') }}>Hacer otro apartado</button>
          <button className="btn-secondary w-full" onClick={() => { setSuccess(null); setView('lookup') }}>Consultar mi apartado</button>
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
        <img src={resolveMediaUrl(tienda?.logoPath) || defaultLogo} alt={tienda?.name ?? 'Logo'} className="w-11 h-11 rounded-full object-cover border-2 border-white/40" />
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white truncate">{tienda?.name ?? 'Cargando...'}</h1>
          <p className="text-xs text-purple-100">Aparta tus productos favoritos</p>
        </div>
        {/* "¿Ya tienes un apartado?" — entrada a la vista 'lookup', para quien ya mandó una
            solicitud en otra visita y solo quiere ver en qué va, sin tener que llamar. */}
        <button
          type="button"
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors shrink-0"
          onClick={() => setView('lookup')}
        >
          📦 <span className="hidden sm:inline">Consultar apartado</span>
        </button>
        {/* Botón de carrito flotante (estilo e-commerce): "+ Apartar" nunca navega por sí
            solo (ver JSDoc del componente) — este botón, con el contador de piezas, es la
            única forma de pasar a revisar/enviar el apartado. */}
        <button
          type="button"
          className="relative flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors shrink-0"
          onClick={() => setView('cart')}
        >
          🛍️ <span className="hidden sm:inline">Mi apartado</span>
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </header>

      {view === 'cart' ? (
        <div className="max-w-5xl mx-auto p-4">
          <button type="button" className="btn-secondary text-sm mb-4" onClick={() => setView('catalog')}>
            ← Seguir comprando
          </button>

          {cart.length === 0 ? (
            <div className="card text-center py-12 border-t-2 border-t-purple-400">
              <p className="text-4xl mb-3">🛍️</p>
              <p className="text-gray-500 text-sm mb-4">Todavía no has agregado nada a tu apartado.</p>
              <button className="btn-primary" onClick={() => setView('catalog')}>Ver catálogo</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Productos — en una tarjeta grande y aparte del formulario (con imagen, como
                  un carrito de e-commerce real), no amontonado en la misma tarjeta chica de
                  antes. */}
              <div className="lg:col-span-2 card border-t-2 border-t-purple-400">
                <h3 className="font-bold text-purple-800 mb-4 text-lg">🛍️ Tu apartado</h3>
                <div className="space-y-3">
                  {cart.map((i) => (
                    <div key={i.productId} className="flex items-center gap-4 pb-3 border-b border-gray-100 last:border-b-0 last:pb-0">
                      <div className="w-20 h-20 shrink-0 bg-purple-50 rounded-lg flex items-center justify-center overflow-hidden">
                        {i.image ? (
                          <img src={resolveMediaUrl(i.image)} alt={i.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl">📦</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{i.name}</p>
                        {i.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{i.description}</p>
                        )}
                        <p className="text-sm text-gray-400 mt-0.5">
                          {i.originalPrice > i.price && <span className="line-through mr-1">{fmt(i.originalPrice)}</span>}
                          {fmt(i.price)} c/u
                        </p>
                        <button type="button" className="text-xs text-red-500 hover:underline mt-1" onClick={() => updateQty(i.productId, 0)}>Quitar</button>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button className="w-8 h-8 rounded border border-purple-200 text-purple-700 hover:bg-purple-50" onClick={() => updateQty(i.productId, i.quantity - 1)}>−</button>
                        <span className="w-8 text-center font-medium">{i.quantity}</span>
                        <button className="w-8 h-8 rounded border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-30" disabled={i.quantity >= i.stock} onClick={() => updateQty(i.productId, i.quantity + 1)}>+</button>
                      </div>
                      <p className="w-24 text-right font-semibold text-gray-900 shrink-0">{fmt(i.price * i.quantity)}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-4 mt-4 border-t border-gray-100 font-bold text-gray-900 text-lg">
                  <span>Total</span><span>{fmt(total)}</span>
                </div>
              </div>

              {/* Formulario de contacto — aparte, para enviarlo. */}
              <div className="lg:col-span-1 card h-fit lg:sticky lg:top-24 border-t-2 border-t-purple-400">
                <h3 className="font-bold text-purple-800 mb-3">Tus datos</h3>
                {/* Sin `required`/`type="email"` nativos a propósito (ver validateApartarForm):
                    esta es la única pantalla sin sesión — el globo del navegador aquí es aún más
                    importante evitarlo, es lo único con lo que un visitante se topa. */}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Tu nombre <span className={fieldErrors.customerName && (touched.customerName || customerName !== '') ? 'text-red-600' : ''}>*</span></label>
                    <input
                      className="input" value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, customerName: true }))}
                    />
                    {fieldErrors.customerName && (touched.customerName || customerName !== '') && (
                      <p className="text-red-600 text-xs mt-1">{fieldErrors.customerName}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Teléfono <span className={fieldErrors.customerPhone && (touched.customerPhone || customerPhone !== '') ? 'text-red-600' : ''}>*</span></label>
                    <input
                      className="input" value={customerPhone} placeholder="Para avisarte cuando esté listo"
                      inputMode="numeric"
                      onChange={(e) => setCustomerPhone(onlyDigits(e.target.value, PHONE_DIGITS))}
                      onBlur={() => setTouched((t) => ({ ...t, customerPhone: true }))}
                    />
                    {fieldErrors.customerPhone && (touched.customerPhone || customerPhone !== '') && (
                      <p className="text-red-600 text-xs mt-1">{fieldErrors.customerPhone}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Correo (opcional)</label>
                    <input className="input" type="text" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                    <p className="text-xs text-gray-400 mt-1">Ej. tucorreo@gmail.com, tucorreo@outlook.com</p>
                    {fieldErrors.customerEmail && <p className="text-red-600 text-xs mt-1">{fieldErrors.customerEmail}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Notas (opcional)</label>
                    <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    {fieldErrors.notes && <p className="text-red-600 text-xs mt-1">{fieldErrors.notes}</p>}
                  </div>
                  {error && <p className="text-red-600 text-sm">{error}</p>}
                  <button type="submit" className="btn-primary w-full" disabled={submitting || cart.length === 0 || Object.keys(liveFieldErrors).length > 0}>
                    {submitting ? 'Enviando...' : 'Enviar solicitud de apartado'}
                  </button>
                  <p className="text-xs text-gray-400 text-center">No se cobra nada en línea — pagas al recogerlo en la tienda.</p>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : view === 'lookup' ? (
        <div className="max-w-md mx-auto p-4">
          <button type="button" className="btn-secondary text-sm mb-4" onClick={() => setView('catalog')}>
            ← Volver al catálogo
          </button>

          {!lookupResult && lookupMode === 'folio' && (
            <div className="card border-t-2 border-t-purple-400">
              <h3 className="font-bold text-purple-800 mb-1">Consultar mi apartado</h3>
              <p className="text-sm text-gray-500 mb-4">
                Captura el folio que te dimos al solicitarlo, y el teléfono con el que lo registraste.
              </p>
              <form onSubmit={handleLookup} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Folio *</label>
                  <input
                    className="input" inputMode="numeric" placeholder="Ej. 123"
                    value={lookupId} onChange={(e) => setLookupId(onlyDigits(e.target.value, 10))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Teléfono *</label>
                  <input
                    className="input" placeholder="Con el que lo registraste" inputMode="numeric"
                    value={lookupPhone} onChange={(e) => setLookupPhone(onlyDigits(e.target.value, PHONE_DIGITS))}
                  />
                </div>
                {lookupError && <p className="text-red-600 text-sm">{lookupError}</p>}
                <button type="submit" className="btn-primary w-full" disabled={lookupLoading}>
                  {lookupLoading ? 'Buscando...' : 'Consultar'}
                </button>
              </form>
              <button
                type="button"
                className="text-xs text-purple-700 hover:underline mt-3 block mx-auto"
                onClick={() => { setLookupMode('phone'); setLookupError('') }}
              >
                ¿No tienes tu folio? Búscalo por tu teléfono
              </button>
            </div>
          )}

          {!lookupResult && lookupMode === 'phone' && (
            <div className="card border-t-2 border-t-purple-400">
              <h3 className="font-bold text-purple-800 mb-1">Buscar por teléfono</h3>
              <p className="text-sm text-gray-500 mb-4">
                Te mostramos tus apartados más recientes en esta tienda con ese teléfono.
              </p>
              <form onSubmit={handlePhoneOnlySearch} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Teléfono *</label>
                  <input
                    className="input" placeholder="Con el que apartaste" inputMode="numeric"
                    value={phoneOnlyPhone} onChange={(e) => setPhoneOnlyPhone(onlyDigits(e.target.value, PHONE_DIGITS))}
                  />
                </div>
                {phoneOnlyError && <p className="text-red-600 text-sm">{phoneOnlyError}</p>}
                <button type="submit" className="btn-primary w-full" disabled={phoneOnlyLoading}>
                  {phoneOnlyLoading ? 'Buscando...' : 'Buscar'}
                </button>
              </form>

              {phoneOnlyResults && (
                phoneOnlyResults.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center mt-4">No encontramos apartados con ese teléfono en esta tienda.</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {phoneOnlyResults.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="w-full text-left border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
                        onClick={() => { setLookupResult(a); setLookupVerifiedPhone(phoneOnlyPhone) }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-gray-900">Folio #{a.id}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_INFO[a.status]?.color}`}>
                            {STATUS_INFO[a.status]?.icon} {STATUS_INFO[a.status]?.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-gray-400 mt-0.5">
                          <span>{fmtDateTime(a.requestedAt)}</span>
                          <span className="font-medium text-gray-600">{fmt(a.total)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}

              <button
                type="button"
                className="text-xs text-purple-700 hover:underline mt-3 block mx-auto"
                onClick={() => { setLookupMode('folio'); setPhoneOnlyError('') }}
              >
                ← Ya tengo mi folio
              </button>
            </div>
          )}

          {lookupResult && (
            <div className="card border-t-2 border-t-purple-400">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-bold text-purple-800">Folio #{lookupResult.id}</h3>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${STATUS_INFO[lookupResult.status]?.color}`}>
                  {STATUS_INFO[lookupResult.status]?.icon} {STATUS_INFO[lookupResult.status]?.label}
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-4">Solicitado el {fmtDateTime(lookupResult.requestedAt)}</p>

              {lookupResult.status === 'PENDING' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 mb-4">
                  Todavía está en revisión — te avisamos en cuanto la tienda la confirme.
                </div>
              )}
              {lookupResult.status === 'ACTIVE' && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800 mb-4">
                  Pasa a recogerlo{lookupResult.expiresAt && <> — tienes hasta el <strong>{fmtDateTime(lookupResult.expiresAt)}</strong></>}.
                </div>
              )}
              {lookupResult.status === 'COMPLETED' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800 mb-4">
                  Ya se completó — gracias por tu compra.
                </div>
              )}
              {lookupResult.status === 'CANCELLED' && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-800 mb-4">
                  Se canceló{lookupResult.cancelledAt && <> el {fmtDateTime(lookupResult.cancelledAt)}</>}.
                  {lookupResult.cancelReason && <> Motivo: {lookupResult.cancelReason}</>}
                </div>
              )}
              {lookupResult.status === 'EXPIRED' && (
                <div className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 mb-4">
                  Se venció el plazo para recogerlo sin que se completara.
                </div>
              )}

              <div className="space-y-1.5 mb-4">
                {lookupResult.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>{Number(i.quantity)} x {i.productName}</span>
                    <span className="font-medium">{fmt(i.subtotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 mt-2 border-t border-gray-100 font-bold text-gray-900">
                  <span>Total</span><span>{fmt(lookupResult.total)}</span>
                </div>
              </div>

              {/* Cancelar/editar la propia solicitud — solo mientras sigue PENDING o ACTIVE
                  (completada/cancelada/vencida ya no se puede tocar, el botón ni aparece).
                  Ver handleSelfCancel/handleSelfEdit: el servidor vuelve a verificar
                  folio+teléfono desde cero en cada una, nunca se confía en que llegar hasta
                  aquí ya demostró que es suyo. */}
              {(lookupResult.status === 'PENDING' || lookupResult.status === 'ACTIVE') && (
                <div className="flex gap-2 mb-3">
                  <button type="button" className="btn-secondary flex-1" disabled={selfActionLoading} onClick={handleSelfEdit}>
                    Editar
                  </button>
                  <button type="button" className="btn-danger flex-1" disabled={selfActionLoading} onClick={handleSelfCancel}>
                    Cancelar
                  </button>
                </div>
              )}

              <button type="button" className="btn-secondary w-full" onClick={resetLookup}>Consultar otro</button>
            </div>
          )}
        </div>
      ) : (
      <div className="max-w-6xl mx-auto p-4">
        {/* Datos de contacto de la tienda (lo que el admin ya captura en "Datos de la
            tienda" — ver StoreInfo.jsx) — antes la vitrina no mostraba nada de esto, un
            cliente que quería ir directo no tenía ni la dirección a la mano. Cada dato es
            opcional por separado (la tienda puede no haber capturado todos), y el bloque
            completo se oculta si no hay ninguno. Solo en esta vista (el "landing" de la
            tienda) — no se repite en 'cart'/'lookup', que son de tarea, no de vitrina.
            Colapsado por defecto (acordeón, ver `showStoreInfo`): la primera versión
            mostraba los 5 datos siempre abiertos, uno por renglón — se veía como una lista
            encimada y empujaba el catálogo hacia abajo antes de ver un solo producto. */}
        {(tienda?.direccion || tienda?.telefono || tienda?.horario || tienda?.paginaWeb || tienda?.redesSociales) && (
          <div className="mb-4">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-medium text-purple-700 hover:text-purple-900"
              onClick={() => setShowStoreInfo((v) => !v)}
            >
              ℹ️ Información y contacto
              <span className={`text-xs transition-transform ${showStoreInfo ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {showStoreInfo && (
              <div className="mt-2 bg-white border border-purple-100 rounded-lg px-4 py-3 text-sm text-gray-600 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {tienda.direccion && <p className="flex items-start gap-2"><span>📍</span><span>{tienda.direccion}</span></p>}
                {tienda.telefono && <p className="flex items-start gap-2"><span>📞</span><span>{tienda.telefono}</span></p>}
                {tienda.horario && <p className="flex items-start gap-2 whitespace-pre-line"><span>🕐</span><span>{tienda.horario}</span></p>}
                {tienda.paginaWeb && <p className="flex items-start gap-2"><span>🌐</span><span>{tienda.paginaWeb}</span></p>}
                {tienda.redesSociales && <p className="flex items-start gap-2 whitespace-pre-line"><span>🔗</span><span>{tienda.redesSociales}</span></p>}
              </div>
            )}
          </div>
        )}

        {/* Catálogo — a todo lo ancho, sin el carrito al lado (ver botón flotante del
            encabezado y la vista 'cart' de arriba). */}
        <div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {pageData.content.map((p) => (
                <div key={p.id} className="card p-3 flex flex-col border-t-2 border-t-purple-300">
                  {/* Abre el detalle (galería completa + descripción sin truncar) — "+
                      Apartar" de abajo es un botón aparte, su clic nunca llega aquí. */}
                  <button
                    type="button"
                    className="w-full aspect-square bg-purple-50 rounded-lg mb-2 flex items-center justify-center overflow-hidden cursor-zoom-in"
                    onClick={() => { setDetailProduct(p); setDetailImageIndex(0) }}
                  >
                    {p.images?.[0] ? (
                      <img src={resolveMediaUrl(p.images[0])} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">📦</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="font-medium text-sm text-gray-900 line-clamp-2 text-left hover:text-purple-700"
                    onClick={() => { setDetailProduct(p); setDetailImageIndex(0) }}
                  >
                    {p.name}
                  </button>
                  {p.description && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.description}</p>
                  )}
                  <p className={`text-xs mt-0.5 ${p.stock > 0 ? 'text-gray-400' : 'text-red-500 font-medium'}`}>
                    {p.stock} pieza{p.stock === 1 ? '' : 's'}
                  </p>
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

      </div>
      )}

      {/* Detalle de producto — galería completa (si tiene más de una foto) + descripción
          sin truncar, algo que antes no existía: la tarjeta del catálogo solo mostraba la
          primera foto en chico y la descripción cortada a 2 líneas. */}
      {detailProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetailProduct(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-3 mb-3">
              <h3 className="text-lg font-bold text-gray-900">{detailProduct.name}</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0" onClick={() => setDetailProduct(null)}>✕</button>
            </div>

            <div className="w-full aspect-square bg-purple-50 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
              {detailProduct.images?.[detailImageIndex] ? (
                <img src={resolveMediaUrl(detailProduct.images[detailImageIndex])} alt={detailProduct.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-5xl">📦</span>
              )}
            </div>

            {detailProduct.images?.length > 1 && (
              <div className="flex gap-2 mb-4 overflow-x-auto">
                {detailProduct.images.map((img, idx) => (
                  <button
                    key={idx} type="button"
                    className={`w-14 h-14 shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${idx === detailImageIndex ? 'border-purple-500' : 'border-transparent'}`}
                    onClick={() => setDetailImageIndex(idx)}
                  >
                    <img src={resolveMediaUrl(img)} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {detailProduct.description && (
              <p className="text-sm text-gray-600 mb-3 whitespace-pre-line">{detailProduct.description}</p>
            )}

            <p className={`text-sm mb-2 ${detailProduct.stock > 0 ? 'text-gray-400' : 'text-red-500 font-medium'}`}>
              {detailProduct.stock} pieza{detailProduct.stock === 1 ? '' : 's'} disponible{detailProduct.stock === 1 ? '' : 's'}
            </p>

            {detailProduct.discountPercent > 0 ? (
              <div className="mb-4">
                <span className="text-sm text-gray-400 line-through mr-2">{fmt(detailProduct.price)}</span>
                <span className="text-xs font-bold bg-red-500 text-white px-1.5 py-0.5 rounded mr-2">-{Number(detailProduct.discountPercent)}%</span>
                <span className="text-2xl font-bold text-purple-700">{fmt(detailProduct.finalPrice)}</span>
              </div>
            ) : (
              <p className="text-2xl font-bold text-purple-700 mb-4">{fmt(detailProduct.price)}</p>
            )}

            <button className="btn-primary w-full" onClick={() => { addToCart(detailProduct); setDetailProduct(null) }}>+ Apartar</button>
          </div>
        </div>
      )}
    </div>
  )
}
