import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getApartados, confirmApartado, completeApartado, cancelApartado } from '../api/apartados'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import { printSaleTicket } from '../utils/printer'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const STATUS_LABELS = {
  PENDING: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  ACTIVE: { label: 'Activo', color: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Completado', color: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelado', color: 'bg-gray-100 text-gray-600' },
  EXPIRED: { label: 'Vencido', color: 'bg-red-100 text-red-700' },
}
const PAGE_SIZES = [10, 20, 50]
const STATUS_VALUES = Object.keys(STATUS_LABELS)

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
  const { user } = useAuth()
  const { notify, confirmDialog } = useNotify()
  const [searchParams] = useSearchParams()
  const tienda = user?.tienda
  const discountsDisabled = tienda?.maxApartadoDiscountAmount == null && tienda?.maxApartadoDiscountPercent == null

  const [status, setStatus] = useState(() => {
    const fromUrl = searchParams.get('status')
    return STATUS_VALUES.includes(fromUrl) ? fromUrl : ''
  })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)

  const [confirmModal, setConfirmModal] = useState(null) // apartado en confirmación
  const [confirmHours, setConfirmHours] = useState(24)
  const [confirmDiscounts, setConfirmDiscounts] = useState({}) // itemId -> string

  const [completeModal, setCompleteModal] = useState(null) // apartado a completar
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [amountReceived, setAmountReceived] = useState('')
  // 'physical': imprime en la impresora térmica al completar, igual que POS.jsx. 'digital':
  // no imprime nada, el backend manda el ticket en PDF por correo — exige capturar uno
  // (`completeEmail`) si el apartado no traía ya el del cliente.
  const [ticketType, setTicketType] = useState('physical')
  const [completeEmail, setCompleteEmail] = useState('')
  const [printing, setPrinting] = useState(false)

  const [cancelModal, setCancelModal] = useState(null) // apartado a cancelar
  const [cancelReason, setCancelReason] = useState('')

  function load() {
    setLoading(true)
    getApartados({ status: status || undefined, from: from || undefined, to: to || undefined, q: search.trim() || undefined, page, size })
      .then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
      .finally(() => setLoading(false))
  }

  // Debounce de 250ms sobre el texto (mismo patrón que Inventory.jsx/POS.jsx), para no
  // pegarle a la API en cada tecla; estado/fechas/página disparan de inmediato.
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [status, from, to, search, page, size])

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

  async function handleConfirm(e) {
    e.preventDefault()
    if (!(await confirmDialog(`¿Confirmar el apartado de "${confirmModal.customerName}"? Se descontará el stock.`, { confirmText: 'Confirmar apartado', danger: false }))) return
    try {
      const items = confirmModal.items.map((i) => ({ itemId: i.id, discount: Number(confirmDiscounts[i.id]) || 0 }))
      await confirmApartado(confirmModal.id, { durationHours: Number(confirmHours) || 24, items })
      notify('Apartado confirmado', 'success')
      setConfirmModal(null)
      load()
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo confirmar', 'error')
    }
  }

  function openComplete(apartado) {
    setCompleteModal(apartado)
    setPaymentMethod('CASH')
    setAmountReceived('')
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

  async function handleComplete(e) {
    e.preventDefault()
    if (digitalEmailMissing) return
    if (!(await confirmDialog(`¿Registrar el cobro de "${completeModal.customerName}" por ${fmt(completeModal.total)}?`, { confirmText: 'Completar', danger: false }))) return
    try {
      const res = await completeApartado(completeModal.id, {
        paymentMethod,
        amountReceived: paymentMethod === 'CASH' ? Number(amountReceived) : undefined,
        customerEmail: completeEmail.trim() || undefined,
      })
      const saleId = res.data.data?.saleId
      setCompleteModal(null)
      load()
      if (ticketType === 'digital') {
        notify(`Apartado completado — ticket enviado a ${completeEmail.trim()}`, 'success')
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
  }

  async function handleCancelSubmit(e) {
    e.preventDefault()
    const warn = cancelModal.status === 'ACTIVE' ? ' Se restituirá el stock.' : ''
    if (!(await confirmDialog(`¿Cancelar el apartado de "${cancelModal.customerName}"?${warn}`, { confirmText: 'Cancelar apartado', danger: true }))) return
    try {
      await cancelApartado(cancelModal.id, { reason: cancelReason.trim() || undefined })
      notify('Apartado cancelado', 'success')
      setCancelModal(null)
      load()
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo cancelar', 'error')
    }
  }

  const completeTotal = completeModal?.total ?? 0
  const amountReceivedNum = amountReceived === '' ? null : Number(amountReceived)
  const change = paymentMethod === 'CASH' && amountReceivedNum != null ? amountReceivedNum - completeTotal : null
  // Ticket digital exige correo (igual que en POS.jsx) — a diferencia de POS, aquí suele
  // venir prellenado del que el cliente ya dejó al solicitar el apartado.
  const digitalEmailMissing = ticketType === 'digital' && !completeEmail.trim()
  const canComplete = (paymentMethod !== 'CASH' || (amountReceivedNum != null && amountReceivedNum >= completeTotal)) && !digitalEmailMissing

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Apartados</h2>

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
        {(status || from || to || search) && (
          <button
            type="button" className="btn-secondary text-sm"
            onClick={() => { setStatus(''); setFrom(''); setTo(''); setSearch(''); setPage(0) }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Cliente', 'Productos', 'Total', 'Estado', 'Solicitado', 'Vence', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {apartados.map((a) => {
                const st = STATUS_LABELS[a.status] ?? { label: a.status, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{a.customerName}</p>
                      <p className="text-xs text-gray-400">{a.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.items.map((i) => `${Number(i.quantity)} x ${i.productName}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{fmt(a.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(a.requestedAt)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{a.status === 'ACTIVE' ? fmtDate(a.expiresAt) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end whitespace-nowrap">
                        {a.status === 'PENDING' && (
                          <button className="text-blue-600 hover:underline text-xs" onClick={() => openConfirm(a)}>Confirmar</button>
                        )}
                        {a.status === 'ACTIVE' && (
                          <button className="text-purple-600 hover:underline text-xs" onClick={() => openComplete(a)}>Completar</button>
                        )}
                        {(a.status === 'PENDING' || a.status === 'ACTIVE') && (
                          <button className="text-red-500 hover:underline text-xs" onClick={() => openCancel(a)}>Cancelar</button>
                        )}
                        {a.status === 'COMPLETED' && (
                          <>
                            <span className="text-xs text-gray-400">Venta #{a.saleId}</span>
                            <button className="text-purple-600 hover:underline text-xs disabled:opacity-40" disabled={printing} onClick={() => printTicket(a.saleId)}>🖨️ Reimprimir</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-1">Confirmar apartado</h3>
            <p className="text-sm text-gray-500 mb-4">{confirmModal.customerName} — {confirmModal.customerPhone}</p>
            <form onSubmit={handleConfirm} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Horas de vigencia</label>
                <input className="input" type="number" min="1" value={confirmHours} onChange={(e) => setConfirmHours(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Productos</label>
                {confirmModal.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg p-2">
                    <div className="text-sm">
                      <p className="font-medium text-gray-800">{item.productName}</p>
                      <p className="text-xs text-gray-400">{Number(item.quantity)} x {fmt(item.unitPrice)}</p>
                      {Number(item.discount) > 0 && (
                        <p className="text-xs text-purple-600">Ya trae oferta pública: -{fmt(item.discount)}</p>
                      )}
                    </div>
                    {discountsDisabled ? (
                      <span className="text-xs text-gray-400 italic" title="El administrador debe configurar un límite de descuento de apartados en Datos de la tienda">No disponible</span>
                    ) : (
                      <input
                        className="input !w-24 !py-1 text-xs" type="number" min="0" step="0.01" placeholder="Descuento $"
                        value={confirmDiscounts[item.id] ?? ''}
                        onChange={(e) => setConfirmDiscounts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    )}
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-1">Completar apartado</h3>
            <p className="text-sm text-gray-500 mb-4">{completeModal.customerName} — Total: {fmt(completeModal.total)}</p>
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
                <input
                  className="input mt-1" type="email" placeholder="cliente@correo.com"
                  required={ticketType === 'digital'}
                  value={completeEmail}
                  onChange={(e) => setCompleteEmail(e.target.value)}
                />
                {digitalEmailMissing && (
                  <p className="text-xs text-red-500 mt-1">El ticket digital se manda por correo, captura uno para poder completar.</p>
                )}
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
                  <input className="input" type="number" min="0" step="0.01" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} />
                  {amountReceivedNum != null && (
                    <p className={`text-sm mt-1 ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {change >= 0 ? `Cambio: ${fmt(change)}` : `Falta ${fmt(completeTotal - amountReceivedNum)}`}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setCompleteModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary disabled:opacity-40" disabled={!canComplete}>Completar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-1">Cancelar apartado</h3>
            <p className="text-sm text-gray-500 mb-4">
              {cancelModal.customerName}{cancelModal.status === 'ACTIVE' ? ' — se restituirá el stock.' : ''}
            </p>
            <form onSubmit={handleCancelSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Motivo para el cliente (opcional)</label>
                <textarea
                  className="input" rows={3} autoFocus
                  placeholder="Ej. Ya no tenemos disponible el color que apartaste..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {cancelModal.customerEmail
                    ? `Se le avisará por correo a ${cancelModal.customerEmail}, con este motivo si lo escribes.${cancelModal.customerPhone ? ` O lo puedes contactar al número ${cancelModal.customerPhone}.` : ''}`
                    : cancelModal.customerPhone
                      ? `El cliente no dejó correo al solicitarlo, se le puede avisar por llamada al número que dejó registrado: ${cancelModal.customerPhone}.`
                      : 'El cliente no dejó correo ni teléfono al solicitarlo, no se le podrá avisar.'}
                </p>
              </div>
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
