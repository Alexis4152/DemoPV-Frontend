import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getProductsPage, createProduct, updateProduct, adjustStock, deleteProduct, searchProducts, getProductByBarcode, getProductSalesStats } from '../api/products'
import { getCategories, createCategory } from '../api/categories'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

const emptyForm = { name: '', description: '', barcode: '', price: '', cost: '', stock: '', minStock: 5, unit: 'pieza', categoryId: '' }
const PAGE_SIZES = [10, 20, 50, 100]

const AVAILABILITY_VALUES = ['lowStock', 'neverSold', 'topSellers']

// 'all' | 'lowStock' | 'neverSold' | 'topSellers' -> los params que espera GET /products/page.
function availabilityParams(availability) {
  if (availability === 'lowStock') return { lowStock: true }
  if (availability === 'neverSold') return { sold: 'NEVER_SOLD' }
  if (availability === 'topSellers') return { sold: 'TOP_SELLERS' }
  return {}
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
 * búsqueda de texto, el filtro de categoría, el de stock bajo y el de historial de ventas
 * ("sin ventas"/"más vendidos") todo en el servidor, para que esta pantalla siga
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
  // 'all' | 'lowStock' | 'neverSold' | 'topSellers' — se traduce a query params vía
  // `availabilityParams` y el filtro/orden lo resuelve el backend, no esta pantalla.
  const [availability, setAvailability] = useState(() => {
    const fromUrl = searchParams.get('availability')
    return AVAILABILITY_VALUES.includes(fromUrl) ? fromUrl : 'all'
  })
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  // Map productId -> unidades vendidas históricas (todas las ventas completadas, sin
  // acotar por fecha), solo para mostrar la columna "Vendidos" — el filtrado real por
  // ventas ya lo hace el backend (ver `availabilityParams`). Cubre TODO el catálogo (no
  // solo la página actual) porque es un query agregado ligero (2 columnas), no el
  // catálogo completo con todos sus campos.
  const [salesStats, setSalesStats] = useState(new Map())
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [adjustModal, setAdjustModal] = useState(null)
  const [adjustDirection, setAdjustDirection] = useState('IN')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [loading, setLoading] = useState(false)
  // Carga de la tabla paginada (loadPage), separado de `loading` (que es del formulario de
  // guardar/ajustar) para que un refresco en segundo plano de la tabla no deshabilite ni
  // cambie el texto del botón "Guardar"/"Confirmar" de un modal abierto al mismo tiempo.
  const [tableLoading, setTableLoading] = useState(true)
  const [error, setError] = useState('')
  const [lowStockItems, setLowStockItems] = useState([])
  const [adjustNotice, setAdjustNotice] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [choiceModal, setChoiceModal] = useState(null)
  const [newCategoryName, setNewCategoryName] = useState('')
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
    getProductsPage({
      q: search.trim() || undefined,
      categoryId: filterCat || undefined,
      ...availabilityParams(availability),
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
  }, [search, filterCat, availability, page, size])

  /**
   * Recarga las fuentes de datos "auxiliares" que no dependen de la página/filtro actual:
   * las categorías (para el filtro y el formulario), la lista de productos en stock
   * mínimo o por debajo (`lowStock: true`, hasta 200) que alimenta el aviso amarillo
   * persistente, y el total histórico vendido por producto (columna "Vendidos" — ver
   * `salesStats`). Se llama al montar y después de cualquier operación que pueda cambiar
   * existencias o catálogo (guardar producto, ajustar stock, desactivar producto), junto
   * con `loadPage()` para refrescar también la tabla.
   */
  function loadAux() {
    getCategories().then((r) => setCategories(r.data.data ?? []))
    searchProducts({ lowStock: true, size: 200 }).then((r) => setLowStockItems(r.data.data ?? []))
    getProductSalesStats().then((r) => setSalesStats(new Map((r.data.data ?? []).map(([id, qty]) => [id, Number(qty)]))))
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
   * precarga en el formulario para no tener que volver a teclearlo.
   */
  function openNew(prefillBarcode) {
    setEditProduct(null)
    setForm({ ...emptyForm, barcode: prefillBarcode ?? '' })
    setNewCategoryName('')
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
    setNewCategoryName('')
    setError('')
    setShowModal(true)
  }

  /** Abre el modal de "Ajustar stock" para `p` en modo "Agregar piezas" (el modo por default tras un escaneo). */
  function openAdjust(p) {
    setAdjustModal(p)
    setAdjustDirection('IN')
    setAdjustQty('')
    setAdjustReason('')
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

  // Cierra con ESC el modal que esté abierto (producto, ajuste o elección), descartando
  // lo capturado — mismo comportamiento que el botón "Cancelar" de cada uno.
  useEffect(() => {
    if (!showModal && !adjustModal && !choiceModal) return
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (showModal) setShowModal(false)
      else if (adjustModal) setAdjustModal(null)
      else if (choiceModal) setChoiceModal(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showModal, adjustModal, choiceModal])

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
   * altas/ediciones accidentales por un clic de más.
   */
  async function handleSave(e) {
    e.preventDefault()
    const confirmMsg = editProduct
      ? `¿Deseas guardar los cambios de "${form.name}"?`
      : `¿Deseas agregar el producto "${form.name}"?`
    if (!(await confirmDialog(confirmMsg, { confirmText: editProduct ? 'Guardar cambios' : 'Agregar', danger: false }))) return
    setLoading(true)
    setError('')
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
        stock: Number(form.stock), minStock: Number(form.minStock), categoryId: Number(categoryId) }
      if (editProduct) await updateProduct(editProduct.id, payload)
      else await createProduct(payload)
      setShowModal(false)
      reloadAll()
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
   *
   * Pide confirmación explícita antes de tocar el backend, con el verbo (agregar/quitar)
   * y la cantidad ya resueltos según `adjustDirection`.
   */
  async function handleAdjust(e) {
    e.preventDefault()
    if (adjustSignedQty === 0) return
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
    reloadAll()
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <input className="input" placeholder="Buscar por nombre o código..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }} />
        <select className="input" value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(0) }}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" value={availability} onChange={(e) => { setAvailability(e.target.value); setPage(0) }}>
          <option value="all">Todos los productos</option>
          <option value="lowStock">⚠️ Stock bajo</option>
          <option value="neverSold">🚫 Sin ventas</option>
          <option value="topSellers">🔥 Más vendidos</option>
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Producto', 'Categoría', 'Código', 'Precio', 'Stock', 'Mín.', 'Vendidos', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products.map((p) => (
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
                <td className="px-4 py-3 text-gray-500">
                  {salesStats.has(p.id) ? (salesStats.get(p.id) || <span className="text-gray-300 italic">Sin ventas</span>) : '—'}
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
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">{tableLoading ? 'Cargando...' : 'Sin productos'}</td></tr>
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
                    <option value={NEW_CATEGORY_VALUE}>Otra...</option>
                  </select></div>
                {form.categoryId === NEW_CATEGORY_VALUE && (
                  <div><label className="text-xs font-medium text-gray-600">Nombre de la nueva categoría *</label>
                    <input className="input" required autoFocus value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Ej. Electrónica" /></div>
                )}
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
