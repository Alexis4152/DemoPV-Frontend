import { useState, useEffect } from 'react'
import { getPaymentByOrderId } from '../../api/payments'
import { cancelSaleWithRefund } from '../../api/sales'
import { getFriendlyErrorMessage } from '../../utils/openpayErrors'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

export default function RefundModal({ isOpen, onClose, sale, onSuccess }) {
  const [loadingPayment, setLoadingPayment] = useState(false)
  const [paymentInfo, setPaymentInfo] = useState(null)
  const [refundGateway, setRefundGateway] = useState(true)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const isCard = sale?.paymentMethod === 'CARD'

  useEffect(() => {
    if (isOpen && sale) {
      setReason('')
      setErrorMsg('')
      setPaymentInfo(null)
      setRefundGateway(isCard)

      if (isCard && sale.orderId) {
        setLoadingPayment(true)
        getPaymentByOrderId(sale.orderId)
          .then((res) => {
            setPaymentInfo(res.data)
          })
          .catch((err) => {
            // No bloqueante: la venta puede cancelarse aún si no se puede consultar el pago previamente
            console.warn('No se pudo precargar la información del pago:', err)
          })
          .finally(() => {
            setLoadingPayment(false)
          })
      }
    }
  }, [isOpen, sale, isCard])

  if (!isOpen || !sale) return null

  const isAlreadyRefunded = paymentInfo?.status === 'REFUNDED'
  const isPartiallyRefunded = paymentInfo?.status === 'PARTIALLY_REFUNDED'

  async function handleConfirm(e) {
    e.preventDefault()
    setErrorMsg('')

    if (refundGateway && (!reason || reason.trim().length < 5)) {
      setErrorMsg('Debes ingresar un motivo descriptivo para el reembolso (mínimo 5 caracteres).')
      return
    }

    setSubmitting(true)
    try {
      await cancelSaleWithRefund(sale.id, {
        refundPayment: refundGateway,
        reason: reason.trim() || 'Cancelación de venta en mostrador',
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setErrorMsg(getFriendlyErrorMessage(err, 'No fue posible completar la cancelación de la venta.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[95vh] overflow-y-auto">
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Cancelar Venta #{sale.id}</h3>
              <p className="text-xs text-gray-500">Reversión de stock y procesamiento de reembolso</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 text-lg disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {/* Resumen de la Venta */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">Total de la venta:</span>
            <span className="font-bold text-gray-900 text-base">{fmt(sale.total)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Cliente:</span>
            <span className="font-medium text-gray-700">{sale.customerName || 'Venta de mostrador'}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Método de pago:</span>
            <span className="font-semibold text-purple-700">{sale.paymentMethod}</span>
          </div>
          {sale.orderId && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Folio / Orden:</span>
              <span className="font-mono text-gray-600">{sale.orderId}</span>
            </div>
          )}
        </div>

        {/* Estado en Openpay si es con tarjeta */}
        {isCard && (
          <div className="mb-4">
            {loadingPayment ? (
              <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 flex items-center gap-2 text-xs text-purple-700">
                <span className="animate-spin inline-block">⏳</span>
                <span>Verificando estado de la transacción en Openpay...</span>
              </div>
            ) : paymentInfo ? (
              <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-200 text-xs space-y-1 text-purple-900">
                <div className="flex justify-between">
                  <span className="font-medium">Estatus en pasarela:</span>
                  <span className="font-bold uppercase px-2 py-0.5 rounded bg-purple-200 text-purple-800">
                    {paymentInfo.status}
                  </span>
                </div>
                {paymentInfo.openpayTransactionId && (
                  <div className="flex justify-between">
                    <span>ID Transacción:</span>
                    <span className="font-mono">{paymentInfo.openpayTransactionId}</span>
                  </div>
                )}
                {paymentInfo.authorizationCode && (
                  <div className="flex justify-between">
                    <span>Cód. Autorización:</span>
                    <span className="font-mono">{paymentInfo.authorizationCode}</span>
                  </div>
                )}
                {isPartiallyRefunded && (
                  <div className="flex justify-between text-amber-700 font-semibold pt-1">
                    <span>Reembolsado previamente:</span>
                    <span>{fmt(paymentInfo.refundedAmount)}</span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Banner de error si ocurre fallo */}
        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
            <span className="text-base leading-none">❌</span>
            <div>
              <p className="font-semibold">No se pudo procesar la solicitud:</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleConfirm} className="space-y-4">
          {/* Opción de procesar reembolso en pasarela */}
          {isCard && (
            <div className="p-3 rounded-xl border border-gray-200 bg-gray-50/70">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={refundGateway}
                  onChange={(e) => setRefundGateway(e.target.checked)}
                  disabled={submitting || isAlreadyRefunded}
                  className="mt-1 h-4 w-4 rounded text-purple-600 focus:ring-purple-500 border-gray-300"
                />
                <div className="text-xs">
                  <span className="font-semibold text-gray-900 block">
                    Reembolsar en Openpay ({fmt(sale.total)})
                  </span>
                  <span className="text-gray-500 block mt-0.5">
                    Envía la instrucción bancaria a Openpay para devolver el dinero a la tarjeta del cliente.
                  </span>
                  {isAlreadyRefunded && (
                    <span className="text-amber-600 font-semibold block mt-1">
                      ⚠️ Esta transacción ya fue reembolsada totalmente en Openpay.
                    </span>
                  )}
                </div>
              </label>
            </div>
          )}

          {/* Advertencia de inventario */}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
            <span>📦</span>
            <span>Se revertirá automáticamente el stock de todos los artículos vendidos.</span>
          </div>

          {/* Motivo obligatorio si se procesa reembolso */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Motivo de la cancelación / reembolso {refundGateway && <span className="text-red-500">*</span>}
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Producto defectuoso, cambio de opinión del cliente, etc."
              maxLength={250}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none disabled:bg-gray-100"
            />
            <div className="flex justify-between items-center text-[11px] text-gray-400 mt-1">
              <span>{refundGateway ? 'Requerido para auditoría y pasarela bancaria.' : 'Opcional.'}</span>
              <span>{reason.length}/250</span>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={submitting || (refundGateway && isAlreadyRefunded)}
              className="px-5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="animate-spin inline-block">⏳</span>
                  <span>Procesando...</span>
                </>
              ) : (
                <span>Confirmar Cancelación</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
