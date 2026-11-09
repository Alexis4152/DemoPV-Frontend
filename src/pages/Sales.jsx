import { Fragment, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getSales, getSale, cancelSale, cancelSaleWithItems, refundSale } from '../api/sales'
import ItemOutcomePicker, { OUTCOME_LABELS, anyNotRestocked, outcomesPayload } from '../components/ItemOutcomePicker'
import { useAuth } from '../context/AuthContext'
import { isManagement } from '../utils/roleLabels'
import { useNotify } from '../context/NotifyContext'
import { printSaleTicket } from '../utils/printer'
import useEscapeClose from '../hooks/useEscapeClose'
import IconButton from '../components/IconButton'
import { ShirtIcon, PrinterIcon, XCircleIcon, UndoIcon, EyeIcon } from '../components/icons'
import ApartadoTicketModal from './ApartadoTicketModal'
import ModalCloseButton from '../components/ModalCloseButton'
import NoOpenCutNotice, { useMyOpenCut } from '../components/NoOpenCutNotice'
import useTableSort from '../hooks/useTableSort'
import SortableTh from '../components/SortableTh'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDate = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

const METHOD_LABELS = { CASH: '💵 Efectivo', CARD: '💳 Tarjeta', TRANSFER: '🏦 Transferencia' }
const PAGE_SIZES = [10, 20, 50, 100]

const EMPTY_FILTERS = { from: '', to: '', customerName: '', paymentMethod: '', status: '' }

// Artículos que sí tienen inventario que regresar (no por concepto ni "por pedido").
const isStockItem = (item) => !!item.product && !item.product.isMadeToOrder
// Una venta del turno que sigue abierto se cancela; una de un turno ya cerrado se devuelve
// (ver SaleService#cancel/#refund). Las de apartados/anticipos no se devuelven aquí.
const isOpenTurn = (s) => s.cashCut?.status === 'OPEN'
// La venta final de un apartado se devuelve desde Apartados (ver ApartadoService#refund).
const canRefundKind = (s) => (!s.kind || s.kind === 'REGULAR') && !s.apartadoFolio
// Límites de devolución para cajeros (Datos de la tienda, ver SaleService#ensureCanRefund):
// regresa los motivos por los que necesita un administrador/supervisor, o null.
function refundNeedsManager(s, tienda) {
  const reasons = []
  if (tienda?.cashierRefundMaxAmount != null && Number(s.total) > Number(tienda.cashierRefundMaxAmount)) {
    reasons.push(`Las devoluciones de más de $${Number(tienda.cashierRefundMaxAmount).toFixed(2)} las registra un administrador o supervisor`)
  }
  if (tienda?.cashierRefundMaxDays != null && s.createdAt) {
    const limit = new Date()
    limit.setHours(0, 0, 0, 0)
    limit.setDate(limit.getDate() - Number(tienda.cashierRefundMaxDays))
    if (new Date(s.createdAt) < limit) reasons.push(`Venta de hace más de ${tienda.cashierRefundMaxDays} días: la devolución la registra un administrador o supervisor`)
  }
  return reasons.length > 0 ? reasons.join('. ') : null
}
// "Anticipo del apartado #N" / "Abono al apartado #N" (ver DepositLines en el backend).
const depositLabel = (s) => `${s.installment ? 'Abono al apartado' : 'Anticipo del apartado'} #${s.apartadoFolio}`
// Líneas con inventario, en la forma que usa ItemOutcomePicker.
const returnItems = (sale) => (sale?.items ?? []).filter(isStockItem).map((i) => ({ id: i.id, name: i.productName, quantity: i.quantity }))

/**
 * Subtabla bajo una fila de Ventas: los productos de la venta con su descuento, qué pasó
 * con cada uno si se devolvió, y los totales (subtotal, descuentos, anticipo, recibido/cambio).
 */
function SaleItemsDetail({ detail }) {
  // Anticipo/abono: su única línea es el pago a cuenta; se muestran los productos de su apartado.
  const isDeposit = detail.kind === 'DEPOSIT'
  const rows = isDeposit
    ? (detail.apartadoItems ?? []).map((a) => ({ ...a, product: { isMadeToOrder: a.madeToOrder } }))
    : (detail.items ?? [])
  const apartadoTotal = rows.reduce((sum, r) => sum + Number(r.subtotal ?? 0), 0)
  return (
    <div className="px-4 py-3">
      <p className="text-xs font-semibold text-gray-600 mb-2">
        {isDeposit
          ? <>Productos del apartado #{detail.apartadoFolio} <span className="font-normal text-gray-400">· informativo: lo cobrado en esta venta es el {detail.installment ? 'abono' : 'anticipo'}</span></>
          : <>Productos de la venta #{detail.folio}</>}
      </p>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px] items-start">
        <div className="space-y-3 min-w-0">
            {detail.refundedAt && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-0.5">
                <p className="font-semibold">Devuelta el {fmtDate(detail.refundedAt)}{detail.refundedBy?.name ? ` por ${detail.refundedBy.name}` : ''}</p>
                <p className="[overflow-wrap:anywhere]">Motivo: {detail.refundReason}</p>
                {detail.refundAmount != null && <p>Se devolvieron {fmt(detail.refundAmount)} de {fmt(detail.total)}: la tienda retuvo {fmt(Number(detail.total) - Number(detail.refundAmount))}.</p>}
                <p>{detail.paymentMethod === 'CASH' ? `Salieron ${fmt(detail.refundAmount ?? detail.total)} en efectivo de la caja de quien la devolvió.` : 'Reembolso por el mismo medio de pago (no salió efectivo).'}</p>
              </div>
            )}
            <div className="overflow-x-auto">
            <table className="w-full text-xs bg-white rounded-lg border border-gray-100 min-w-[420px]">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Producto</th>
                  <th className="text-right px-3 py-2 font-medium">Cant.</th>
                  <th className="text-right px-3 py-2 font-medium">Descuento</th>
                  <th className="text-right px-3 py-2 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-800">
                      {item.productName}
                      {/* Sin inventario que regresar: se cobró por concepto (no es del catálogo)
                          o es un producto por pedido. El anticipo ya se nombra solo. */}
                      {!item.product && detail.kind !== 'DEPOSIT' && <span className="block text-xs text-gray-400">Concepto</span>}
                      {item.product?.isMadeToOrder && <span className="block text-xs text-gray-400">Por pedido</span>}
                      {item.returnOutcome ? (
                        <span className={`block text-xs ${item.returnOutcome === 'RESTOCK' ? 'text-green-600' : item.returnOutcome === 'WASTE' ? 'text-amber-600' : 'text-red-600'}`}>
                          {OUTCOME_LABELS[item.returnOutcome]}
                        </span>
                      ) : (
                        <>
                          {detail.refundedAt && item.returnedToStock === true && <span className="block text-xs text-green-600">Regresó al inventario</span>}
                          {detail.refundedAt && item.returnedToStock === false && <span className="block text-xs text-red-600">No regresó (el cliente no lo entregó)</span>}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{item.quantity}</td>
                    <td className="px-3 py-2 text-right text-green-600">{item.discount > 0 ? `-${fmt(item.discount)}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3">
            <div className="text-sm space-y-1">
              {isDeposit ? (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>Total del apartado</span><span>{fmt(apartadoTotal)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base text-gray-900">
                    <span>{detail.installment ? 'Abono' : 'Anticipo'}</span><span className="text-purple-700">{fmt(detail.total)}</span>
                  </div>
                </>
              ) : (<>
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span><span>{fmt(detail.subtotal)}</span>
              </div>
              {detail.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Descuento</span><span>-{fmt(detail.discount)}</span>
                </div>
              )}
              {/* Venta del saldo de un anticipo: lo ya pagado no es descuento */}
              {detail.depositApplied > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>{detail.depositSaleFolio ? `Anticipo pagado (venta #${detail.depositSaleFolio})` : 'Anticipo y abonos pagados'}</span>
                  <span>-{fmt(detail.depositApplied)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base text-gray-900">
                <span>Total</span><span className="text-purple-700">{fmt(detail.total)}</span>
              </div>
              </>)}
            </div>
            {detail.amountReceived != null && (
              <div className="text-sm text-gray-500 mt-1">
                <div className="flex justify-between"><span>Recibido</span><span>{fmt(detail.amountReceived)}</span></div>
                <div className="flex justify-between font-medium text-gray-700"><span>Cambio</span><span>{fmt(detail.changeGiven)}</span></div>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

/**
 * Página "Ventas": historial paginado de las ventas registradas en el POS (de la tienda
 * del usuario, o de todas si es `SUPER_ADMIN` — el backend ya aplica ese filtro, aquí solo
 * se muestra lo recibido). Permite filtrar por rango de fechas, cliente, forma de pago y
 * estado, ver el detalle (partidas y totales) de una venta, y — solo administradores —
 * cancelarla.
 *
 * Filtros: aplican solos al cambiar cualquier campo (mismo patrón que Apartados.jsx/
 * Inventory.jsx) — el único con debounce de 250ms es el de texto libre ("Cliente"), para
 * no pegarle a la API en cada tecla; fecha/método/estado disparan de inmediato, son
 * cambios discretos. La paginación es server-side: `page`/`size` viajan como query params
 * y el backend responde `{content, page, size, totalElements, totalPages}`; el rango
 * "X–Y de Z" que se muestra en el pie de la tabla se calcula localmente a partir de esos
 * totales.
 *
 * Cancelar una venta (`handleCancel`) es una operación destructiva en términos de negocio
 * (revierte el stock de los productos vendidos) por lo que se pide confirmación explícita
 * y solo está disponible para ventas `COMPLETED`; la fila nunca se borra, el backend solo
 * le cambia el `status` a `CANCELLED` (por eso sigue apareciendo en el listado).
 *
 * Permite llegar con un rango de fechas ya aplicado desde afuera (ej. la tarjeta "Ventas
 * del mes" del Dashboard enlaza a `/sales?from=YYYY-MM-DD&to=YYYY-MM-DD`) — se lee una
 * sola vez al montar.
 */
export default function Sales() {
  const { hasAction, user } = useAuth()
  const manager = isManagement(user)
  // Un cajero solo cancela ventas de su propio turno (ver SaleService#cancel).
  const canCancelTurn = (s) => manager || s.cashCut?.user?.id === user?.id
  const { notify, confirmDialog } = useNotify()
  const [searchParams] = useSearchParams()
  const initialFilters = () => ({
    ...EMPTY_FILTERS,
    from: searchParams.get('from') || EMPTY_FILTERS.from,
    to: searchParams.get('to') || EMPTY_FILTERS.to,
    // Ej. la tarjeta "Devoluciones de hoy" del Inicio llega con ?status=REFUNDED.
    status: searchParams.get('status') || EMPTY_FILTERS.status,
  })
  const [filters, setFilters] = useState(initialFilters)
  const [page, setPage] = useState(0)
  // Orden de la tabla por encabezado (se aplica en el servidor; ver useTableSort).
  const tableSort = useTableSort('sort:sales')
  const onSort = (k) => { tableSort.toggle(k); setPage(0) }
  const [size, setSize] = useState(20)
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  // Ventas con su subtabla de productos abierta.
  const [expanded, setExpanded] = useState(() => new Set())
  const toggleItems = (id) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  // Llega de "Venta #N" en Apartados (?sale=id): se muestra solo esa venta, con sus productos abiertos.
  const [linked, setLinked] = useState(null)
  const [loading, setLoading] = useState(true)
  // Id de la venta que se está reimprimiendo en este momento (o null) — deshabilita solo
  // el botón de esa fila mientras QZ Tray manda el ticket, sin bloquear el resto de la tabla.
  const [printingId, setPrintingId] = useState(null)
  const [ticketSale, setTicketSale] = useState(null) // venta cuyo ticket digital se está viendo
  // Devolución de una venta de un turno ya cerrado: venta elegida, artículos que el cliente
  // entregó (ids de SaleItem) y motivo.
  // Venta que se está cancelando (turno abierto) o devolviendo (turno cerrado); `refundMode`
  // dice cuál. Ambos usan el mismo modal: qué pasó con cada producto + motivo.
  const [refund, setRefund] = useState(null)
  const [refundMode, setRefundMode] = useState('refund')
  const [outcomes, setOutcomes] = useState({})
  // Devolver en efectivo saca el dinero de la caja de quien devuelve: sin corte abierto no se
  // puede (igual que cobrar en el Punto de Venta).
  const needsCut = !!refund && refundMode === 'refund' && refund.paymentMethod === 'CASH'
  const myCut = useMyOpenCut(needsCut)
  const blockedNoCut = needsCut && myCut === null
  const [refundReason, setRefundReason] = useState('')
  const [refundErrors, setRefundErrors] = useState({})
  const [refundSaving, setRefundSaving] = useState(false)

  useEffect(() => {
    const id = Number(searchParams.get('sale'))
    if (!Number.isInteger(id) || id <= 0) { setLinked(null); return }
    getSale(id)
      .then((r) => { setLinked(r.data.data); setExpanded(new Set([id])) })
      .catch(() => notify('No se encontró esa venta', 'error'))
  }, [searchParams])

  useEscapeClose(!!refund, () => setRefund(null))

  /**
   * Trae la página actual de ventas usando `page`/`size` y los `filters` vigentes. Las
   * fechas se envían como rango de día completo: `from` se ancla a las 00:00:00 y `to` a
   * las 23:59:59 para incluir todas las ventas del día seleccionado, no solo la medianoche.
   * Se re-ejecuta automáticamente (ver el `useEffect` de abajo, con debounce de 250ms sobre
   * el texto) cada vez que cambia cualquiera de esos valores.
   */
  function load() {
    setLoading(true)
    const params = {
      ...tableSort.params,
      page,
      size,
      customerName: filters.customerName || undefined,
      paymentMethod: filters.paymentMethod || undefined,
      status: filters.status || undefined,
      from: filters.from ? `${filters.from}T00:00:00` : undefined,
      to: filters.to ? `${filters.to}T23:59:59` : undefined,
    }
    getSales(params)
      .then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
      .finally(() => setLoading(false))
    // La venta enlazada (?sale=) también se refresca, p. ej. después de cancelarla o devolverla.
    if (linked) getSale(linked.id).then((r) => setLinked(r.data.data)).catch(() => {})
  }

  // Debounce de 250ms sobre el texto de "Cliente" (mismo patrón que Inventory.jsx/POS.jsx),
  // para no pegarle a la API en cada tecla; fecha/método/estado/página disparan de inmediato.
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [page, size, filters, tableSort.sort])

  /** Actualiza un filtro y reinicia a la primera página, para no quedar "atorado" en una
   *  página que ya no existe con el nuevo filtro. */
  function setFilter(patch) {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(0)
  }

  /** Limpia todos los filtros y vuelve a la primera página. */
  function handleClearFilters() {
    setFilters(EMPTY_FILTERS)
    setPage(0)
  }

  const hasFilters = filters.from || filters.to || filters.customerName || filters.paymentMethod || filters.status

  /**
   * Cancela una venta completada. Pide confirmación porque la cancelación revierte el
   * stock de los productos vendidos (efecto secundario en inventario) y queda registrada
   * en el backend (quién/cuándo la canceló); la fila de la venta no se elimina, solo cambia
   * su estado a CANCELLED. Solo se ofrece este botón a administradores y solo sobre ventas
   * `COMPLETED` (ver JSX de la tabla). Al terminar, recarga el listado para reflejar el
   * nuevo estado.
   */
  async function handleCancel(sale) {
    // Con productos con inventario se pregunta qué pasó con cada uno (modal). La venta final
    // de un apartado no regresa stock (el apartado vuelve a quedar activo, ver
    // SaleService#cancel), así que ahí basta con confirmar.
    if (!sale.apartadoFolio && (sale.items ?? []).some(isStockItem)) {
      openReturn(sale, 'cancel')
      return
    }
    const msg = sale.apartadoFolio
      ? `¿Cancelar el cobro del apartado #${sale.apartadoFolio}? El apartado vuelve a quedar activo y el producto sigue apartado para el cliente.`
      : '¿Cancelar esta venta? Se revertirá el stock.'
    if (!(await confirmDialog(msg, { confirmText: 'Cancelar venta' }))) return
    try {
      await cancelSale(sale.id)
      notify(sale.apartadoFolio ? `Venta cancelada: el apartado #${sale.apartadoFolio} vuelve a estar activo` : 'Venta cancelada', 'success')
      load()
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo cancelar la venta', 'error')
    }
  }

  /** Abre cancelar/devolver con todos los productos como "Regresa" (lo normal). */
  function openReturn(sale, mode) {
    setRefund(sale)
    setRefundMode(mode)
    setOutcomes({})
    setRefundReason('')
    setRefundErrors({})
  }
  const openRefund = (sale) => openReturn(sale, 'refund')

  /**
   * Registra la devolución de la venta completa. Si fue en efectivo, el dinero sale de la
   * caja de quien la hace (debe tener su corte abierto); los artículos marcados regresan al
   * inventario y los desmarcados quedan registrados como "devolución sin producto".
   */
  async function handleRefund() {
    const isCancel = refundMode === 'cancel'
    const reason = refundReason.trim()
    const stockItems = returnItems(refund)
    const errors = {}
    // Devolver siempre pide motivo; cancelar solo si algún producto no regresa al inventario.
    if (!reason && (!isCancel || anyNotRestocked(stockItems, outcomes))) {
      errors.reason = isCancel ? 'Escribe el motivo: hay productos que no regresan al inventario' : 'Escribe el motivo de la devolución'
    } else if (reason.length > 300) errors.reason = 'El motivo no puede tener más de 300 caracteres'
    if (Object.keys(errors).length > 0) {
      setRefundErrors(errors)
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    const count = (o) => stockItems.filter((i) => (outcomes[i.id] ?? 'RESTOCK') === o).length
    const stockMsg = [
      count('WASTE') > 0 && `${count('WASTE')} producto(s) se registran como merma.`,
      count('NOT_RETURNED') > 0 && `${count('NOT_RETURNED')} producto(s) no regresaron.`,
    ].filter(Boolean).join(' ')
    const cashMsg = isCancel ? ''
      : refund.paymentMethod === 'CASH'
        ? `Saldrán ${fmt(refund.total)} en efectivo de tu caja.`
        : 'No sale efectivo de la caja: el reembolso se hace por el mismo medio de pago.'
    const question = isCancel ? `¿Cancelar la venta #${refund.folio}?` : `¿Registrar la devolución de la venta #${refund.folio}?`
    if (!(await confirmDialog(`${question} ${cashMsg} ${stockMsg}`.trim(), { confirmText: isCancel ? 'Cancelar venta' : 'Registrar devolución' }))) return
    setRefundSaving(true)
    setRefundErrors({})
    try {
      const payload = { reason: reason || undefined, items: outcomesPayload(stockItems, outcomes) }
      if (isCancel) await cancelSaleWithItems(refund.id, payload)
      else await refundSale(refund.id, payload)
      notify(isCancel ? 'Venta cancelada' : 'Devolución registrada', 'success')
      setRefund(null)
      load()
    } catch (err) {
      const data = err.response?.data?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setRefundErrors(data)
        notify('Revisa los campos marcados en rojo', 'error')
      } else {
        notify(err.response?.data?.message ?? (refundMode === 'cancel' ? 'No se pudo cancelar la venta' : 'No se pudo registrar la devolución'), 'error')
      }
    } finally {
      setRefundSaving(false)
    }
  }

  /**
   * Reimprime el ticket de una venta ya registrada (misma impresora térmica vía QZ Tray
   * que usa el POS al cobrar — ver `utils/printer.js`). Pide confirmación primero porque,
   * a diferencia del ticket que se imprime justo al cobrar, esto es una reimpresión
   * deliberada y gasta papel de la térmica.
   */
  async function handleReprint(id) {
    if (!(await confirmDialog('¿Reimprimir el ticket de esta venta? Se usará papel de la impresora.', { confirmText: 'Reimprimir' }))) return
    setPrintingId(id)
    try {
      await printSaleTicket(id)
    } catch (err) {
      notify(err.message ?? 'No se pudo imprimir el ticket', 'error')
    } finally {
      setPrintingId(null)
    }
  }

  const sales = linked ? [linked] : (pageData.content ?? [])
  const totalPages = pageData.totalPages ?? 0
  const totalElements = pageData.totalElements ?? 0
  // Rango "X–Y de Z" mostrado junto al selector de tamaño de página, calculado localmente
  // a partir de la página/tamaño actuales y el total que reporta el backend.
  const from = totalElements === 0 ? 0 : page * size + 1
  const to = Math.min(totalElements, page * size + sales.length)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Historial de ventas</h2>

      {/* flex-wrap, sin botón "Filtrar": cada campo aplica solo al cambiar (mismo patrón
          que Apartados.jsx/Inventory.jsx) — "Limpiar filtros" solo aparece si hay algo que limpiar. */}
      <div className="card mb-4 flex flex-wrap gap-3 items-end">
        <div className="w-36">
          <label className="text-xs font-medium text-gray-600 block mb-1">Desde</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />
        </div>
        <div className="w-36">
          <label className="text-xs font-medium text-gray-600 block mb-1">Hasta</label>
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />
        </div>
        <div className="w-44">
          <label className="text-xs font-medium text-gray-600 block mb-1">Cliente</label>
          <input type="text" className="input" placeholder="Nombre del cliente" value={filters.customerName} onChange={(e) => setFilter({ customerName: e.target.value })} />
        </div>
        <div className="w-40">
          <label className="text-xs font-medium text-gray-600 block mb-1">Método</label>
          <select className="input" value={filters.paymentMethod} onChange={(e) => setFilter({ paymentMethod: e.target.value })}>
            <option value="">Todos</option>
            <option value="CASH">Efectivo</option>
            <option value="CARD">Tarjeta</option>
            <option value="TRANSFER">Transferencia</option>
          </select>
        </div>
        <div className="w-40">
          <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
          <select className="input" value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
            <option value="">Todos</option>
            <option value="COMPLETED">Completada</option>
            <option value="REFUNDED">Devuelta</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </div>
        {hasFilters && (
          <button type="button" className="btn-secondary text-sm" onClick={handleClearFilters}>Limpiar filtros</button>
        )}
      </div>

      {linked && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Mostrando solo la venta #{linked.folio}.
          <Link to="/sales" className="font-medium underline hover:text-blue-900">Ver todas las ventas</Link>
        </div>
      )}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <SortableTh label="#" sortKey="folio" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <SortableTh label="Fecha" sortKey="date" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <SortableTh label="Cliente" sortKey="customer" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <SortableTh label="Vendedor" sortKey="seller" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <SortableTh label="Método" sortKey="method" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <SortableTh label="Total" sortKey="total" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <SortableTh label="Estado" sortKey="status" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
              <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sales.map((s) => (
              <Fragment key={s.id}>
              <tr className={`hover:bg-gray-50 ${expanded.has(s.id) ? 'bg-purple-50/40' : ''}`}>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{s.folio}</td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(s.createdAt)}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[220px] [overflow-wrap:anywhere]">
                  {s.customerName ?? '—'}
                  {s.kind === 'DEPOSIT' && (
                    <Link to={`/apartados?folio=${s.apartadoFolio}`} className="block text-xs font-medium text-amber-600 hover:text-amber-800 hover:underline mt-0.5">💰 {depositLabel(s)}</Link>
                  )}
                  {s.kind === 'BALANCE' && (
                    <Link to={`/apartados?folio=${s.apartadoFolio}`} className="block text-xs font-medium text-amber-600 hover:text-amber-800 hover:underline mt-0.5">Saldo de apartado #{s.apartadoFolio}</Link>
                  )}
                  {s.kind === 'REGULAR' && s.apartadoFolio && (
                    <Link to={`/apartados?folio=${s.apartadoFolio}`} className="block text-xs font-medium text-amber-600 hover:text-amber-800 hover:underline mt-0.5">Venta de apartado #{s.apartadoFolio}</Link>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{s.user?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{METHOD_LABELS[s.paymentMethod]}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">
                  {fmt(s.total)}
                  {s.kind === 'DEPOSIT' && s.pendingBalance > 0 && (
                    <span className="block text-xs font-normal text-gray-400 mt-0.5">Saldo pendiente: {fmt(s.pendingBalance)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    s.status !== 'COMPLETED' ? 'bg-red-100 text-red-600'
                      : s.refundedAt ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                  }`}>{s.status !== 'COMPLETED' ? 'Cancelada' : s.refundedAt ? 'Devuelta' : 'Completada'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <IconButton icon={ShirtIcon} label={expanded.has(s.id) ? 'Ocultar productos' : `Ver productos (${(s.items ?? []).length})`} variant="primary" onClick={() => toggleItems(s.id)} />
                    <IconButton
                      icon={PrinterIcon}
                      label={printingId === s.id ? 'Imprimiendo…' : 'Reimprimir'}
                      disabled={printingId === s.id}
                      onClick={() => handleReprint(s.id)}
                    />
                    <IconButton icon={EyeIcon} label="Ver ticket digital" variant="primary" onClick={() => setTicketSale(s)} />
                    {/* El anticipo no se cancela aquí: se cancela su apartado (ver SaleService#cancel). */}
                    {hasAction('SALES', 'DELETE') && s.status === 'COMPLETED' && !s.refundedAt && s.kind !== 'DEPOSIT' && (
                      isOpenTurn(s) ? (
                        canCancelTurn(s) && <IconButton icon={XCircleIcon} label="Cancelar" variant="danger" onClick={() => handleCancel(s)} />
                      ) : canRefundKind(s) && (() => {
                        const blocked = manager ? null : refundNeedsManager(s, user?.tienda)
                        // El span lleva el aviso: un botón deshabilitado no muestra su tooltip.
                        return <span title={blocked ?? undefined}><IconButton icon={UndoIcon} label={blocked ?? 'Devolver'} variant="warning" disabled={!!blocked} onClick={() => openRefund(s)} /></span>
                      })()
                    )}
                  </div>
                </td>
              </tr>
              {expanded.has(s.id) && (
                <tr className="bg-gray-50/70">
                  <td colSpan={8} className="p-0"><SaleItemsDetail detail={s} /></td>
                </tr>
              )}
              </Fragment>
            ))}
            {!loading && sales.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin ventas</td></tr>
            )}
          </tbody>
        </table>
        </div>

        {!linked && <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <span>Mostrar</span>
            <select
              className="input !w-auto py-1"
              value={size}
              onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>por página · {totalElements === 0 ? 'sin resultados' : `${from}–${to} de ${totalElements}`}</span>
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
        </div>}
      </div>

      {/* Cancelar (turno abierto) o devolver (turno cerrado): qué pasó con cada producto */}
      {refund && (() => {
        const isCancel = refundMode === 'cancel'
        const stockItems = returnItems(refund)
        const otherItems = (refund.items ?? []).filter((i) => !isStockItem(i))
        const reasonRequired = !isCancel || anyNotRestocked(stockItems, outcomes)
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
              <ModalCloseButton onClick={() => setRefund(null)} disabled={refundSaving} />
              <h3 className="text-lg font-bold mb-1 pr-8">{isCancel ? 'Cancelar' : 'Devolver'} venta #{refund.folio}</h3>
              <p className="text-xs text-gray-500 mb-4">
                {isCancel
                  ? <>La venta deja de contar en el turno ({fmt(refund.total)}).</>
                  : <>Esta venta es de un turno ya cerrado: no se modifica ese corte. Se devuelve la venta completa ({fmt(refund.total)}).</>}
              </p>

              {blockedNoCut && <NoOpenCutNotice action="registrar devoluciones en efectivo" />}
              {!isCancel && (
                <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${refund.paymentMethod === 'CASH' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                  {refund.paymentMethod === 'CASH'
                    ? <>💵 Saldrán <strong>{fmt(refund.total)}</strong> en efectivo de <strong>tu caja</strong> (necesitas tu corte abierto).</>
                    : <>{METHOD_LABELS[refund.paymentMethod]}: no sale efectivo de la caja, el reembolso se hace por el mismo medio de pago.</>}
                </div>
              )}

              {stockItems.length > 0 && (
                <div className="mb-4">
                  <ItemOutcomePicker items={stockItems} value={outcomes} onChange={(v) => { setOutcomes(v); setRefundErrors(({ reason, ...rest }) => rest) }} />
                </div>
              )}
              {otherItems.length > 0 && (
                <p className="text-xs text-gray-500 mb-4">
                  Sin inventario que regresar: {otherItems.map((i) => i.productName).join(', ')}.
                </p>
              )}

              <div>
                <label className="text-xs font-medium text-gray-600">
                  Motivo {reasonRequired ? <span className={refundErrors.reason ? 'text-red-600' : ''}>*</span> : <span className="text-gray-400">(opcional)</span>}
                </label>
                <textarea className="input" rows={2} value={refundReason}
                  onChange={(e) => { setRefundReason(e.target.value); setRefundErrors(({ reason, ...rest }) => rest) }} />
                <p className={`text-xs text-right ${refundReason.length > 300 ? 'text-red-600' : 'text-gray-400'}`}>{refundReason.length}/300</p>
                {refundErrors.reason && <p className="text-red-600 text-xs mt-1">{refundErrors.reason}</p>}
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <button type="button" className="btn-secondary" disabled={refundSaving} onClick={() => setRefund(null)}>Cerrar</button>
                <button type="button" className={isCancel ? 'btn-danger' : 'btn-primary'} disabled={refundSaving || blockedNoCut || (needsCut && myCut === undefined)} onClick={handleRefund}
                  title={blockedNoCut ? 'Abre un corte de caja para poder devolver en efectivo' : undefined}>
                  {refundSaving ? 'Guardando...' : isCancel ? 'Cancelar venta' : 'Registrar devolución'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      {ticketSale && (
        <ApartadoTicketModal sale={ticketSale} printing={printingId === ticketSale.id}
          onClose={() => setTicketSale(null)} onPrint={(id) => handleReprint(id)} />
      )}
    </div>
  )
}
