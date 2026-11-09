import { Fragment, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getApartados, getApartado, confirmApartado, completeApartado, deliverApartado, addApartadoInstallment, cancelApartado, removeApartadoItem, getApartadoReviewCount } from '../api/apartados'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import { printSaleTicket, openCashDrawer } from '../utils/printer'
import useEscapeClose from '../hooks/useEscapeClose'
import usePolling from '../hooks/usePolling'
import IconButton from '../components/IconButton'
import { CheckCircleIcon, CreditCardIcon, XCircleIcon, PrinterIcon, DollarIcon, UndoIcon, ClipboardListIcon, ShirtIcon, CheckIcon, PlusIcon, EyeIcon } from '../components/icons'
import RowMenu from '../components/RowMenu'
import ApartadoTicketModal, { apartadoTickets } from './ApartadoTicketModal'
import ApartadoStockReviewModal from './ApartadoStockReviewModal'
import ApartadoRefundModal from './ApartadoRefundModal'
import ApartadoPayments, { prefetchApartadoPayments } from './ApartadoPayments'
import ApartadoItems from './ApartadoItems'
import ItemOutcomePicker, { anyNotRestocked, outcomesPayload } from '../components/ItemOutcomePicker'
import ModalCloseButton from '../components/ModalCloseButton'
import ReturnReasonPicker, { retainedAmount } from '../components/ReturnReasonPicker'
import { isManagement } from '../utils/roleLabels'
import useTableSort from '../hooks/useTableSort'
import SortableTh from '../components/SortableTh'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'

// Fecha de entrega de un anticipo ("2026-10-27", sin hora). Se arma como fecha LOCAL: con
// new Date("2026-10-27") el navegador la toma en UTC y en México se vería un día antes.
function parseLocalDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDeliveryDate(isoDate) {
  return parseLocalDate(isoDate).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

/** Días que faltan para la entrega (0 = hoy, negativo = ya pasó). */
function daysUntil(isoDate) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parseLocalDate(isoDate) - today) / 86400000)
}

/**
 * Aviso de entrega de un anticipo activo: desde un día antes se marca "Próximo a entregar";
 * el mismo día, "Entrega hoy"; si ya pasó la fecha, "Atrasado".
 */
function deliveryBadge(isoDate) {
  const days = daysUntil(isoDate)
  const [label, cls] = days < 0 ? ['⚠️ Atrasado', 'bg-red-100 text-red-700']
    : days === 0 ? ['📦 Entrega hoy', 'bg-orange-100 text-orange-700']
    : days === 1 ? ['⏰ Próximo a entregar', 'bg-amber-100 text-amber-800']
    : [null, null]
  if (!label) return null
  return <span className={`block w-fit mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>
}
// Mismo patrón que Users.jsx/POS.jsx para validar formato de correo del lado del cliente.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Apartado de anticipo activo con su venta de anticipo cobrada: al cancelarlo hay que decidir
// si el anticipo se le devuelve al cliente o se lo queda la tienda (ver ApartadoService#cancel).
const hasPaidDeposit = (a) => a?.origin === 'DEPOSIT' && a?.status === 'ACTIVE' && !!a?.depositSaleId
// Líneas de un apartado ACTIVO con inventario que regresar (un pendiente nunca descontó stock;
// lo "por pedido" tampoco), en la forma que usa ItemOutcomePicker.
const stockItemsOf = (a) => a?.status !== 'ACTIVE' ? []
  : (a.items ?? []).filter((i) => i.product && !i.product.isMadeToOrder && !i.onOrder).map((i) => ({ id: i.id, name: i.productName, quantity: i.quantity }))

const STATUS_LABELS = {
  PENDING: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  ACTIVE: { label: 'Activo', color: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Completado', color: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelado', color: 'bg-gray-100 text-gray-600' },
  EXPIRED: { label: 'Vencido', color: 'bg-red-100 text-red-700' },
}
// Pagado completo en el primer pago y todavía sin recoger (ver ApartadoService#deliver).
const PENDING_DELIVERY = { label: 'Pagado · por entregar', color: 'bg-teal-100 text-teal-800' }
const PAGE_SIZES = [10, 20, 50]

/**
 * Productos que se entregan al liquidar o completar (todos): lo ya descontado y lo por pedido
 * aparecen con ✓ y su leyenda; lo sobre pedido trae casilla para indicar si sale del inventario.
 */
function OnOrderDeductList({ items, selected, onChange, hint, online }) {
  const list = items ?? []
  if (list.length === 0) return null
  const hasOnOrder = list.some((i) => i.onOrder)
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">Productos que se entregan</p>
      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
        {list.map((i) => {
          if (!i.onOrder) {
            return (
              <div key={i.id} className="flex gap-3 items-start p-2 border border-gray-100 bg-gray-50 rounded-lg">
                <span className="mt-0.5 text-green-600" aria-hidden="true">✓</span>
                <span className="text-sm text-gray-600 [overflow-wrap:anywhere]">
                  {i.productName} · {Number(i.quantity)} pza.
                  <span className="block text-xs text-gray-500">
                    {!i.product ? 'Sin inventario'
                      : i.product.isMadeToOrder ? 'Por pedido: no maneja inventario'
                      : online ? 'Ya salió del inventario al confirmar'
                      : 'Ya salió del inventario al registrar el anticipo'}
                  </span>
                </span>
              </div>
            )
          }
          const stock = Number(i.product?.stock ?? 0)
          const short = stock < Number(i.quantity)
          return (
            <label key={i.id} className={`flex gap-3 items-start p-2 border border-gray-200 rounded-lg ${short ? 'opacity-60' : 'cursor-pointer'}`}>
              <input
                type="checkbox" className="mt-0.5 w-4 h-4" disabled={short} checked={selected.includes(i.id)}
                onChange={(e) => onChange((prev) => (e.target.checked ? [...prev, i.id] : prev.filter((x) => x !== i.id)))}
              />
              <span className="text-sm [overflow-wrap:anywhere]">
                {i.productName} · {Number(i.quantity)} pza.
                <span className="block text-xs text-gray-500">
                  Sobre pedido · {short ? `sin piezas suficientes para descontar (hay ${stock})` : `marca para descontar del inventario (hay ${stock})`}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      {hasOnOrder && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}
const STATUS_VALUES = Object.keys(STATUS_LABELS)

/**
 * Lo sobre pedido que alcanza a salir del inventario: viene marcado por omisión en Entregar y
 * en Cobrar, para que no se olvide descontarlo (para no descontar, se desmarca). Si varios
 * renglones son del mismo producto, el stock se va repartiendo entre ellos.
 */
function deductableOnOrder(items) {
  const left = {}
  return items.filter((i) => {
    if (!i.onOrder || !i.product) return false
    const id = i.product.id
    if (left[id] == null) left[id] = Number(i.product.stock ?? 0)
    const qty = Number(i.quantity)
    if (left[id] < qty) return false
    left[id] -= qty
    return true
  }).map((i) => i.id)
}

/**
 * Página "Apartados": gestión de las reservas solicitadas desde la tienda pública
 * (`/apartar/{slug}`, ver `PublicApartar.jsx`). Cubre las tres acciones del ciclo de vida
 * que le tocan al cajero/admin (el resto — solicitar y vencer — los hacen el cliente
 * público y `ApartadoExpiryJob` respectivamente, no esta pantalla):
 *
 * - **Confirmar** (`PENDING → ACTIVE`): descuenta el stock y arranca el plazo de
 *   vigencia. Aquí es donde se puede aplicar un descuento por línea (nunca lo captura el
 *   cliente público), acotado por el límite de apartados de la tienda — mismo patrón que
 *   el límite de descuento de venta física en el POS, pero un tope SEPARADO
 *   (`tienda.maxApartadoDiscountAmount/Percent`).
 * - **Completar** (`ACTIVE → COMPLETED`): el cliente recogió y pagó — se genera una venta
 *   real (sin volver a descontar stock). El ticket es físico o digital, mismo patrón que
 *   POS.jsx: físico se imprime al vuelo por QZ Tray (ver `printTicket`), digital lo manda
 *   el backend por correo (exige capturar uno si el apartado no traía ya el del cliente).
 * - **Cancelar** (`PENDING`/`ACTIVE → CANCELLED`): si ya estaba confirmado, restituye el
 *   stock. Pide un motivo opcional para el cliente — si dejó correo al solicitar el
 *   apartado, se le avisa la cancelación con ese motivo (lo manda el backend).
 *
 * Mismo patrón de paginación server-side que Sales/CashCuts.
 *
 * Permite llegar con el filtro de estado ya aplicado desde afuera (ej. la tarjeta
 * "Apartados" del Dashboard enlaza a `/apartados?status=PENDING`) — se lee una sola vez
 * al montar, igual que `?availability=` en Inventory.jsx o `?from=&to=` en Sales.jsx.
 *
 * El filtro de texto (`search`) es libre: coincide con nombre/teléfono del cliente O el
 * nombre de cualquier producto del apartado (resuelto por el backend, ver
 * `ApartadoRepository#search`) — reemplaza al selector de producto que había antes, para
 * no obligar al cajero a saber de antemano si lo que recuerda es el cliente o el producto.
 */
export default function Apartados() {
  const { user, hasAction } = useAuth()
  const { notify, confirmDialog } = useNotify()
  const [searchParams] = useSearchParams()
  const tienda = user?.tienda
  const discountsDisabled = tienda?.maxApartadoDiscountAmount == null && tienda?.maxApartadoDiscountPercent == null

  const [status, setStatus] = useState(() => {
    const fromUrl = searchParams.get('status')
    return STATUS_VALUES.includes(fromUrl) ? fromUrl : ''
  })
  // "En línea" (solicitados desde la tienda pública, de siempre) vs "Con anticipo"
  // (registrados por un cajero en persona — ver POS.jsx "Registrar anticipo").
  const [origin, setOrigin] = useState('')
  // Solo los que tienen el inventario por revisar (vencidos o cancelados por el cliente).
  const [reviewOnly, setReviewOnly] = useState(false)
  const [reviewCount, setReviewCount] = useState(0)
  const [reviewModal, setReviewModal] = useState(null)
  // Llega de "apartado #N" en el historial de ventas (Sales.jsx), igual patrón que
  // `?status=` desde el Dashboard — filtro EXACTO por folio, no texto libre.
  const [folio, setFolio] = useState(() => {
    const fromUrl = Number(searchParams.get('folio'))
    return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : null
  })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  // Orden de la tabla por encabezado (se aplica en el servidor; ver useTableSort).
  const tableSort = useTableSort('sort:apartados')
  const onSort = (k) => { tableSort.toggle(k); setPage(0) }
  const [size, setSize] = useState(20)
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)

  const [confirmModal, setConfirmModal] = useState(null) // apartado en confirmación
  const [confirmHours, setConfirmHours] = useState(24)
  const [confirmDiscounts, setConfirmDiscounts] = useState({}) // itemId -> string
  // Errores de validación local del modal de confirmar: { durationHours: mensaje } y/o
  // { [itemId]: mensaje } por cada línea con descuento inválido — solo se llenan al dar
  // clic en Confirmar (mismo patrón que Usuarios/Inventario/Roles/Categorías).
  const [confirmFieldErrors, setConfirmFieldErrors] = useState({})

  const [completeModal, setCompleteModal] = useState(null) // apartado a completar
  const [deductItemIds, setDeductItemIds] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [amountReceived, setAmountReceived] = useState('')
  // Apartado con anticipo: 'full' liquida todo el saldo (completa el apartado);
  // 'installment' registra un abono por `installmentAmount` y el apartado sigue activo.
  const [chargeMode, setChargeMode] = useState('full')
  const [installmentAmount, setInstallmentAmount] = useState('')
  // 'physical': imprime en la impresora térmica al completar, igual que POS.jsx. 'digital':
  // no imprime nada, el backend manda el ticket en PDF por correo — exige capturar uno
  // (`completeEmail`) si el apartado no traía ya el del cliente.
  const [ticketType, setTicketType] = useState('physical')
  const [completeEmail, setCompleteEmail] = useState('')
  const [printing, setPrinting] = useState(false)

  const [cancelModal, setCancelModal] = useState(null) // apartado a cancelar
  const [refundModal, setRefundModal] = useState(null) // apartado completado a devolver
  const [deliverModal, setDeliverModal] = useState(null) // apartado pagado por entregar
  const [deliverNow, setDeliverNow] = useState([]) // renglones que se entregan en esta visita
  const [ticketModal, setTicketModal] = useState(null) // { apartado, mode: 'print' | 'view' }
  const [deliverIds, setDeliverIds] = useState([])
  const [delivering, setDelivering] = useState(false)
  // Apartados con su desglose de pagos abierto (subtabla bajo la fila).
  const [expanded, setExpanded] = useState(() => new Set())
  const togglePayments = (id) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  // Apartados con su subtabla de productos abierta.
  const [expandedItems, setExpandedItems] = useState(() => new Set())
  const toggleItems = (id) => setExpandedItems((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const [cancelReason, setCancelReason] = useState('')
  // Solo se llena al dar clic en "Cancelar apartado" (mismo patrón que Notas en
  // CashCuts.jsx) — el motivo no valida en vivo mientras se escribe.
  const [cancelReasonError, setCancelReasonError] = useState('')
  // Apartado con anticipo cobrado: qué pasa con el anticipo al cancelar (REFUNDED | RETAINED).
  const [depositAction, setDepositAction] = useState('')
  const [depositActionError, setDepositActionError] = useState('')
  // Qué pasó con cada producto al cancelar un apartado activo, y la nota interna (obligatoria
  // si alguno no regresa al inventario; no se le manda al cliente).
  const [cancelOutcomes, setCancelOutcomes] = useState({})
  const [stockNote, setStockNote] = useState('')
  const [stockNoteError, setStockNoteError] = useState('')

  // Cierra con ESC el modal que esté abierto (confirmar, completar o cancelar apartado),
  // descartando lo capturado — mismo efecto que "Cancelar"/"Cerrar" de cada uno.
  useEscapeClose(!!confirmModal, () => setConfirmModal(null))
  useEscapeClose(!!completeModal, () => setCompleteModal(null))
  useEscapeClose(!!deliverModal && !delivering, () => setDeliverModal(null))
  useEscapeClose(!!cancelModal, () => setCancelModal(null))

  function load() {
    setLoading(true)
    getApartados({ status: status || undefined, origin: origin || undefined, folio: folio || undefined, review: reviewOnly || undefined, from: from || undefined, to: to || undefined, q: search.trim() || undefined, ...tableSort.params, page, size })
      .then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
      .finally(() => setLoading(false))
    getApartadoReviewCount().then((r) => setReviewCount(Number(r.data.data ?? 0))).catch(() => {})
  }

  // Debounce de 250ms sobre el texto (mismo patrón que Inventory.jsx/POS.jsx), para no
  // pegarle a la API en cada tecla; estado/fechas/página disparan de inmediato.
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [status, origin, folio, reviewOnly, from, to, search, page, size, tableSort.sort])

  // Refresca solo, cada Tienda.pollingIntervalSeconds (ajustable en "Datos de la
  // tienda"), y también al recuperar el foco de la pestaña — así un apartado nuevo o
  // uno que otro cajero ya atendió aparece sin que nadie tenga que recargar la página.
  usePolling(load, tienda?.pollingIntervalSeconds)

  const apartados = pageData.content ?? []
  const totalPages = pageData.totalPages ?? 0
  const totalElements = pageData.totalElements ?? 0

  /** Abre el modal de confirmación, precargando las horas por default de la tienda y descuentos en 0. */
  /**
   * Precarga cada línea con el descuento que YA trae (nunca en $0 a fuerzas): si el
   * producto tenía una oferta pública activa cuando se apartó, ese descuento ya viene
   * calculado desde el backend — si aquí se partiera de vacío, confirmar sin tocar nada
   * lo mandaría como $0 y borraría la oferta sin que nadie lo haya decidido.
   */
  function openConfirm(apartado) {
    setConfirmModal(apartado)
    setConfirmHours(tienda?.defaultApartadoHours ?? 24)
    setConfirmDiscounts(Object.fromEntries(apartado.items.map((i) => [i.id, Number(i.discount) > 0 ? String(i.discount) : ''])))
    setConfirmFieldErrors({})
    // El renglón de la lista no trae `availableStock` (piezas que de verdad quedan
    // libres, descontando lo que ya reclaman OTROS apartados PENDING del mismo
    // producto) — se pide el detalle fresco al backend y se reemplaza en cuanto llega,
    // sin bloquear la apertura del modal.
    getApartado(apartado.id).then((r) => setConfirmModal(r.data.data)).catch(() => {})
  }

  /** Tope de descuento (en pesos) para una línea, igual patrón que POS.jsx pero con el límite de apartados. */
  function resolveCap(item) {
    const gross = item.unitPrice * item.quantity
    const maxAmount = tienda?.maxApartadoDiscountAmount != null ? Number(tienda.maxApartadoDiscountAmount) : null
    const maxPercent = tienda?.maxApartadoDiscountPercent != null ? Number(tienda.maxApartadoDiscountPercent) : null
    if (maxAmount == null && maxPercent == null) return 0
    let cap = gross
    if (maxAmount != null) cap = Math.min(cap, maxAmount)
    if (maxPercent != null) cap = Math.min(cap, gross * maxPercent / 100)
    return cap
  }

  /**
   * Quita una línea del apartado en confirmación (ej. el producto se agotó mientras
   * seguía pendiente) — pide confirmación aparte porque no se puede deshacer desde aquí.
   * No se puede quitar la única línea que le quede (el backend lo rechaza); para eso está
   * cancelar el apartado completo.
   */
  async function handleRemoveItem(item) {
    if (!(await confirmDialog(`¿Quitar "${item.productName}" de este apartado?`, { confirmText: 'Quitar producto', danger: true }))) return
    try {
      const res = await removeApartadoItem(confirmModal.id, item.id)
      setConfirmModal(res.data.data)
      setConfirmDiscounts((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      load() // el renglón de la lista muestra los productos/total del apartado, ya cambiaron
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo quitar el producto', 'error')
    }
  }

  async function handleConfirm(e) {
    e.preventDefault()
    // Validación local ANTES del modal de confirmación — sin `min` nativo en Horas de
    // vigencia ni en el descuento de cada línea (ver el JSX del modal), así que esto es lo
    // único que impide un valor fuera de rango. Mismo patrón que Inventario/Usuarios: se
    // evalúa TODO el formulario de una vez, no con `return` anticipados por campo, para que
    // el mensaje de un campo ya corregido no se quede pegado si otro falla en el intento.
    const errors = {}
    const hours = Number(confirmHours) || 0
    if (hours < 1) errors.durationHours = 'Las horas de vigencia deben ser al menos 1'
    else if (hours > 8760) errors.durationHours = 'Las horas de vigencia no pueden ser mayores a 8,760 (1 año)'
    for (const item of confirmModal.items) {
      const discount = Number(confirmDiscounts[item.id]) || 0
      if (discount < 0) errors[item.id] = 'El descuento no puede ser negativo'
      else if (discount > resolveCap(item)) errors[item.id] = `El descuento no puede ser mayor a ${fmt(resolveCap(item))}`
    }
    if (Object.keys(errors).length > 0) {
      setConfirmFieldErrors(errors)
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    setConfirmFieldErrors({})
    if (!(await confirmDialog(`¿Confirmar el apartado de "${confirmModal.customerName}"? Se descontará el stock.`, { confirmText: 'Confirmar apartado', danger: false }))) return
    try {
      const items = confirmModal.items.map((i) => ({ itemId: i.id, discount: Number(confirmDiscounts[i.id]) || 0 }))
      await confirmApartado(confirmModal.id, { durationHours: hours, items })
      notify('Apartado confirmado', 'success')
      setConfirmModal(null)
      load()
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo confirmar', 'error')
    }
  }

  function openComplete(apartado) {
    setCompleteModal(apartado)
    setDeductItemIds(deductableOnOrder(apartado.items ?? []))
    setPaymentMethod('CASH')
    setAmountReceived('')
    setChargeMode('full')
    setInstallmentAmount('')
    setTicketType('physical')
    setCompleteEmail(apartado.customerEmail ?? '')
  }

  /**
   * Manda el ticket de una venta ya registrada a la impresora térmica vía QZ Tray — mismo
   * helper que usa POS.jsx. Nunca bloquea el flujo: si falla (impresora apagada, QZ Tray
   * no instalado, etc.) solo se avisa, el apartado ya quedó completado de todas formas.
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
   * `handleComplete`, mismo patrón que `openDrawerSilently` en POS.jsx) — el pulso que
   * abre la caja normalmente viaja pegado al ticket físico completo, así que en Digital
   * nunca se manda a imprimir y el cajón no se abriría solo. Nunca bloquea el flujo.
   */
  async function openDrawerSilently(saleId) {
    try {
      await openCashDrawer(saleId)
    } catch (err) {
      notify(err.message ?? 'No se pudo abrir el cajón', 'error')
    }
  }

  // Con un solo ticket se imprime directo; con varios (anticipo, abonos, liquidación) se elige.
  async function reprint(apartado) {
    try {
      const tickets = await apartadoTickets(apartado)
      if (tickets.length === 1) printTicket(tickets[0].saleId)
      else setTicketModal({ apartado, mode: 'print' })
    } catch {
      notify('No se pudieron cargar los tickets', 'error')
    }
  }

  // Acciones que no siempre aplican: van en el menú "+".
  function moreActions(a) {
    const items = []
    if (a.status === 'PENDING' && hasAction('APARTADOS', 'EDIT')) {
      items.push({ key: 'confirm', label: 'Confirmar', icon: CheckCircleIcon, onClick: () => openConfirm(a), tone: 'warning' })
    }
    if (a.stockReviewPending && hasAction('APARTADOS', 'EDIT')) {
      items.push({ key: 'review', label: 'Revisar inventario', icon: ClipboardListIcon, onClick: () => setReviewModal(a), tone: 'warning' })
    }
    if (a.status === 'COMPLETED' && a.pendingDelivery && !a.refundedAt && hasAction('APARTADOS', 'EDIT')) {
      items.push({ key: 'deliver', label: 'Entregar', icon: CheckIcon, onClick: () => openDeliver(a), tone: 'warning' })
    }
    if (a.depositSaleId || a.saleId) {
      items.push({ key: 'print', label: printing ? 'Imprimiendo…' : 'Reimprimir ticket', icon: PrinterIcon, onClick: () => reprint(a) })
      items.push({ key: 'view', label: 'Ver ticket digital', icon: EyeIcon, onClick: () => setTicketModal({ apartado: a, mode: 'view' }) })
    }
    return items
  }

  function openDeliver(apartado) {
    setDeliverModal(apartado)
    setDeliverIds(deductableOnOrder((apartado.items ?? []).filter((i) => !i.deliveredAt)))
    // Por omisión se entrega todo lo que falta; se puede desmarcar lo que se lleva otro día.
    setDeliverNow((apartado.items ?? []).filter((i) => !i.deliveredAt).map((i) => i.id))
  }

  async function handleDeliver() {
    setDelivering(true)
    try {
      await deliverApartado(deliverModal.id, { itemIds: deliverNow, deductItemIds: deliverIds.filter((id) => deliverNow.includes(id)) })
      const left = (deliverModal.items ?? []).filter((i) => !i.deliveredAt && !deliverNow.includes(i.id)).length
      notify(left > 0 ? `Entrega registrada; faltan ${left} producto(s) por entregar` : `Entrega del apartado #${deliverModal.folio} registrada`, 'success')
      setDeliverModal(null)
      load()
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo registrar la entrega', 'error')
    } finally {
      setDelivering(false)
    }
  }

  async function handleComplete(e) {
    e.preventDefault()
    if (!canComplete) return
    if (isInstallment) return handleInstallment()
    if (!(await confirmDialog(`¿Registrar el cobro de "${completeModal.customerName}" por ${fmt(completeTotal)}?`, { confirmText: 'Completar', danger: false }))) return
    try {
      const res = await completeApartado(completeModal.id, {
        paymentMethod,
        amountReceived: paymentMethod === 'CASH' ? Number(amountReceived) : undefined,
        customerEmail: completeEmail.trim() || undefined,
        deductItemIds,
      })
      const saleId = res.data.data?.saleId
      setCompleteModal(null)
      load()
      if (ticketType === 'digital') {
        notify(`Apartado completado — ticket enviado a ${completeEmail.trim()}`, 'success')
        // El pulso del cajón normalmente viaja pegado al ticket físico — en Digital ese
        // ticket nunca se imprime, así que si fue en efectivo se pide aparte (en
        // silencio, sin bloquear nada si falla), igual que en POS.jsx.
        if (saleId && paymentMethod === 'CASH') openDrawerSilently(saleId)
      } else {
        notify('Apartado completado, se generó la venta', 'success')
        // Igual que en POS.jsx: se imprime "al vuelo" SOLO en modo físico, y si falla
        // (impresora apagada, QZ Tray no instalado) solo se avisa — el "Venta #N" de la
        // tabla siempre trae su propio "🖨️ Reimprimir" por si hace falta reintentar.
        if (saleId) printTicket(saleId)
      }
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo completar', 'error')
    }
  }

  function openCancel(apartado) {
    setCancelModal(apartado)
    setCancelReason('')
    setCancelReasonError('')
    setDepositAction('')
    setDepositActionError('')
    setCancelOutcomes({})
    setStockNote('')
    setStockNoteError('')
  }

  async function handleCancelSubmit(e) {
    e.preventDefault()
    // Sin límite nativo en el textarea (ver el JSX del modal) — motivo solo se valida aquí,
    // al dar clic, mismo patrón que Notas en CashCuts.jsx (no en vivo).
    const withDeposit = hasPaidDeposit(cancelModal)
    const defective = withDeposit && depositAction === 'DEFECTIVE'
    const reasonErr = cancelReason.length > 500 ? 'El motivo no puede tener más de 500 caracteres'
      : defective && !cancelReason.trim() ? 'Escribe el motivo: qué defecto tiene el producto' : ''
    const stockItems = stockItemsOf(cancelModal)
    const note = stockNote.trim()
    const noteErr = anyNotRestocked(stockItems, cancelOutcomes) && !note
      ? 'Escribe el motivo: hay productos que no regresan al inventario'
      : note.length > 300 ? 'La nota no puede tener más de 300 caracteres' : ''
    setCancelReasonError(reasonErr)
    setDepositActionError('')
    setStockNoteError(noteErr)
    if (reasonErr || noteErr) {
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    const count = (o) => stockItems.filter((i) => (cancelOutcomes[i.id] ?? 'RESTOCK') === o).length
    const warn = stockItems.length === 0 ? ''
      : [
          count('RESTOCK') > 0 && ` ${count('RESTOCK')} producto(s) regresan al inventario.`,
          count('WASTE') > 0 && ` ${count('WASTE')} se registran como merma.`,
          count('NOT_RETURNED') > 0 && ` ${count('NOT_RETURNED')} no regresaron.`,
        ].filter(Boolean).join('')
    const paidOnAccount = Number(cancelModal.depositAmount ?? 0)
    const retained = withDeposit ? retainedAmount(cancelModal, { paid: paidOnAccount, paidOnAccount, defective }) : 0
    const depositWarn = !withDeposit ? ''
      : ` Se le devuelven ${fmt(paidOnAccount - retained)} al cliente${retained > 0 ? ` y la tienda retiene ${fmt(retained)}` : ''}.`
    if (!(await confirmDialog(`¿Cancelar el apartado de "${cancelModal.customerName}"?${warn}${depositWarn}`, { confirmText: 'Cancelar apartado', danger: true }))) return
    try {
      await cancelApartado(cancelModal.id, {
        reason: cancelReason.trim() || undefined,
        returnReason: withDeposit ? (defective ? 'DEFECTIVE' : 'CHANGE_OF_MIND') : undefined,
        items: stockItems.length > 0 ? outcomesPayload(stockItems, cancelOutcomes) : undefined,
        stockNote: note || undefined,
      })
      notify('Apartado cancelado', 'success')
      setCancelModal(null)
      load()
    } catch (err) {
      const fields = err.response?.data?.data ?? {}
      if (fields.depositAction) setDepositActionError(fields.depositAction)
      if (fields.reason) setCancelReasonError(fields.reason)
      if (fields.stockNote) setStockNoteError(fields.stockNote)
      notify(fields.depositAction ?? fields.reason ?? fields.stockNote ?? err.response?.data?.message ?? 'No se pudo cancelar', 'error')
    }
  }

  async function handleInstallment() {
    if (!(await confirmDialog(`¿Registrar un abono de ${fmt(chargeAmount)} al apartado #${completeModal.folio}? Quedará un saldo de ${fmt(pendingBalance - chargeAmount)}.`, { confirmText: 'Registrar abono', danger: false }))) return
    try {
      const res = await addApartadoInstallment(completeModal.id, {
        amount: chargeAmount,
        paymentMethod,
        amountReceived: paymentMethod === 'CASH' ? Number(amountReceived) : undefined,
        customerEmail: completeEmail.trim() || undefined,
      })
      const saleId = res.data.data?.id
      setCompleteModal(null)
      load()
      if (ticketType === 'digital') {
        notify(`Abono registrado — ticket enviado a ${completeEmail.trim()}`, 'success')
        if (saleId && paymentMethod === 'CASH') openDrawerSilently(saleId)
      } else {
        notify('Abono registrado', 'success')
        if (saleId) printTicket(saleId)
      }
    } catch (err) {
      const fields = err.response?.data?.data
      notify((fields && typeof fields === 'object' && Object.values(fields)[0]) || err.response?.data?.message || 'No se pudo registrar el abono', 'error')
    }
  }

  // Para un apartado con anticipo, lo que de verdad falta cobrar es el saldo (total - lo
  // pagado a cuenta: anticipo y abonos), no el total completo (ver `Sale kind=DEPOSIT`).
  const withDepositCharge = !!completeModal && completeModal.origin === 'DEPOSIT' && completeModal.depositAmount > 0
  const pendingBalance = completeModal
    ? (withDepositCharge ? completeModal.total - completeModal.depositAmount : completeModal.total)
    : 0
  const isInstallment = withDepositCharge && chargeMode === 'installment'
  const installmentNum = installmentAmount === '' ? null : Number(installmentAmount)
  // Abono: mayor a 0, con máximo 2 decimales y menor al saldo (pagarlo todo es Liquidar).
  const installmentError = !isInstallment || installmentNum == null ? ''
    : !(installmentNum > 0) ? 'El abono debe ser mayor a 0'
      : Math.round(installmentNum * 100) !== installmentNum * 100 ? 'Máximo 2 decimales'
        : installmentNum >= pendingBalance ? `El abono debe ser menor al saldo (${fmt(pendingBalance)}); para pagarlo todo usa Liquidar`
          : ''
  // Lo que se cobra ahora: el saldo completo o el abono.
  const chargeAmount = isInstallment ? (installmentNum ?? 0) : pendingBalance
  const completeTotal = chargeAmount
  const amountReceivedNum = amountReceived === '' ? null : Number(amountReceived)
  const change = paymentMethod === 'CASH' && amountReceivedNum != null ? amountReceivedNum - completeTotal : null
  // Ticket digital exige correo (igual que en POS.jsx) — a diferencia de POS, aquí suele
  // venir prellenado del que el cliente ya dejó al solicitar el apartado.
  const digitalEmailMissing = ticketType === 'digital' && !completeEmail.trim()
  // Mismo límite que Sale.amountReceived en el backend (NUMERIC(12,2)) — igual que en
  // POS.jsx, en vivo mientras se escribe.
  const completeAmountExceedsLimit = paymentMethod === 'CASH' && amountReceivedNum != null && amountReceivedNum > 9999999999.99
  // Correo/nombre siempre opcionales (salvo el correo en modo digital, ya cubierto arriba)
  // — mismo patrón que POS.jsx: formato y longitud solo importan si sí se capturó algo.
  const completeEmailInvalid = completeEmail.trim() !== '' && !EMAIL_RE.test(completeEmail.trim())
  const completeEmailTooLong = completeEmail.length > 150
  const canComplete = (!isInstallment || (installmentNum != null && !installmentError))
    && (paymentMethod !== 'CASH' || (amountReceivedNum != null && amountReceivedNum >= completeTotal && !completeAmountExceedsLimit))
    && !digitalEmailMissing && !completeEmailInvalid && !completeEmailTooLong

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Apartados</h2>
        {tienda?.apartadosEnabled && tienda?.publicSlug && (
          <a
            href={`/apartar/${tienda.publicSlug}`} target="_blank" rel="noopener noreferrer"
            className="btn-secondary text-sm whitespace-nowrap"
            title="Abrir la tienda pública de apartados en otra pestaña"
          >
            Abrir tienda en línea ↗
          </a>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-full p-1 mb-4 w-fit">
        <button
          type="button"
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${origin === '' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => { setOrigin(''); setPage(0) }}
        >Todos</button>
        <button
          type="button"
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${origin === 'ONLINE' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => { setOrigin('ONLINE'); setPage(0) }}
        >🌐 En línea</button>
        <button
          type="button"
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${origin === 'DEPOSIT' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => { setOrigin('DEPOSIT'); setPage(0) }}
        >💰 Con anticipo</button>
      </div>

      {(reviewCount > 0 || reviewOnly) && (
        <div className="flex flex-wrap items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-sm">
          <span className="text-orange-800">
            {reviewCount === 1 ? 'Hay 1 apartado' : `Hay ${reviewCount} apartados`} vencidos o cancelados por el cliente con el <strong>inventario por revisar</strong>: el producto sigue apartado hasta que confirmes qué pasó con él.
          </span>
          <button type="button" className="font-medium text-orange-700 hover:text-orange-900 hover:underline"
            onClick={() => { setReviewOnly(!reviewOnly); setPage(0) }}>
            {reviewOnly ? '✕ Ver todos' : 'Ver solo esos'}
          </button>
        </div>
      )}

      {folio != null && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200 w-fit text-sm">
          <span className="text-purple-700">Filtrando por <strong>apartado #{folio}</strong></span>
          <button type="button" className="text-purple-500 hover:text-purple-700 font-medium" onClick={() => { setFolio(null); setPage(0) }}>✕ Quitar</button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}>
            <option value="">Todos</option>
            <option value="PENDING">Pendientes</option>
            <option value="ACTIVE">Activos</option>
            <option value="COMPLETED">Completados</option>
            <option value="CANCELLED">Cancelados</option>
            <option value="EXPIRED">Vencidos</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Desde</label>
          <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0) }} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Hasta</label>
          <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPage(0) }} />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs font-medium text-gray-600 block mb-1">Cliente o producto</label>
          <input
            className="input" placeholder="🔍 Buscar por nombre, teléfono o producto..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          />
        </div>
        {(status || origin || folio != null || reviewOnly || from || to || search) && (
          <button
            type="button" className="btn-secondary text-sm"
            onClick={() => { setStatus(''); setOrigin(''); setFolio(null); setReviewOnly(false); setFrom(''); setTo(''); setSearch(''); setPage(0) }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <SortableTh label="Folio" sortKey="folio" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                <SortableTh label="Cliente" sortKey="customer" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                <SortableTh label="Total" sortKey="total" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                <SortableTh label="Estado" sortKey="status" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                <SortableTh label="Solicitado" sortKey="requested" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                {/* Anticipos: no vencen solos, llevan fecha de entrega (ver deliveryBadge). */}
                {origin === 'DEPOSIT'
                  ? <SortableTh label="Entrega" sortKey="delivery" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                  : <SortableTh label="Vence" sortKey="expires" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />}
                <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {apartados.map((a) => {
                // Completado y después devuelto: se muestra solo "Devuelto" (el estado guardado
                // sigue COMPLETED, ver ApartadoService#refund).
                const st = a.refundedAt
                  ? { label: 'Devuelto', color: 'bg-amber-100 text-amber-700' }
                  : a.status === 'COMPLETED' && a.pendingDelivery ? PENDING_DELIVERY
                  : STATUS_LABELS[a.status] ?? { label: a.status, color: 'bg-gray-100 text-gray-600' }
                // Solo tiene cobros si ya se cobró algo: anticipo o venta final.
                const hasPayments = !!(a.depositSaleId || a.saleId) || a.status === 'COMPLETED'
                return (
                  <Fragment key={a.id}>
                  <tr className={`hover:bg-gray-50 ${expanded.has(a.id) || expandedItems.has(a.id) ? 'bg-purple-50/40' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">{a.folio != null ? `#${a.folio}` : '—'}</td>
                    {/* Las ventas (anticipo, abonos, liquidación) están en "Ver pagos". */}
                    <td className="px-4 py-3 min-w-[200px]">
                      <p className="font-medium text-gray-900 [overflow-wrap:anywhere]">{a.customerName}</p>
                      <p className="text-xs text-gray-400">{a.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {fmt(a.total)}
                      {a.origin === 'DEPOSIT' && a.depositAmount > 0 && (
                        <span className="block text-xs font-normal text-amber-600 mt-0.5">
                          {/* Completado: ya se pagó todo (anticipo, abonos y liquidación). */}
                          Pagado {fmt(a.status === 'COMPLETED' ? a.total : a.depositAmount)}{a.status === 'CANCELLED' || a.status === 'COMPLETED' ? '' : ` · Saldo ${fmt(a.total - a.depositAmount)}`}
                        </span>
                      )}
                      {(a.status === 'CANCELLED' || a.refundedAt) && a.depositResolution && (
                        <span className={`block text-xs font-medium mt-0.5 ${a.depositResolution === 'REFUNDED' ? 'text-gray-500' : 'text-green-700'}`}>
                          {a.depositResolution === 'REFUNDED' ? 'Anticipo devuelto al cliente' : 'Anticipo: se lo quedó la tienda'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color}`} title={a.refundedAt ? (a.refundReason ?? '') : undefined}>{st.label}</span>
                      {a.stockReviewPending && (
                        <span className="block mt-1 w-fit px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Inventario por revisar</span>
                      )}
                      {a.status === 'COMPLETED' && a.pendingDelivery && !a.refundedAt && a.items.some((i) => i.deliveredAt) && (
                        <span className="block mt-1 text-xs text-teal-700">
                          Entregado {a.items.filter((i) => i.deliveredAt).length} de {a.items.length}
                        </span>
                      )}
                      {a.origin === 'DEPOSIT' && (
                        <span className="block mt-1 text-xs text-amber-700">💰 Anticipo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(a.requestedAt)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {a.origin === 'DEPOSIT' ? (
                        a.deliveryDate ? (
                          <>
                            <span className="text-gray-700">{fmtDeliveryDate(a.deliveryDate)}</span>
                            {(a.status === 'ACTIVE' || (a.pendingDelivery && !a.refundedAt)) && deliveryBadge(a.deliveryDate)}
                          </>
                        ) : '—'
                      ) : (a.status === 'ACTIVE' ? fmtDate(a.expiresAt) : '—')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end whitespace-nowrap">
                        {/* Productos y pagos siempre; Cobrar, Cancelar y Devolver solo cuando aplican. */}
                        <IconButton icon={ShirtIcon} label={expandedItems.has(a.id) ? 'Ocultar productos' : `Ver productos (${a.items.length})`} variant="primary" onClick={() => toggleItems(a.id)} />
                        <span onMouseEnter={() => hasPayments && prefetchApartadoPayments(a)} onFocus={() => hasPayments && prefetchApartadoPayments(a)}>
                          <IconButton icon={DollarIcon} label={!hasPayments ? 'Sin pagos' : expanded.has(a.id) ? 'Ocultar pagos' : 'Ver pagos'} variant="primary" disabled={!hasPayments} onClick={() => togglePayments(a.id)} />
                        </span>
                        {a.status === 'ACTIVE' && hasAction('APARTADOS', 'EDIT') && (
                          <IconButton icon={CreditCardIcon} label={a.origin === 'DEPOSIT' && a.depositAmount > 0 ? 'Cobrar (liquidar o abonar)' : 'Completar'} variant="purple" onClick={() => openComplete(a)} />
                        )}
                        {(a.status === 'PENDING' || a.status === 'ACTIVE') && hasAction('APARTADOS', 'DELETE') && (
                          <IconButton icon={XCircleIcon} label="Cancelar" variant="danger" onClick={() => openCancel(a)} />
                        )}
                        {a.status === 'COMPLETED' && !a.refundedAt && hasAction('APARTADOS', 'DELETE') && (
                          <IconButton icon={UndoIcon} label="Devolver" variant="warning" onClick={() => setRefundModal(a)} />
                        )}
                        {(() => {
                          const items = moreActions(a)
                          return <RowMenu icon={PlusIcon} label={items.length ? 'Más acciones' : 'Sin más acciones'} items={items} dot={items.some((i) => i.tone === 'warning')} />
                        })()}
                      </div>
                    </td>
                  </tr>
                  {expandedItems.has(a.id) && (
                    <tr className="bg-gray-50/70">
                      <td colSpan={7} className="p-0"><ApartadoItems apartado={a} /></td>
                    </tr>
                  )}
                  {expanded.has(a.id) && (
                    <tr className="bg-gray-50/70">
                      <td colSpan={7} className="p-0"><ApartadoPayments apartado={a} /></td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
              {apartados.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{loading ? 'Cargando...' : 'Sin apartados'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <span>Mostrar</span>
            <select className="input !w-auto py-1" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>por página · {totalElements === 0 ? 'sin resultados' : `${totalElements} en total`}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary py-1 px-3 text-xs disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹ Anterior</button>
            <span className="text-gray-500 text-xs">Página {totalPages === 0 ? 0 : page + 1} de {totalPages}</span>
            <button className="btn-secondary py-1 px-3 text-xs disabled:opacity-40" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente ›</button>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <ModalCloseButton onClick={() => setConfirmModal(null)} />
            <h3 className="text-lg font-bold mb-1 pr-8">Confirmar apartado</h3>
            <p className="text-sm text-gray-500 mb-4">{confirmModal.customerName} — {confirmModal.customerPhone}</p>
            {confirmModal.items.some((i) => i.availableStock === 0) && (
              <p className="text-xs text-red-700 bg-red-50 rounded px-3 py-2 mb-4">
                En caso de agotarse un producto favor de contactar al cliente al número {confirmModal.customerPhone}
                {confirmModal.customerEmail ? ` y correo ${confirmModal.customerEmail}` : ''}.
              </p>
            )}
            <form onSubmit={handleConfirm} className="space-y-4">
              {/* Sin `min` nativo a propósito (ver handleConfirm): el globo del navegador se
                  disparaba antes de que este formulario alcanzara a correr. */}
              <div>
                <label className="text-xs font-medium text-gray-600">Horas de vigencia</label>
                <input className="input" type="number" value={confirmHours} onChange={(e) => setConfirmHours(e.target.value)} />
                {confirmFieldErrors.durationHours && <p className="text-red-600 text-xs mt-1">{confirmFieldErrors.durationHours}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Productos</label>
                {confirmModal.items.map((item) => (
                  <div key={item.id} className="border border-gray-100 rounded-lg p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm">
                        <p className="font-medium text-gray-800">{item.productName}</p>
                        <p className="text-xs text-gray-400">{Number(item.quantity)} x {fmt(item.unitPrice)}</p>
                        {item.availableStock != null && (
                          <p className={item.availableStock < Number(item.quantity) ? 'text-xs text-red-500 font-medium' : 'text-xs text-gray-400'}>
                            {item.availableStock} pieza{item.availableStock === 1 ? '' : 's'} disponible{item.availableStock === 1 ? '' : 's'}
                          </p>
                        )}
                        {Number(item.discount) > 0 && (
                          <p className="text-xs text-purple-600">Ya trae oferta pública: -{fmt(item.discount)}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {discountsDisabled ? (
                          <span className="text-xs text-gray-400 italic" title="El administrador debe configurar un límite de descuento de apartados en Datos de la tienda">Sin descuento</span>
                        ) : (
                          // Sin `min` nativo a propósito (ver handleConfirm).
                          <input
                            className="input !w-24 !py-1 text-xs" type="number" step="0.01" placeholder="Descuento $"
                            value={confirmDiscounts[item.id] ?? ''}
                            onChange={(e) => setConfirmDiscounts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          />
                        )}
                        {confirmModal.items.length > 1 && (
                          <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => handleRemoveItem(item)}>
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>
                    {confirmFieldErrors[item.id] && <p className="text-red-600 text-xs text-right">{confirmFieldErrors[item.id]}</p>}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setConfirmModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete modal */}
      {completeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
            <ModalCloseButton onClick={() => setCompleteModal(null)} />
            <h3 className="text-lg font-bold mb-1 pr-8">{withDepositCharge ? `Cobrar apartado #${completeModal.folio}` : 'Completar apartado'}</h3>
            {withDepositCharge ? (
              <>
                <p className="text-sm text-gray-500 mb-3">
                  {completeModal.customerName} — Total {fmt(completeModal.total)}, ya pagó {fmt(completeModal.depositAmount)} a cuenta · Saldo: <strong className="text-gray-800">{fmt(pendingBalance)}</strong>
                </p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[['full', 'Liquidar', fmt(pendingBalance)], ['installment', 'Abonar', 'Otro monto']].map(([value, label, sub]) => (
                    <button key={value} type="button"
                      className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${chargeMode === value ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                      onClick={() => { setChargeMode(value); setAmountReceived('') }}>
                      {label}
                      <span className={`block text-xs font-normal ${chargeMode === value ? 'text-purple-100' : 'text-gray-400'}`}>{sub}</span>
                    </button>
                  ))}
                </div>
                {isInstallment && (
                  <div className="mb-3">
                    <label className="text-xs font-medium text-gray-600">Monto del abono <span className={installmentError ? 'text-red-600' : ''}>*</span></label>
                    <input className="input mt-1" type="number" step="0.01" placeholder="0.00" autoFocus
                      value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} />
                    {installmentError
                      ? <p className="text-xs text-red-500 mt-1">{installmentError}</p>
                      : installmentNum > 0 && <p className="text-xs text-gray-500 mt-1">Quedará un saldo de {fmt(pendingBalance - installmentNum)}. El abono no es reembolsable.</p>}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500 mb-4">{completeModal.customerName} — Total: {fmt(completeModal.total)}</p>
            )}
            <form onSubmit={handleComplete} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Ticket</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button type="button"
                    className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      ticketType === 'physical' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => setTicketType('physical')}
                  >🖨️ Físico</button>
                  <button type="button"
                    className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      ticketType === 'digital' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => setTicketType('digital')}
                  >📧 Digital</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">
                  Correo para enviar el ticket {ticketType === 'digital' ? <span className="text-red-500">*</span> : '(opcional)'}
                </label>
                {/* Sin type="email" ni required nativos a propósito (ver POS.jsx): el
                    navegador metía su propio globo de validación de formato. */}
                <input
                  className="input mt-1" type="text" placeholder="cliente@correo.com"
                  value={completeEmail}
                  onChange={(e) => setCompleteEmail(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Ej. cliente@gmail.com, cliente@outlook.com</p>
                {digitalEmailMissing ? (
                  <p className="text-xs text-red-500 mt-1">El ticket digital se manda por correo, captura uno para poder completar.</p>
                ) : completeEmailInvalid ? (
                  <p className="text-xs text-red-500 mt-1">El correo no tiene un formato válido</p>
                ) : completeEmailTooLong ? (
                  <p className="text-xs text-red-500 mt-1">El correo no puede tener más de 150 caracteres</p>
                ) : null}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Método de pago</label>
                <select className="input" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setAmountReceived('') }}>
                  <option value="CASH">💵 Efectivo</option>
                  <option value="CARD">💳 Tarjeta</option>
                  <option value="TRANSFER">🏦 Transferencia</option>
                </select>
              </div>
              {paymentMethod === 'CASH' && (
                <div>
                  <label className="text-xs font-medium text-gray-600">¿Con cuánto paga el cliente?</label>
                  {/* Sin `min` nativo a propósito (ver POS.jsx, mismo campo). */}
                  <input className="input mt-1" type="number" step="0.01" placeholder="0.00" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} />
                  {completeAmountExceedsLimit && (
                    <p className="text-xs text-red-500 mt-1">El número es excesivamente grande — el máximo permitido es 9,999,999,999.99</p>
                  )}
                  {!completeAmountExceedsLimit && amountReceivedNum != null && (
                    change != null && change >= 0 ? (
                      <div className="mt-2 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-center overflow-hidden">
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Cambio a entregar</p>
                        <p className="font-bold text-green-700 text-3xl mt-0.5 break-words">{fmt(change)}</p>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-center overflow-hidden">
                        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Falta por cobrar</p>
                        <p className="font-bold text-red-600 text-3xl mt-0.5 break-words">{fmt(completeTotal - amountReceivedNum)}</p>
                      </div>
                    )
                  )}
                </div>
              )}
              {!isInstallment && (
                <OnOrderDeductList items={completeModal.items} selected={deductItemIds} onChange={setDeductItemIds}
                  online={completeModal.origin !== 'DEPOSIT'}
                  hint="Viene marcado lo que alcanza a descontarse; lo que desmarques se entrega sin tocar el inventario." />
              )}
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setCompleteModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary disabled:opacity-40" disabled={!canComplete}>
                  {isInstallment ? 'Registrar abono' : withDepositCharge ? 'Liquidar' : 'Completar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ticketModal && (
        <ApartadoTicketModal apartado={ticketModal.apartado} mode={ticketModal.mode} printing={printing}
          onClose={() => setTicketModal(null)}
          onPrint={async (saleId) => {
            await printTicket(saleId)
            if (ticketModal.mode === 'print') setTicketModal(null)
          }} />
      )}

      {deliverModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <ModalCloseButton onClick={() => !delivering && setDeliverModal(null)} />
            <h3 className="text-lg font-bold mb-1 pr-8">Entregar apartado #{deliverModal.folio}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {deliverModal.customerName} ya pagó todo ({fmt(deliverModal.total)}). Marca lo que se lleva hoy; lo demás puede llevárselo otro día.
            </p>
            <div className="space-y-1 max-h-[55vh] overflow-y-auto">
              {(deliverModal.items ?? []).map((i) => {
                if (i.deliveredAt) {
                  return (
                    <div key={i.id} className="flex gap-3 items-start p-2 border border-gray-100 bg-gray-50 rounded-lg">
                      <span className="mt-0.5 text-green-600" aria-hidden="true">✓</span>
                      <span className="text-sm text-gray-500 [overflow-wrap:anywhere]">
                        {i.productName} · {Number(i.quantity)} pza.
                        <span className="block text-xs">Entregado {fmtDate(i.deliveredAt)}{i.deliveredByName ? ` · ${i.deliveredByName}` : ''}</span>
                      </span>
                    </div>
                  )
                }
                const checked = deliverNow.includes(i.id)
                const stock = Number(i.product?.stock ?? 0)
                const short = stock < Number(i.quantity)
                return (
                  <div key={i.id} className={`p-2 border rounded-lg ${checked ? 'border-purple-200 bg-purple-50/40' : 'border-gray-200'}`}>
                    <label className="flex gap-3 items-start cursor-pointer">
                      <input type="checkbox" className="mt-0.5 w-4 h-4" checked={checked}
                        onChange={(e) => setDeliverNow((prev) => (e.target.checked ? [...prev, i.id] : prev.filter((x) => x !== i.id)))} />
                      <span className="text-sm [overflow-wrap:anywhere]">
                        {i.productName} · {Number(i.quantity)} pza.
                        <span className="block text-xs text-gray-500">
                          {!i.product ? 'Sin inventario'
                            : i.product.isMadeToOrder ? 'Por pedido: no maneja inventario'
                            : i.onOrder ? 'Sobre pedido'
                            : 'Ya salió del inventario al registrar el anticipo'}
                        </span>
                      </span>
                    </label>
                    {/* Sobre pedido: al entregarlo se decide si sale del inventario. */}
                    {i.onOrder && checked && (
                      <label className={`flex gap-2 items-center mt-1.5 ml-7 text-xs ${short ? 'opacity-60' : 'cursor-pointer'}`}>
                        <input type="checkbox" className="w-3.5 h-3.5" disabled={short} checked={deliverIds.includes(i.id)}
                          onChange={(e) => setDeliverIds((prev) => (e.target.checked ? [...prev, i.id] : prev.filter((x) => x !== i.id)))} />
                        {short ? `Sin piezas suficientes para descontar (hay ${stock})` : `Descontar del inventario (hay ${stock})`}
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">Viene marcado descontar lo sobre pedido que tiene piezas; lo que desmarques se entrega sin tocar el inventario.</p>
            <div className="flex gap-2 justify-end pt-4">
              <button type="button" className="btn-secondary" disabled={delivering} onClick={() => setDeliverModal(null)}>Cancelar</button>
              <button type="button" className="btn-primary disabled:opacity-40" disabled={delivering || deliverNow.length === 0} onClick={handleDeliver}>
                {delivering ? 'Registrando…' : deliverNow.length === 0 ? 'Elige qué se entrega'
                  : deliverNow.length === (deliverModal.items ?? []).filter((i) => !i.deliveredAt).length ? 'Registrar entrega' : `Entregar ${deliverNow.length} producto(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewModal && (
        <ApartadoStockReviewModal apartado={reviewModal} onClose={() => setReviewModal(null)}
          onDone={() => { setReviewModal(null); load() }} />
      )}

      {refundModal && (
        <ApartadoRefundModal apartado={refundModal} onClose={() => setRefundModal(null)}
          onDone={() => { setRefundModal(null); load() }} />
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <ModalCloseButton onClick={() => setCancelModal(null)} />
            <h3 className="text-lg font-bold mb-1 pr-8">Cancelar apartado</h3>
            <p className="text-sm text-gray-500 mb-4">
              {cancelModal.customerName}
            </p>
            <form onSubmit={handleCancelSubmit} className="space-y-3">
              {/* El anticipo primero, igual que en Devolver apartado: es la decisión de dinero. */}
              {hasPaidDeposit(cancelModal) && (
                <div>
                  <ReturnReasonPicker apartado={cancelModal} paid={cancelModal.depositAmount} paidOnAccount={cancelModal.depositAmount}
                    canOverride={isManagement(user)} defective={depositAction === 'DEFECTIVE'}
                    onChange={(on) => {
                      setDepositAction(on ? 'DEFECTIVE' : ''); setDepositActionError(''); setCancelReasonError('')
                      if (on) setCancelOutcomes(Object.fromEntries(stockItemsOf(cancelModal).map((i) => [i.id, 'WASTE'])))
                    }}
                    help="Se devuelve del último pago hacia atrás. Si se devuelve un pago completo y su turno sigue abierto, se cancela esa venta; si no, sale de tu caja como devolución." />
                  {depositActionError && <p className="text-red-600 text-xs mt-1">{depositActionError}</p>}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600">
                  Motivo para el cliente {hasPaidDeposit(cancelModal) && depositAction === 'DEFECTIVE'
                    ? <span className={cancelReasonError ? 'text-red-600' : ''}>*</span> : '(opcional)'}
                </label>
                <textarea
                  className="input" rows={3} autoFocus
                  placeholder="Ej. Ya no tenemos disponible el color que apartaste..."
                  value={cancelReason}
                  onChange={(e) => { setCancelReason(e.target.value); setCancelReasonError('') }}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {cancelModal.customerEmail
                    ? `Se le avisará por correo a ${cancelModal.customerEmail}, con este motivo si lo escribes.${cancelModal.customerPhone ? ` O lo puedes contactar al número ${cancelModal.customerPhone}.` : ''}`
                    : cancelModal.customerPhone
                      ? `El cliente no dejó correo al solicitarlo, se le puede avisar por llamada al número que dejó registrado: ${cancelModal.customerPhone}.`
                      : 'El cliente no dejó correo ni teléfono al solicitarlo, no se le podrá avisar.'}
                </p>
                {cancelReasonError && <p className="text-red-600 text-xs mt-1">{cancelReasonError}</p>}
              </div>
              {stockItemsOf(cancelModal).length > 0 && (
                <div className="space-y-2">
                  <ItemOutcomePicker items={stockItemsOf(cancelModal)} value={cancelOutcomes}
                    onChange={(v) => { setCancelOutcomes(v); setStockNoteError('') }} />
                  <div>
                    <label className="text-xs font-medium text-gray-600">
                      Nota interna {anyNotRestocked(stockItemsOf(cancelModal), cancelOutcomes)
                        ? <span className={stockNoteError ? 'text-red-600' : ''}>*</span>
                        : <span className="text-gray-400">(opcional)</span>}
                    </label>
                    <textarea className="input" rows={2} placeholder="Ej. El pastel ya estaba decorado con su nombre"
                      value={stockNote} onChange={(e) => { setStockNote(e.target.value); setStockNoteError('') }} />
                    <p className="text-xs text-gray-400">No se le envía al cliente; queda en Movimientos de inventario.</p>
                    {stockNoteError && <p className="text-red-600 text-xs mt-1">{stockNoteError}</p>}
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setCancelModal(null)}>Cerrar</button>
                <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm">Cancelar apartado</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
