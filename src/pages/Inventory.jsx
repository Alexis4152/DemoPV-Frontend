import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getProductsPage, createProduct, updateProduct, adjustStock, deleteProduct, searchProducts, getProductByBarcode, getProductReservedStats,
  getProductImages, uploadProductImage, setPrimaryProductImage, deleteProductImage, getSiblingStock,
} from '../api/products'
import { getCategories, createCategory } from '../api/categories'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import { resolveMediaUrl } from '../utils/media'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

const emptyForm = { name: '', description: '', barcode: '', price: '', cost: '', stock: '', minStock: 5, unit: 'pieza', categoryId: '', isReservable: false, apartadoDiscountPercent: '' }
const PAGE_SIZES = [10, 20, 50, 100]

// Mismo límite que ProductImageService en el backend (ver ese archivo) — validarlo aquí
// también evita el viaje redondo al servidor solo para enterarse de que pesa de más, y dice
// el motivo exacto en vez de un error genérico de red al fallar la subida.
const MAX_IMAGE_MB = 5

// -> los params que espera GET /products/page. Único filtro de disponibilidad que queda
// (ver `lowStockOnly`) es "stock bajo", como un botón de encendido/apagado — los que
// filtraban por historial de ventas ("sin ventas"/"más vendidos") se quitaron junto con
// la columna "Vendidos".
function availabilityParams(lowStockOnly) {
  return lowStockOnly ? { lowStock: true } : {}
}

// Valor centinela para la opción "Otra..." del selector de categoría: no puede colisionar
// con un id real (los ids de categoría son numéricos), así que sirve para distinguir
// "el usuario quiere crear una categoría nueva" de una categoría existente seleccionada.
const NEW_CATEGORY_VALUE = '__new__'

/**
 * Página "Inventario": administración del catálogo de productos de la tienda del usuario
 * (alta/edición/desactivación) y ajustes manuales de stock fuera del flujo normal de venta
 * (entradas por compra, salidas por merma/corrección). También muestra un aviso persistente
 * con los productos que están en su stock mínimo o por debajo (`lowStockItems`).
 *
 * Paginación server-side (igual patrón que Sales/CashCuts): `GET /products/page` hace la
 * búsqueda de texto, el filtro de categoría y el de stock bajo (`lowStockOnly`, un botón
 * de encendido/apagado, no un combo) todo en el servidor, para que esta pantalla siga
 * respondiendo rápido aunque el catálogo crezca a miles de productos — a diferencia de
 * antes, que traía el catálogo completo de un jalón y filtraba en el cliente. El texto de
 * búsqueda lleva un debounce de 250ms (ver el `useEffect` que llama a `loadPage`) para no
 * pegarle a la API en cada tecla.
 *
 * Control de acceso (vía `isAdmin`, solo frontend — el backend es quien realmente lo hace
 * cumplir): crear/editar/desactivar productos y registrar salidas de stock (ajuste "OUT",
 * es decir reducir stock manualmente fuera de una venta) están reservados a ADMIN. Cualquier
 * usuario con acceso a esta pantalla puede registrar entradas de stock ("IN").
 *
 * Lector de código de barras (altas/bajas): el escaneo se captura a nivel de documento
 * (no hace falta tener el foco en ningún campo en particular — ver el `useEffect` de
 * `onKeyDown` más abajo, que distingue un escaneo de tecleo humano por la velocidad entre
 * teclas) y hace una búsqueda EXACTA por código. Si el código ya existe, le pregunta al
 * usuario (solo ADMIN, que es quien puede editar) si quiere "Editar producto" o "Ajustar
 * stock" — un usuario sin ese permiso va directo a "Ajustar stock" (modo "Agregar piezas"),
 * la única opción que puede hacer de todas formas. Si no existe, abre el modal de "Nuevo
 * producto" con el código ya precargado, para dar de alta sin volver a teclearlo.
 */
export default function Inventory() {
  const { isAdmin } = useAuth()
  const { notify, confirmDialog } = useNotify()
  // Permite llegar con el filtro ya aplicado desde afuera (ej. la tarjeta "Stock bajo" del
  // Dashboard enlaza a `/inventory?availability=lowStock`). Solo se lee al montar — un
  // valor desconocido o ausente cae en 'all', el default de siempre.
  const [searchParams] = useSearchParams()
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  // Único filtro de disponibilidad: stock bajo, como botón de encendido/apagado (no un
  // combo — ver `availabilityParams`).
  const [lowStockOnly, setLowStockOnly] = useState(() => searchParams.get('availability') === 'lowStock')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  // Map productId -> piezas actualmente descontadas del stock por apartados ACTIVE (ya
  // confirmados), para la columna "Apartados" — a propósito NO incluye PENDING, que
  // todavía no descuenta stock real (mostrarlo sería confuso: parecería que ya falta
  // esa pieza cuando en realidad sigue completa en el inventario). Cubre TODO el
  // catálogo (no solo la página actual) porque es un query agregado ligero.
  const [reservedStats, setReservedStats] = useState(new Map())
  // Selección múltiple (checkboxes de la tabla) para marcar/quitar "reservable" en lote —
  // sin esto, habilitar apartados para un catálogo ya existente significaba entrar
  // producto por producto. Solo cubre los productos de la página actual (ver `products`).
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [bulkDiscountModal, setBulkDiscountModal] = useState(false)
  const [bulkDiscountValue, setBulkDiscountValue] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [form, setForm] = useState(emptyForm)
  // Galería de fotos del producto en edición (ver `openEdit`) — pensada sobre todo para
  // exhibirlo en la tienda pública de apartados.
  const [productImages, setProductImages] = useState([])
  const [uploadingImage, setUploadingImage] = useState(false)
  // Fotos elegidas para un producto NUEVO, antes de que exista un id al que subirlas de
  // verdad (ver `handleSave`) — se suben todas justo después de que la creación responde.
  // `previewUrl` es un blob local (URL.createObjectURL), solo para la vista previa.
  const [pendingImages, setPendingImages] = useState([])
  const [adjustModal, setAdjustModal] = useState(null)
  const [adjustDirection, setAdjustDirection] = useState('IN')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  // Errores de validación por campo del modal "Ajustar stock" ({ quantity/reason: mensaje })
  // — aparte de `fieldErrors` del modal de producto, son formularios distintos.
  const [adjustFieldErrors, setAdjustFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  // Carga de la tabla paginada (loadPage), separado de `loading` (que es del formulario de
  // guardar/ajustar) para que un refresco en segundo plano de la tabla no deshabilite ni
  // cambie el texto del botón "Guardar"/"Confirmar" de un modal abierto al mismo tiempo.
  const [tableLoading, setTableLoading] = useState(true)
  // Error general del modal de producto (uno solo, para reglas de negocio sin campo
  // asociado — ej. "elige una tienda" — o cualquier fallo que no venga de @Valid).
  const [error, setError] = useState('')
  // Errores de validación por campo del modal de producto: { nombreDelCampo: mensaje },
  // tal como los manda GlobalExceptionHandler#handleValidation — se muestran justo debajo
  // de su input y ponen en rojo el asterisco de "obligatorio" de ese campo (ver handleSave).
  const [fieldErrors, setFieldErrors] = useState({})
  const [lowStockItems, setLowStockItems] = useState([])
  const [adjustNotice, setAdjustNotice] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [choiceModal, setChoiceModal] = useState(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  // Modal "Buscar en tiendas asociadas" (ver SiblingStockModal más abajo) — visible para
  // cualquier rol, no solo ADMIN: es una consulta de solo lectura entre sucursales del
  // mismo Supervisor, útil para cualquiera que atienda al cliente en el mostrador.
  const [showSiblingStock, setShowSiblingStock] = useState(false)
  const scanInputRef = useRef(null)
  const modalOpenRef = useRef(false)

  /**
   * Trae la página actual del catálogo usando `page`/`size`, el texto de búsqueda y los
   * filtros de categoría/disponibilidad vigentes — todo resuelto en el servidor (ver
   * `GET /products/page`). Se re-ejecuta automáticamente (ver el `useEffect` de abajo,
   * con debounce de 250ms sobre el texto) cada vez que cambia cualquiera de esos valores.
   */
  function loadPage() {
    setTableLoading(true)
    setSelectedIds(new Set()) // la página/filtro cambió, la selección anterior ya no corresponde a lo que se ve
    getProductsPage({
      q: search.trim() || undefined,
      categoryId: filterCat || undefined,
      ...availabilityParams(lowStockOnly),
      page,
      size,
    }).then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
      .finally(() => setTableLoading(false))
  }

  // Debounce de 250ms sobre el texto de búsqueda (mismo patrón que POS.jsx), para no
  // pegarle a la API en cada tecla; categoría/disponibilidad/página/tamaño no necesitan
  // debounce, son cambios discretos (un select o un botón), así que disparan de inmediato.
  useEffect(() => {
    const t = setTimeout(loadPage, 250)
    return () => clearTimeout(t)
  }, [search, filterCat, lowStockOnly, page, size])

  /**
   * Recarga las fuentes de datos "auxiliares" que no dependen de la página/filtro actual:
   * las categorías (para el filtro y el formulario), la lista de productos en stock
   * mínimo o por debajo (`lowStock: true`, hasta 200) que alimenta el aviso amarillo
   * persistente, y las piezas actualmente apartadas por producto (columna "Apartados" —
   * ver `reservedStats`). Se llama al montar y después de cualquier operación que pueda
   * cambiar existencias o catálogo (guardar producto, ajustar stock, desactivar producto),
   * junto con `loadPage()` para refrescar también la tabla.
   */
  function loadAux() {
    getCategories().then((r) => setCategories(r.data.data ?? []))
    searchProducts({ lowStock: true, size: 200 }).then((r) => setLowStockItems(r.data.data ?? []))
    getProductReservedStats().then((r) => setReservedStats(new Map((r.data.data ?? []).map(([id, qty]) => [id, Number(qty)]))))
  }

  useEffect(() => { loadAux() }, [])

  /** Refresca tabla + datos auxiliares tras una operación que puede afectar a ambos (guardar, ajustar, desactivar). */
  function reloadAll() {
    loadPage()
    loadAux()
  }

  const products = pageData.content ?? []
  const totalElements = pageData.totalElements ?? 0
  const totalPages = pageData.totalPages ?? 0
  const rangeFrom = totalElements === 0 ? 0 : page * size + 1
  const rangeTo = Math.min(totalElements, page * size + products.length)

  /**
   * Abre el modal de producto en modo "alta": limpia el formulario y cualquier error
   * previo. Si viene de un escaneo de un código desconocido (`prefillBarcode`), lo
   * precarga en el formulario para no tener que volver a teclearlo. `pendingImages` se
   * reinicia igual que el resto — las fotos elegidas en un alta cancelada no deben
   * arrastrarse a la siguiente.
   */
  function openNew(prefillBarcode) {
    setEditProduct(null)
    setForm({ ...emptyForm, barcode: prefillBarcode ?? '' })
    setNewCategoryName('')
    setProductImages([])
    pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    setPendingImages([])
    setError('')
    setFieldErrors({})
    setShowModal(true)
  }

  /**
   * Abre el modal de producto en modo "edición", precargando el formulario con los datos
   * del producto seleccionado y su galería de fotos (`getProductImages`) — a diferencia de
   * `openNew`, aquí las fotos SÍ se suben al instante (ver `handleUploadImage`), porque el
   * producto ya tiene un id al que asociarlas.
   */
  function openEdit(p) {
    setEditProduct(p)
    setForm({
      name: p.name, description: p.description ?? '', barcode: p.barcode ?? '',
      price: p.price, cost: p.cost ?? '', stock: p.stock,
      minStock: p.minStock, unit: p.unit, categoryId: p.category?.id ?? '',
      isReservable: !!p.isReservable,
      apartadoDiscountPercent: p.apartadoDiscountPercent ?? '',
    })
    setNewCategoryName('')
    setProductImages([])
    getProductImages(p.id).then((r) => setProductImages(r.data.data ?? [])).catch(() => {})
    setError('')
    setFieldErrors({})
    setShowModal(true)
  }

  /** Sube una foto nueva para el producto en edición y refresca la galería del modal. */
  async function handleUploadImage(e) {
    const file = e.target.files?.[0]
    if (!file || !editProduct) return
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      notify(`La imagen pesa demasiado — el máximo permitido es ${MAX_IMAGE_MB} MB`, 'error')
      e.target.value = ''
      return
    }
    setUploadingImage(true)
    try {
      await uploadProductImage(editProduct.id, file)
      const r = await getProductImages(editProduct.id)
      setProductImages(r.data.data ?? [])
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo subir la foto', 'error')
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  /**
   * Contraparte de `handleUploadImage` para un producto NUEVO: como todavía no existe un
   * id al que subir la foto, solo la guarda en memoria con una vista previa local
   * (`URL.createObjectURL`) — la subida real ocurre en `handleSave`, justo después de que
   * la creación del producto responde con su id.
   */
  function handleStageImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      notify(`La imagen pesa demasiado — el máximo permitido es ${MAX_IMAGE_MB} MB`, 'error')
      e.target.value = ''
      return
    }
    setPendingImages((prev) => [...prev, { file, previewUrl: URL.createObjectURL(file) }])
    e.target.value = ''
  }

  function handleRemovePendingImage(index) {
    setPendingImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function handleSetPrimaryImage(imageId) {
    await setPrimaryProductImage(editProduct.id, imageId)
    const r = await getProductImages(editProduct.id)
    setProductImages(r.data.data ?? [])
  }

  async function handleDeleteImage(imageId) {
    if (!(await confirmDialog('¿Quitar esta foto?', { confirmText: 'Quitar' }))) return
    await deleteProductImage(editProduct.id, imageId)
    const r = await getProductImages(editProduct.id)
    setProductImages(r.data.data ?? [])
  }

  /** Abre el modal de "Ajustar stock" para `p` en modo "Agregar piezas" (el modo por default tras un escaneo). */
  function openAdjust(p) {
    setAdjustModal(p)
    setAdjustDirection('IN')
    setAdjustQty('')
    setAdjustReason('')
    setAdjustFieldErrors({})
  }

  /**
   * Punto único al que llegan tanto el campo "Escanear código de barras" como el listener
   * global de teclado (ver más abajo): busca coincidencia EXACTA por código. Si el producto
   * ya existe, le pregunta al usuario qué quiere hacer (editar o ajustar stock) mediante
   * `choiceModal` — salvo que no tenga permiso de editar (no ADMIN), en cuyo caso va
   * directo a "Ajustar stock", su única opción real. Si no existe, abre "Nuevo producto"
   * con el código ya precargado, para dar de alta sin volver a teclearlo.
   */
  async function handleScannedCode(code) {
    const found = (await getProductByBarcode(code).catch(() => null))?.data?.data
    if (found) {
      if (isAdmin) setChoiceModal(found)
      else openAdjust(found)
    } else {
      notify(`Código "${code}" no encontrado — completa los datos para darlo de alta`, 'info')
      openNew(code)
    }
  }

  /** Maneja el Enter del campo "Escanear código de barras" (lo manda automáticamente un lector tras "teclear" el código). */
  async function handleScanKeyDown(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const code = scanCode.trim()
    if (!code) return
    setScanCode('')
    await handleScannedCode(code)
    scanInputRef.current?.focus()
  }

  // Mantiene al día si hay algún modal abierto (producto, ajuste, o la elección
  // editar/ajustar), para que el listener global de escaneo no interfiera con lo que el
  // usuario esté tecleando dentro de esos modales (p. ej. el campo código de barras del
  // formulario de "Nuevo producto").
  useEffect(() => { modalOpenRef.current = showModal || !!adjustModal || !!choiceModal }, [showModal, adjustModal, choiceModal])

  // Captura de escaneo "global": igual que en el POS, una pistola lectora teclea cada
  // carácter en milisegundos y termina con Enter, mucho más rápido que una persona
  // escribiendo a mano — así que no hace falta tener el foco en el campo de escaneo
  // específico. Se descarta cualquier secuencia con tiempo entre teclas mayor a
  // SCAN_GAP_MS (probablemente un Enter humano, no un escaneo) y se ignora mientras haya
  // algún modal abierto o el foco ya esté en el campo de escaneo (que maneja su propio
  // Enter arriba).
  useEffect(() => {
    const SCAN_GAP_MS = 50
    const MIN_CODE_LENGTH = 3
    let buffer = ''
    let lastTime = 0

    function onKeyDown(e) {
      if (modalOpenRef.current || e.ctrlKey || e.metaKey || e.altKey) return
      const now = Date.now()
      const gap = now - lastTime
      lastTime = now

      if (e.key === 'Enter') {
        const code = buffer
        buffer = ''
        if (code.length < MIN_CODE_LENGTH || gap >= SCAN_GAP_MS) return
        if (document.activeElement === scanInputRef.current) return
        e.preventDefault()
        handleScannedCode(code)
        return
      }

      if (e.key.length === 1) {
        buffer = gap < SCAN_GAP_MS ? buffer + e.key : e.key
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Cierra con ESC el modal que esté abierto (producto, ajuste, elección o descuento
  // masivo), descartando lo capturado — mismo comportamiento que el botón "Cancelar" de cada uno.
  useEffect(() => {
    if (!showModal && !adjustModal && !choiceModal && !bulkDiscountModal) return
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (showModal) setShowModal(false)
      else if (adjustModal) setAdjustModal(null)
      else if (choiceModal) setChoiceModal(null)
      else if (bulkDiscountModal) setBulkDiscountModal(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showModal, adjustModal, choiceModal, bulkDiscountModal])

  /**
   * Valida el formulario de producto del lado del cliente, replicando exactamente los
   * límites que ya exige `ProductRequest` en el backend (mismos textos de mensaje) — para
   * detectar el error ANTES de pedir confirmación de guardado (ver `handleSave`), en vez
   * de hacerlo hasta después del viaje redondo al servidor. El backend sigue siendo quien
   * de verdad decide (esto no lo reemplaza, solo adelanta el aviso más común).
   *
   * @returns {{[field: string]: string}} vacío si el formulario es válido
   */
  function validateProductForm() {
    const errors = {}
    // Nombre/Precio/Categoría ya no llevan el atributo HTML `required` (ver el JSX del
    // modal) — ese globo nativo del navegador se disparaba ANTES de que este formulario
    // alcanzara a correr, tapando por completo nuestro propio manejo de errores. Estos
    // tres checks son quienes ahora cubren "obligatorio", con el mismo texto debajo del
    // campo que usa cualquier otro error.
    if (!form.name.trim()) errors.name = 'El nombre es obligatorio'
    else if (form.name.length > 200) errors.name = 'El nombre no puede tener más de 200 caracteres'
    if (form.barcode.length > 100) errors.barcode = 'El código de barras no puede tener más de 100 caracteres'
    if (form.unit.length > 20) errors.unit = 'La unidad no puede tener más de 20 caracteres'
    if (form.description.length > 500) errors.description = 'La descripción no puede tener más de 500 caracteres'
    // Máximos alineados al límite real de columna en Postgres (ver ProductRequest en el
    // backend): NUMERIC(12,2) para price/cost, INTEGER para stock/minStock — sin esto, un
    // valor absurdamente grande pasaba hasta el backend y tronaba con un error crudo de
    // "numeric field overflow" en vez de un mensaje claro.
    if (form.price === '') errors.price = 'El precio es obligatorio'
    else if (Number(form.price) > 9999999999.99) errors.price = 'El precio no puede ser mayor a 9,999,999,999.99'
    if (form.cost !== '' && Number(form.cost) > 9999999999.99) errors.cost = 'El costo no puede ser mayor a 9,999,999,999.99'
    if (form.stock !== '' && Number(form.stock) > 2147483647) errors.stock = 'El stock no puede ser mayor a 2,147,483,647'
    if (form.minStock !== '' && Number(form.minStock) > 2147483647) errors.minStock = 'El stock mínimo no puede ser mayor a 2,147,483,647'
    if (!form.categoryId) errors.categoryId = 'Selecciona una categoría'
    else if (form.categoryId === NEW_CATEGORY_VALUE && !newCategoryName.trim()) errors.newCategoryName = 'Escribe el nombre de la nueva categoría'
    if (form.apartadoDiscountPercent !== '') {
      const pct = Number(form.apartadoDiscountPercent)
      if (pct < 0) errors.apartadoDiscountPercent = 'El descuento de apartado no puede ser negativo'
      else if (pct > 100) errors.apartadoDiscountPercent = 'El descuento de apartado no puede ser mayor a 100'
    }
    return errors
  }

  /**
   * Guarda el formulario de producto, ya sea creando uno nuevo o actualizando
   * `editProduct` según cuál esté seteado. Convierte los campos numéricos (vienen como
   * string desde los inputs) antes de enviarlos. Si el backend rechaza la operación,
   * muestra el mensaje de error dentro del propio modal (no usa `notify`) para que el
   * usuario pueda corregir sin perder lo capturado. Al guardar con éxito cierra el modal
   * y recarga el catálogo completo (para reflejar el nuevo/actualizado producto y, si
   * cambió el stock inicial, el aviso de stock mínimo).
   *
   * Categoría nueva ("Otra..."): si el selector quedó en `NEW_CATEGORY_VALUE`, primero
   * crea la categoría con el nombre capturado en `newCategoryName` y usa el id que
   * devuelve el backend para el producto — todo en un solo Guardar, sin que el usuario
   * tenga que ir a otra pantalla a darla de alta antes. Si la creación de la categoría
   * falla (nombre repetido, etc.), el producto tampoco se guarda: se corta ahí y se
   * muestra el error, para no dejar a medias un producto sin categoría real.
   *
   * Pide confirmación explícita antes de tocar el backend (crear o editar), para evitar
   * altas/ediciones accidentales por un clic de más — pero solo si el formulario ya pasó
   * la validación local (ver `validateProductForm`): no tiene sentido preguntar "¿deseas
   * agregar/guardar?" si el backend lo va a rechazar de todas formas.
   */
  async function handleSave(e) {
    e.preventDefault()
    const validationErrors = validateProductForm()
    if (Object.keys(validationErrors).length > 0) {
      // Advertencia de validación local, NO el mismo mensaje que un fallo real del
      // backend (ver el catch de abajo) — aquí todavía no se intentó guardar nada.
      setFieldErrors(validationErrors)
      setError('')
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    const confirmMsg = editProduct
      ? `¿Deseas guardar los cambios de "${form.name}"?`
      : `¿Deseas agregar el producto "${form.name}"?`
    if (!(await confirmDialog(confirmMsg, { confirmText: editProduct ? 'Guardar cambios' : 'Agregar', danger: false }))) return
    setLoading(true)
    setError('')
    setFieldErrors({})
    try {
      let categoryId = form.categoryId
      if (categoryId === NEW_CATEGORY_VALUE) {
        const name = newCategoryName.trim()
        if (!name) { setError('Escribe el nombre de la nueva categoría'); setLoading(false); return }
        const newCategory = (await createCategory({ name })).data.data
        setCategories((prev) => [...prev, newCategory])
        categoryId = newCategory.id
      }
      const payload = { ...form, price: Number(form.price), cost: form.cost ? Number(form.cost) : null,
        stock: Number(form.stock), minStock: Number(form.minStock), categoryId: Number(categoryId),
        apartadoDiscountPercent: form.apartadoDiscountPercent === '' ? null : Number(form.apartadoDiscountPercent) }
      if (editProduct) {
        await updateProduct(editProduct.id, payload)
      } else {
        // Las fotos elegidas antes de guardar (`pendingImages`) recién se suben AQUÍ: no
        // existe un id de producto al que asociarlas hasta que la creación responde.
        const created = (await createProduct(payload)).data.data
        for (const { file } of pendingImages) {
          // El producto ya se creó — si una foto falla al subir (red, servidor, etc.) no
          // debe tumbar todo el flujo ni fingir que no pasó nada: se avisa aparte y se
          // sigue con las demás, en vez del `.catch(() => {})` de antes que lo escondía.
          await uploadProductImage(created.id, file)
            .catch((err) => notify(err.response?.data?.message ?? `No se pudo subir "${file.name}"`, 'error'))
        }
      }
      pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl))
      setPendingImages([])
      setShowModal(false)
      reloadAll()
      notify(editProduct ? 'Producto editado correctamente' : 'Producto guardado correctamente', 'success')
    } catch (err) {
      // Errores de validación (ver GlobalExceptionHandler#handleValidation en el backend)
      // traen { campo: mensaje } en `data` — se reparten a `fieldErrors` para mostrarse
      // justo debajo de cada input y poner su asterisco en rojo. Cualquier otro tipo de
      // error (regla de negocio, 500, etc.) no tiene campo asociado: va al mensaje general.
      const data = err.response?.data?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setFieldErrors(data)
        setError('')
      } else {
        setFieldErrors({})
        setError(err.response?.data?.message ?? 'Error al guardar')
      }
      notify(editProduct ? 'Error al guardar el producto' : 'Error al registrar el producto', 'error')
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
  // Mismo límite que ProductService#adjustStock en el backend (máximo de un INTEGER de
  // Postgres) — sin filtro de longitud en el input de Cantidad, nada impide teclear 40
  // dígitos seguidos; Number() de eso da un float gigante que JS renderiza en notación
  // científica ("8.78e+37") en el "Nuevo stock" de abajo, ilegible para el usuario. Cubre
  // ambas direcciones (agregar Y quitar) porque compara el resultado ya con signo aplicado.
  const adjustPreviewExceedsLimit = adjustQtyNum > 2147483647 || adjustPreviewStock > 2147483647

  /**
   * Envía el ajuste manual de stock (entrada o salida, ver `adjustSignedQty`) para el
   * producto en `adjustModal`. Tras un ajuste exitoso recarga el catálogo/lista de stock
   * mínimo y, si el producto quedó en su nivel mínimo o por debajo, muestra un aviso rojo
   * adicional (`adjustNotice`) con el nombre y las existencias restantes — distinto del
   * aviso amarillo general de `lowStockItems`, que solo se refresca al volver a cargar.
   *
   * Pide confirmación explícita antes de tocar el backend, con el verbo (agregar/quitar)
   * y la cantidad ya resueltos según `adjustDirection`.
   */
  async function handleAdjust(e) {
    e.preventDefault()
    // Validación local ANTES del modal de confirmación — mismo criterio que
    // validateProductForm: sin `required`/`min` nativos (ver el JSX del modal), así que
    // esto es lo único que impide mandar una cantidad en 0 o un motivo demasiado largo.
    const validationErrors = {}
    if (adjustQtyNum <= 0) validationErrors.quantity = 'La cantidad debe ser mayor a 0'
    // Mismo límite que ProductService#adjustStock en el backend: el stock resultante
    // (actual + esta cantidad) no puede pasar el máximo de un INTEGER de Postgres — sin
    // esto, un valor muy alto pasaba hasta el backend y ahí desbordaba la aritmética.
    else if (adjustPreviewExceedsLimit) {
      validationErrors.quantity = 'El número es excesivamente grande — el máximo permitido es 2,147,483,647'
    }
    if (adjustReason.length > 255) validationErrors.reason = 'El motivo no puede tener más de 255 caracteres'
    if (Object.keys(validationErrors).length > 0) {
      setAdjustFieldErrors(validationErrors)
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    setAdjustFieldErrors({})
    const verb = adjustDirection === 'IN' ? 'agregar' : 'quitar'
    const prep = adjustDirection === 'IN' ? 'a' : 'de'
    const confirmMsg = `¿Deseas ${verb} ${adjustQtyNum} ${adjustModal.unit} ${prep} "${adjustModal.name}"?`
    if (!(await confirmDialog(confirmMsg, { confirmText: 'Confirmar', danger: adjustDirection === 'OUT' }))) return
    setLoading(true)
    try {
      const res = await adjustStock(adjustModal.id, { quantity: adjustSignedQty, reason: adjustReason })
      const updated = res.data.data
      setAdjustModal(null)
      setAdjustQty('')
      setAdjustReason('')
      reloadAll()
      notify(
        adjustDirection === 'IN'
          ? `${adjustQtyNum} ${adjustModal.unit} agregada(s) a "${adjustModal.name}"`
          : `${adjustQtyNum} ${adjustModal.unit} descontada(s) de "${adjustModal.name}"`,
        'success'
      )
      if (updated && updated.stock <= updated.minStock) {
        setAdjustNotice(`⚠️ "${updated.name}" ya está en su nivel mínimo de stock (${updated.stock} ${updated.unit} disponibles)`)
      }
    } catch (err) {
      const data = err.response?.data?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setAdjustFieldErrors(data)
      } else {
        setAdjustFieldErrors({})
      }
      notify(err.response?.data?.message ?? 'Error al ajustar el stock', 'error')
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
    try {
      await deleteProduct(p.id)
      reloadAll()
      notify(`"${p.name}" desactivado correctamente`, 'success')
    } catch (err) {
      notify(err.response?.data?.message ?? 'Error al desactivar el producto', 'error')
    }
  }

  /** Marca/desmarca el checkbox de una fila de la tabla. */
  function toggleSelect(productId) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  /** Marca todas las filas de la página actual si no están todas ya marcadas; si ya lo estaban, las desmarca. */
  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))))
  }

  /**
   * Base común de los payloads de actualización en lote: todos los campos del producto tal
   * como ya están, para que el PUT de edición (que exige el payload completo, no solo lo
   * que cambia) no borre por accidente algo que esta acción en particular no pretendía
   * tocar — ej. sin esto, "Agregar a apartados" en lote borraría el descuento de oferta
   * que un producto ya tuviera, al no reenviarlo.
   */
  function baseBulkPayload(p) {
    return {
      name: p.name, description: p.description, barcode: p.barcode,
      price: p.price, cost: p.cost, minStock: p.minStock, unit: p.unit,
      categoryId: p.category?.id, isReservable: p.isReservable, apartadoDiscountPercent: p.apartadoDiscountPercent,
    }
  }

  /**
   * Marca o quita "reservable" (aparece en la tienda pública de apartados) para todos los
   * productos seleccionados de un jalón — sin esto, habilitar un catálogo ya existente
   * significaba entrar producto por producto.
   */
  async function handleBulkReservable(value) {
    const targets = products.filter((p) => selectedIds.has(p.id))
    if (targets.length === 0) return
    const verb = value ? 'agregar a' : 'quitar de'
    if (!(await confirmDialog(`¿Deseas ${verb} la tienda pública de apartados ${targets.length} producto${targets.length === 1 ? '' : 's'}?`, { confirmText: 'Confirmar', danger: false }))) return
    setBulkUpdating(true)
    try {
      await Promise.all(targets.map((p) => updateProduct(p.id, { ...baseBulkPayload(p), isReservable: value })))
      notify(`${targets.length} producto${targets.length === 1 ? '' : 's'} actualizado${targets.length === 1 ? '' : 's'}`, 'success')
      setSelectedIds(new Set())
      reloadAll()
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo actualizar en lote', 'error')
    } finally {
      setBulkUpdating(false)
    }
  }

  /**
   * Aplica (o quita, con `percent=null`) el mismo descuento de oferta pública a todos los
   * productos seleccionados — para no tener que escribirlo producto por producto cuando
   * varios comparten la misma promoción.
   */
  async function handleBulkDiscount(percent) {
    const targets = products.filter((p) => selectedIds.has(p.id))
    if (targets.length === 0) return
    setBulkUpdating(true)
    try {
      await Promise.all(targets.map((p) => updateProduct(p.id, { ...baseBulkPayload(p), apartadoDiscountPercent: percent })))
      notify(`Descuento actualizado en ${targets.length} producto${targets.length === 1 ? '' : 's'}`, 'success')
      setSelectedIds(new Set())
      reloadAll()
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo aplicar el descuento en lote', 'error')
    } finally {
      setBulkUpdating(false)
    }
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

      {/* Escaneo de código de barras: alta/ajuste rápido, independiente del filtro de abajo.
          Mismo fondo blanco que el buscador de abajo (antes tenía un tinte del color de
          marca, pero con colores de marca oscuros/apagados el texto quedaba ilegible —
          ver feedback del usuario). */}
      <div className="relative mb-4 max-w-md">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">📷</span>
        <input
          ref={scanInputRef}
          className="input pl-9 py-1.5"
          placeholder="Escanear código de barras (alta / ajuste rápido)"
          value={scanCode}
          onChange={(e) => setScanCode(e.target.value)}
          onKeyDown={handleScanKeyDown}
        />
      </div>

      {/* Filters — flex-wrap, con "Limpiar filtros" al final (mismo patrón que Sales.jsx/
          CashCuts.jsx/Users.jsx/Apartados.jsx): solo aparece si hay algo que limpiar. */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input className="input flex-1 min-w-[220px]" placeholder="Buscar por nombre o código..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }} />
        <select className="input w-52" value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(0) }}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          type="button"
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            lowStockOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          onClick={() => { setLowStockOnly((v) => !v); setPage(0) }}
        >
          ⚠️ Stock bajo
        </button>
        <button
          type="button"
          className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          onClick={() => setShowSiblingStock(true)}
          title="Ver si una sucursal de tu mismo grupo tiene existencias de un producto"
        >
          🏬 Buscar en tiendas asociadas
        </button>
        {(search || filterCat || lowStockOnly) && (
          <button
            type="button" className="btn-secondary text-sm"
            onClick={() => { setSearch(''); setFilterCat(''); setLowStockOnly(false); setPage(0) }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isAdmin && selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 bg-purple-50">
            <span className="text-xs text-gray-600">{selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50"
                disabled={bulkUpdating}
                onClick={() => handleBulkReservable(true)}
              >
                📷 Agregar a apartados
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-purple-600 text-purple-600 hover:bg-purple-100 transition-colors disabled:opacity-50"
                disabled={bulkUpdating}
                onClick={() => handleBulkReservable(false)}
              >
                Quitar de apartados
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-purple-600 text-purple-600 hover:bg-purple-100 transition-colors disabled:opacity-50"
                disabled={bulkUpdating}
                onClick={() => { setBulkDiscountValue(''); setBulkDiscountModal(true) }}
              >
                💸 Aplicar descuento
              </button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            {/* Fila de agrupación: marca "En línea"/"Descuento"/"Apartados" como el bloque
                de datos de la tienda pública de apartados, para diferenciarlas a simple
                vista del resto (que son datos de mostrador/inventario normal). */}
            <tr>
              <th colSpan={(isAdmin ? 1 : 0) + 6} className="bg-gray-50"></th>
              <th colSpan={3} className="text-center px-2 py-1 text-[11px] font-semibold text-purple-700 bg-purple-50 border-l-2 border-purple-200">
                🛍️ Tienda en línea de apartados
              </th>
              <th className="bg-gray-50"></th>
            </tr>
            <tr>
              {isAdmin && (
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={products.length > 0 && selectedIds.size === products.length} onChange={toggleSelectAll} aria-label="Seleccionar todos" />
                </th>
              )}
              {['Producto', 'Categoría', 'Código', 'Precio', 'Stock', 'Mín.'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
              <th className="text-left px-2 py-3 w-20 font-medium text-purple-700 bg-purple-50/60 border-l-2 border-purple-200">En línea</th>
              <th className="text-left px-2 py-3 w-20 font-medium text-purple-700 bg-purple-50/60">Descuento</th>
              <th className="text-left px-4 py-3 font-medium text-purple-700 bg-purple-50/60">Apartados</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products.map((p) => (
              <tr key={p.id} className={`hover:bg-gray-50 ${selectedIds.has(p.id) ? 'bg-purple-50/50' : ''}`}>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} aria-label={`Seleccionar ${p.name}`} />
                  </td>
                )}
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
                <td className="px-2 py-3 bg-purple-50/30 border-l-2 border-purple-100">
                  {p.isReservable
                    ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">📷 Sí</span>
                    : <span className="text-xs text-gray-300">No</span>}
                </td>
                <td className="px-2 py-3 bg-purple-50/30">
                  {p.apartadoDiscountPercent > 0
                    ? <span className="text-xs font-semibold text-red-600">-{Number(p.apartadoDiscountPercent)}%</span>
                    : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 bg-purple-50/30">
                  {reservedStats.get(p.id) > 0
                    ? <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">{reservedStats.get(p.id)} {p.unit}</span>
                    : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    {isAdmin && (
                      <button className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(p)}>Editar</button>
                    )}
                    <button className="text-purple-600 hover:underline text-xs" onClick={() => openAdjust(p)}>Ajustar</button>
                    {isAdmin && (
                      <button className="text-red-500 hover:underline text-xs" onClick={() => handleDelete(p)}>Desact.</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={isAdmin ? 11 : 10} className="px-4 py-8 text-center text-gray-400">{tableLoading ? 'Cargando...' : 'Sin productos'}</td></tr>
            )}
          </tbody>
        </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <span>Mostrar</span>
            <select
              className="input !w-auto py-1"
              value={size}
              onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>por página · {totalElements === 0 ? 'sin resultados' : `${rangeFrom}–${rangeTo} de ${totalElements}`}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ‹ Anterior
            </button>
            <span className="text-gray-500 text-xs">Página {totalPages === 0 ? 0 : page + 1} de {totalPages}</span>
            <button
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente ›
            </button>
          </div>
        </div>
      </div>

      {/* Product modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editProduct ? 'Editar producto' : 'Nuevo producto'}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Sin `required` nativo en Nombre/Precio/Categoría a propósito (ver
                    validateProductForm): el globo del navegador se disparaba antes de que
                    este formulario corriera, tapando nuestro propio manejo de errores. */}
                <div><label className="text-xs font-medium text-gray-600">Nombre <span className={fieldErrors.name ? 'text-red-600' : ''}>*</span></label>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  {fieldErrors.name && <p className="text-red-600 text-xs mt-1">{fieldErrors.name}</p>}</div>
                <div><label className="text-xs font-medium text-gray-600">Código de barras</label>
                  <input className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                  {fieldErrors.barcode && <p className="text-red-600 text-xs mt-1">{fieldErrors.barcode}</p>}</div>
                <div><label className="text-xs font-medium text-gray-600">Precio venta <span className={fieldErrors.price ? 'text-red-600' : ''}>*</span></label>
                  <input className="input" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                  {fieldErrors.price && <p className="text-red-600 text-xs mt-1">{fieldErrors.price}</p>}</div>
                <div><label className="text-xs font-medium text-gray-600">Costo</label>
                  <input className="input" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                  {fieldErrors.cost && <p className="text-red-600 text-xs mt-1">{fieldErrors.cost}</p>}</div>
                <div><label className="text-xs font-medium text-gray-600">Stock inicial</label>
                  <input className="input" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                  {fieldErrors.stock && <p className="text-red-600 text-xs mt-1">{fieldErrors.stock}</p>}</div>
                <div><label className="text-xs font-medium text-gray-600">Stock mínimo</label>
                  <input className="input" type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
                  {fieldErrors.minStock && <p className="text-red-600 text-xs mt-1">{fieldErrors.minStock}</p>}</div>
                <div><label className="text-xs font-medium text-gray-600">Unidad</label>
                  <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                  {fieldErrors.unit && <p className="text-red-600 text-xs mt-1">{fieldErrors.unit}</p>}</div>
                <div><label className="text-xs font-medium text-gray-600">Categoría <span className={fieldErrors.categoryId ? 'text-red-600' : ''}>*</span></label>
                  <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value={NEW_CATEGORY_VALUE}>Otra...</option>
                  </select>
                  {fieldErrors.categoryId && <p className="text-red-600 text-xs mt-1">{fieldErrors.categoryId}</p>}
                </div>
                {form.categoryId === NEW_CATEGORY_VALUE && (
                  <div><label className="text-xs font-medium text-gray-600">Nombre de la nueva categoría <span className={fieldErrors.newCategoryName ? 'text-red-600' : ''}>*</span></label>
                    <input className="input" autoFocus value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Ej. Electrónica" />
                    {fieldErrors.newCategoryName && <p className="text-red-600 text-xs mt-1">{fieldErrors.newCategoryName}</p>}</div>
                )}
              </div>
              <div><label className="text-xs font-medium text-gray-600">Descripción</label>
                <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                {fieldErrors.description && <p className="text-red-600 text-xs mt-1">{fieldErrors.description}</p>}</div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isReservable}
                  onChange={(e) => setForm({ ...form, isReservable: e.target.checked })}
                />
                <span className="text-sm text-gray-700">📷 Mostrar en la tienda pública de apartados</span>
              </label>

              {form.isReservable && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Descuento de oferta (%) — se le muestra al cliente</label>
                  {/* Sin min/max nativos a propósito: el navegador los valida con su propio
                      globo emergente ANTES de que este formulario alcance a correr — con
                      eso, el rango 0-100 lo reporta el backend (@DecimalMin/@DecimalMax en
                      ProductRequest) y se muestra igual que cualquier otro error, como texto
                      debajo del campo (fieldErrors.apartadoDiscountPercent de abajo). */}
                  <input
                    className="input sm:max-w-[160px]" type="number" step="1"
                    placeholder="Sin oferta"
                    value={form.apartadoDiscountPercent}
                    onChange={(e) => setForm({ ...form, apartadoDiscountPercent: e.target.value })}
                  />
                  {fieldErrors.apartadoDiscountPercent && <p className="text-red-600 text-xs mt-1">{fieldErrors.apartadoDiscountPercent}</p>}
                </div>
              )}

              <div className="border-t border-gray-100 pt-3">
                <label className="text-xs font-medium text-gray-600 block mb-2">Fotos</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editProduct ? (
                    <>
                      {productImages.map((img) => (
                        <div key={img.id} className="relative group">
                          <img
                            src={resolveMediaUrl(img.path)} alt=""
                            className={`w-16 h-16 object-cover rounded-lg border-2 ${img.isPrimary ? 'border-purple-500' : 'border-gray-200'}`}
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                            {!img.isPrimary && (
                              <button type="button" title="Hacer portada" className="text-white text-xs" onClick={() => handleSetPrimaryImage(img.id)}>⭐</button>
                            )}
                            <button type="button" title="Quitar" className="text-white text-xs" onClick={() => handleDeleteImage(img.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                      <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer text-gray-400 hover:border-purple-400 hover:text-purple-500 text-xs text-center">
                        {uploadingImage ? '...' : '+ Foto'}
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUploadImage} disabled={uploadingImage} />
                      </label>
                    </>
                  ) : (
                    <>
                      {/* Producto nuevo: todavía no hay id al que subir nada, solo se guardan
                          en memoria (`pendingImages`) — la subida real pasa en `handleSave`,
                          justo después de crear el producto. */}
                      {pendingImages.map((img, idx) => (
                        <div key={img.previewUrl} className="relative group">
                          <img src={img.previewUrl} alt="" className={`w-16 h-16 object-cover rounded-lg border-2 ${idx === 0 ? 'border-purple-500' : 'border-gray-200'}`} />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <button type="button" title="Quitar" className="text-white text-xs" onClick={() => handleRemovePendingImage(idx)}>✕</button>
                          </div>
                        </div>
                      ))}
                      <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer text-gray-400 hover:border-purple-400 hover:text-purple-500 text-xs text-center">
                        + Foto
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleStageImage} />
                      </label>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-400">La primera foto (borde morado) es la portada del catálogo público.</p>
                <p className="text-xs text-gray-400">PNG, JPG o WEBP, máximo {MAX_IMAGE_MB} MB por foto.</p>
              </div>

              {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</p>}
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Choice modal: tras un escaneo de un código ya existente, pregunta qué hacer (solo ADMIN llega aquí) */}
      {choiceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setChoiceModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Producto encontrado</h3>
            <p className="text-sm text-gray-500 mb-4">{choiceModal.name} — código {choiceModal.barcode}</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { const p = choiceModal; setChoiceModal(null); openEdit(p) }}
              >✏️ Editar producto</button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => { const p = choiceModal; setChoiceModal(null); openAdjust(p) }}
              >➕ Ajustar stock</button>
            </div>
            <button type="button" className="text-sm text-gray-400 hover:text-gray-600 mt-4 w-full text-center" onClick={() => setChoiceModal(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Adjust modal */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setAdjustModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Ajustar stock</h3>
            <p className="text-sm text-gray-500 mb-4">{adjustModal.name} — actual: {adjustModal.stock} {adjustModal.unit} · mínimo: {adjustModal.minStock} {adjustModal.unit}</p>
            <form onSubmit={handleAdjust} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">¿Qué quieres hacer? *</label>
                <div className={`grid gap-2 ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <button type="button"
                    className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      adjustDirection === 'IN' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => { setAdjustDirection('IN'); setAdjustFieldErrors({}) }}
                  >➕ Agregar piezas</button>
                  {isAdmin && (
                    <button type="button"
                      className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        adjustDirection === 'OUT' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                      onClick={() => { setAdjustDirection('OUT'); setAdjustFieldErrors({}) }}
                    >➖ Quitar piezas</button>
                  )}
                </div>
              </div>
              {/* Sin `min`/`required` nativos a propósito (ver handleAdjust): el globo del
                  navegador se disparaba antes de que este formulario corriera. */}
              <div>
                <label className="text-xs font-medium text-gray-600">Cantidad de piezas <span className={adjustFieldErrors.quantity ? 'text-red-600' : ''}>*</span></label>
                <div className="flex items-center gap-2">
                  <button type="button" className="w-9 h-9 rounded border text-gray-600 hover:bg-gray-100 text-lg leading-none"
                    onClick={() => setAdjustQty((q) => String(Math.max(0, (Number(q) || 0) - 1)))}>−</button>
                  {/* type="text" a propósito, no "number": un <input type="number"> deja
                      teclear "e" (notación científica, ej. "1e10") y la normaliza sola —
                      con solo dígitos (inputMode numérico para el teclado del celular) eso
                      ya no puede pasar. */}
                  <input className="input text-center" type="text" inputMode="numeric" value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value.replace(/[^0-9]/g, ''))} />
                  <button type="button" className="w-9 h-9 rounded border text-gray-600 hover:bg-gray-100 text-lg leading-none"
                    onClick={() => setAdjustQty((q) => String((Number(q) || 0) + 1))}>+</button>
                </div>
                {adjustFieldErrors.quantity && <p className="text-red-600 text-xs mt-1">{adjustFieldErrors.quantity}</p>}
              </div>
              {adjustQtyNum > 0 && (
                <div className={`text-sm rounded-lg px-3 py-2 ${(adjustPreviewStock < 0 || adjustPreviewExceedsLimit) ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
                  {adjustPreviewExceedsLimit ? (
                    'El número es excesivamente grande — el máximo permitido es 2,147,483,647'
                  ) : (
                    <>
                      Nuevo stock: <span className="font-bold">{adjustPreviewStock}</span> {adjustModal.unit}
                      {adjustPreviewStock < 0 && ' — no puede ser negativo'}
                    </>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600">Motivo</label>
                <input className="input" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Compra, merma, corrección..." />
                {adjustFieldErrors.reason && <p className="text-red-600 text-xs mt-1">{adjustFieldErrors.reason}</p>}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setAdjustModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={loading || adjustQtyNum === 0 || adjustPreviewStock < 0 || adjustPreviewExceedsLimit}>
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk discount modal */}
      {bulkDiscountModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setBulkDiscountModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Aplicar descuento de oferta</h3>
            <p className="text-sm text-gray-500 mb-4">
              A {selectedIds.size} producto{selectedIds.size === 1 ? '' : 's'} seleccionado{selectedIds.size === 1 ? '' : 's'} — se le muestra al cliente en la tienda pública.
            </p>
            <label className="text-xs font-medium text-gray-600">Descuento (%)</label>
            <input
              className="input" type="number" min="0" max="100" step="1" autoFocus placeholder="Ej. 15"
              value={bulkDiscountValue}
              onChange={(e) => setBulkDiscountValue(e.target.value)}
            />
            <div className="flex gap-2 justify-end pt-4">
              <button type="button" className="btn-secondary" onClick={() => setBulkDiscountModal(false)}>Cancelar</button>
              <button
                type="button" className="text-xs font-semibold text-red-600 hover:underline mr-auto"
                onClick={async () => { await handleBulkDiscount(null); setBulkDiscountModal(false) }}
              >
                Quitar descuento
              </button>
              <button
                type="button" className="btn-primary" disabled={bulkDiscountValue === ''}
                onClick={async () => { await handleBulkDiscount(Number(bulkDiscountValue)); setBulkDiscountModal(false) }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {showSiblingStock && <SiblingStockModal onClose={() => setShowSiblingStock(false)} />}
    </div>
  )
}

/**
 * Modal "Buscar en tiendas asociadas": consulta de solo lectura de stock disponible en las
 * sucursales que comparten el mismo Supervisor de tiendas que la del usuario en sesión (ver
 * `getSiblingStock`/`TiendaRepository#findSiblingTiendas` en el backend) — nunca la propia
 * tienda, esa ya se ve en la tabla principal de Inventario.
 *
 * Visible para cualquier rol con acceso a esta pantalla, no solo ADMIN: un cajero o
 * vendedor también necesita poder decirle a un cliente "no lo tenemos aquí, pero sí en la
 * sucursal X" sin que eso le dé acceso a nada más de esa otra tienda. Si la tienda del
 * usuario no tiene un Supervisor asignado (o no tiene sucursales hermanas), el backend
 * regresa una página vacía en vez de un error — se muestra igual que "sin resultados".
 */
function SiblingStockModal({ onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  // Debounce de 350ms (un poco más largo que el resto de buscadores de la app porque este
  // le pega a varias tiendas a la vez) — no busca nada con menos de 2 caracteres, para no
  // pegarle a la API con cada letra de una búsqueda que apenas empieza.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    const t = setTimeout(() => {
      getSiblingStock({ q: q.trim(), size: 50 })
        .then((r) => setResults(r.data.data?.content ?? []))
        .finally(() => { setLoading(false); setSearched(true) })
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">🏬 Buscar en tiendas asociadas</h3>
        <p className="text-sm text-gray-500 mb-4">
          Busca un producto por nombre o código para ver si hay existencias en otras sucursales de tu mismo grupo.
        </p>
        <input
          className="input" autoFocus placeholder="Nombre o código del producto..."
          value={q} onChange={(e) => setQ(e.target.value)}
        />

        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Buscando...</p>
          ) : !searched ? (
            <p className="text-sm text-gray-400 text-center py-6">Escribe al menos 2 letras para buscar.</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Sin resultados en tiendas asociadas — puede que ninguna tenga existencias de eso, o que tu tienda no tenga sucursales asociadas todavía.
            </p>
          ) : (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {results.map((p) => (
                <div key={`${p.tienda?.id}-${p.id}`} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">🏬 {p.tienda?.name ?? '—'}</p>
                  </div>
                  <span className="text-green-600 font-semibold text-sm shrink-0 ml-3">{p.stock} {p.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
