import { useEffect, useState } from 'react'
import { getSaleTicketPdf, sendSaleTicket } from '../api/sales'
import { useNotify } from '../context/NotifyContext'
import useEscapeClose from '../hooks/useEscapeClose'
import ModalCloseButton from '../components/ModalCloseButton'
import { loadPayments } from './ApartadoPayments'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Nombre del ticket de un cobro del apartado: anticipo, abono, liquidación o pago. */
export function ticketLabel(p) {
  const kind = p.kind === 'DEPOSIT' ? (p.installment ? 'Abono' : 'Anticipo')
    : 'Liquidación'
  const state = p.status === 'CANCELLED' ? ' (cancelada)' : p.refundedAt ? ' (devuelta)' : ''
  return `${kind} · Venta #${p.folio}${state}`
}

/** Tickets de un apartado (uno por cobro), del más antiguo al más reciente. */
export async function apartadoTickets(apartado) {
  const rows = await loadPayments(apartado)
  return [...rows].sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt))
}

/**
 * Tickets de un apartado. En modo "print" se elige cuál reimprimir; en modo "view" se ve el
 * ticket digital (el PDF que llega por correo) y se puede reenviar o imprimir. Con `sale` en
 * lugar de `apartado`, muestra el ticket digital de esa sola venta (Historial de ventas).
 */
export default function ApartadoTicketModal({ apartado, sale, mode = 'view', onClose, onPrint, printing }) {
  const owner = apartado ?? sale
  const { notify } = useNotify()
  const [tickets, setTickets] = useState(null)
  const [selected, setSelected] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfError, setPdfError] = useState(false)
  const [email, setEmail] = useState(owner.customerEmail ?? '')
  const [emailError, setEmailError] = useState('')
  const [sending, setSending] = useState(false)
  useEscapeClose(true, () => !sending && onClose())

  useEffect(() => {
    let active = true
    const load = sale
      ? Promise.resolve([{ saleId: sale.id, folio: sale.folio, kind: sale.kind, installment: sale.installment, status: sale.status, refundedAt: sale.refundedAt, total: sale.total }])
      : apartadoTickets(apartado)
    load
      .then((rows) => {
        if (!active) return
        setTickets(rows)
        setSelected(rows.length ? rows[rows.length - 1].saleId : null)
      })
      .catch(() => { if (active) setTickets([]) })
    return () => { active = false }
  }, [apartado, sale])

  useEffect(() => {
    if (mode !== 'view' || !selected) return undefined
    let url = null
    let active = true
    setPdfUrl(null)
    setPdfError(false)
    getSaleTicketPdf(selected)
      .then((r) => {
        if (!active) return
        url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
        setPdfUrl(url)
      })
      .catch(() => { if (active) setPdfError(true) })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [mode, selected])

  async function send() {
    const to = email.trim()
    if (!to) return setEmailError('Captura un correo')
    if (!EMAIL_RE.test(to)) return setEmailError('Correo inválido')
    setSending(true)
    try {
      const res = await sendSaleTicket(selected, to)
      notify(res.data.message ?? `Ticket enviado a ${to}`, 'success')
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo enviar el ticket', 'error')
    } finally {
      setSending(false)
    }
  }

  const current = tickets?.find((t) => t.saleId === selected)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`relative bg-white rounded-xl shadow-xl w-full p-6 max-h-[95vh] overflow-y-auto ${mode === 'view' ? 'max-w-md' : 'max-w-sm'}`}>
        <ModalCloseButton onClick={() => !sending && onClose()} />
        <h3 className="text-lg font-bold mb-1 pr-8">
          {mode === 'view' ? 'Ticket digital' : 'Reimprimir ticket'} · {apartado ? `Apartado #${apartado.folio}` : `Venta #${sale.folio}`}
        </h3>
        <p className="text-sm text-gray-500 mb-4 [overflow-wrap:anywhere]">{apartado ? apartado.customerName : null}</p>

        {tickets === null && <p className="text-sm text-gray-500">Cargando…</p>}
        {tickets?.length === 0 && <p className="text-sm text-gray-500">Este apartado todavía no tiene tickets.</p>}

        {tickets?.length > 0 && mode === 'print' && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Elige qué ticket reimprimir</p>
            {tickets.map((t) => (
              <button key={t.saleId} type="button" disabled={printing}
                className="w-full flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg text-left hover:bg-gray-50 disabled:opacity-50"
                onClick={() => onPrint(t.saleId)}>
                <span className="text-sm font-medium text-gray-800">{ticketLabel(t)}</span>
                <span className="text-sm text-gray-600">{fmt(t.total)}</span>
              </button>
            ))}
          </div>
        )}

        {tickets?.length > 0 && mode === 'view' && (
          <>
            {tickets.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {tickets.map((t) => (
                  <button key={t.saleId} type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${t.saleId === selected ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => setSelected(t.saleId)}>
                    {ticketLabel(t)}
                  </button>
                ))}
              </div>
            )}
            <div className="border border-gray-200 rounded-lg bg-gray-50 h-[50vh] flex items-center justify-center overflow-hidden">
              {pdfError ? <p className="text-sm text-red-600 px-4 text-center">No se pudo cargar el ticket</p>
                : pdfUrl ? <iframe title={current ? ticketLabel(current) : 'Ticket'} src={pdfUrl} className="w-full h-full" />
                : <p className="text-sm text-gray-500">Cargando ticket…</p>}
            </div>
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-block mt-1 text-xs text-blue-600 hover:underline">
                Abrir en otra pestaña
              </a>
            )}

            <label htmlFor="ticket-email" className="block text-sm font-medium text-gray-700 mt-4 mb-1">Enviar por correo</label>
            <div className="flex gap-2">
              <input id="ticket-email" type="email" className="input flex-1 min-w-0" placeholder="cliente@gmail.com"
                value={email} maxLength={150}
                onChange={(e) => { setEmail(e.target.value); setEmailError('') }} />
              <button type="button" className="btn-primary shrink-0 disabled:opacity-40" disabled={sending || !selected} onClick={send}>
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
            {emailError && <p className="text-red-600 text-xs mt-1">{emailError}</p>}

            <div className="flex gap-2 justify-end pt-4">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={sending}>Cerrar</button>
              <button type="button" className="btn-secondary disabled:opacity-40" disabled={printing || !selected} onClick={() => onPrint(selected)}>
                {printing ? 'Imprimiendo…' : 'Imprimir'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
