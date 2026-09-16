import { useState } from 'react'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

export default function StorePaynetModal({
  isOpen,
  onClose,
  paymentDetails,
  amount,
  orderId,
}) {
  const [copied, setCopied] = useState(false)

  if (!isOpen || !paymentDetails) return null

  const reference = paymentDetails?.reference || 'N/A'
  const barcodeUrl = paymentDetails?.barcodeUrl

  function handleCopyReference() {
    if (!reference) return
    navigator.clipboard.writeText(reference)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  function handlePrintSlip() {
    window.print()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:p-0 print:bg-white">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[95vh] overflow-y-auto print:shadow-none print:w-full print:max-w-none">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏪</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Ficha de Pago en Tiendas (Paynet)</h3>
              <p className="text-xs text-gray-500">Paga en efectivo en tiendas de conveniencia afiliadas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Resumen del cobro */}
        <div className="text-center py-2 border-b border-gray-100 mb-4">
          <p className="text-xs text-gray-500">Total a pagar:</p>
          <p className="text-3xl font-black text-purple-700">{fmt(amount)}</p>
          {orderId && <p className="text-xs text-gray-400 mt-1">Folio / Orden: {orderId}</p>}
        </div>

        {/* Código de barras y referencia */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center mb-4 space-y-3">
          {barcodeUrl ? (
            <div className="flex justify-center bg-white p-3 rounded-lg border border-gray-100">
              <img src={barcodeUrl} alt="Código de barras Paynet" className="max-h-24 object-contain" />
            </div>
          ) : (
            <div className="py-4 text-sm text-gray-400">Código de barras no disponible</div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Número de Referencia</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl font-mono font-bold text-gray-900 tracking-wider select-all">{reference}</span>
              <button
                type="button"
                onClick={handleCopyReference}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors print:hidden"
                title="Copiar referencia"
              >
                {copied ? '¡Copiado! ✓' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>

        {/* Instrucciones y tiendas */}
        <div className="space-y-3 text-xs text-gray-600 mb-5">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">
            <p className="font-semibold mb-1">📌 Instrucciones para el cajero de la tienda:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Menciona que vas a realizar un pago de servicio <strong>Paynet</strong>.</li>
              <li>Presenta el código de barras o dicta el número de referencia.</li>
              <li>Conserva el comprobante emitido por la tienda.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold text-gray-700 mb-1">Tiendas afiliadas autorizadas:</p>
            <p className="text-gray-500">
              7-Eleven, Farmacias del Ahorro, Extra, Walmart, Bodega Aurrera, Sam's Club, Circle K, Waldo's, Kiosko, El Asturiano y más.
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-3 print:hidden">
          <button
            type="button"
            className="btn-secondary w-1/2 text-sm py-2.5 flex items-center justify-center gap-1.5"
            onClick={handlePrintSlip}
          >
            <span>🖨️</span>
            <span>Imprimir Ficha</span>
          </button>
          <button
            type="button"
            className="btn-primary w-1/2 text-sm py-2.5"
            onClick={onClose}
          >
            Entendido / Finalizar
          </button>
        </div>
      </div>
    </div>
  )
}
