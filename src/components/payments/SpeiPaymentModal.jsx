import { useState } from 'react'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

export default function SpeiPaymentModal({
  isOpen,
  onClose,
  paymentDetails,
  amount,
  orderId,
}) {
  const [copiedClabe, setCopiedClabe] = useState(false)
  const [copiedAmount, setCopiedAmount] = useState(false)

  if (!isOpen || !paymentDetails) return null

  const clabe = paymentDetails?.clabe || 'N/A'
  const bank = paymentDetails?.bank || 'STP'

  function handleCopyClabe() {
    if (!clabe) return
    navigator.clipboard.writeText(clabe)
    setCopiedClabe(true)
    setTimeout(() => setCopiedClabe(false), 3000)
  }

  function handleCopyAmount() {
    navigator.clipboard.writeText(amount.toFixed(2))
    setCopiedAmount(true)
    setTimeout(() => setCopiedAmount(false), 3000)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:p-0 print:bg-white">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[95vh] overflow-y-auto print:shadow-none print:w-full print:max-w-none">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Transferencia Interbancaria SPEI</h3>
              <p className="text-xs text-gray-500">Transfiere desde tu banca móvil de cualquier banco mexicano</p>
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
          <p className="text-xs text-gray-500">Monto exacto a transferir:</p>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <p className="text-3xl font-black text-purple-700">{fmt(amount)}</p>
            <button
              type="button"
              onClick={handleCopyAmount}
              className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700 hover:bg-purple-200 print:hidden"
            >
              {copiedAmount ? '✓' : 'Copiar'}
            </button>
          </div>
          {orderId && <p className="text-xs text-gray-400 mt-1">Concepto / Folio: {orderId}</p>}
        </div>

        {/* Datos de transferencia */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cuenta CLABE Única (18 dígitos)</p>
            <div className="flex items-center justify-between mt-1 bg-white p-2.5 rounded-lg border border-gray-200">
              <span className="text-lg font-mono font-bold text-gray-900 tracking-wider select-all">{clabe}</span>
              <button
                type="button"
                onClick={handleCopyClabe}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors print:hidden"
              >
                {copiedClabe ? '¡Copiado! ✓' : 'Copiar'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-white p-2.5 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 font-medium">Banco Receptor</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{bank}</p>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 font-medium">Beneficiario</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">Openpay / Boutique</p>
            </div>
          </div>
        </div>

        {/* Instrucciones */}
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg p-3 mb-5 space-y-1">
          <p className="font-semibold">ℹ️ Pasos para realizar la transferencia:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Abre la aplicación de tu banco e ingresa a <strong>Transferencias / SPEI</strong>.</li>
            <li>Registra la cuenta <strong>CLABE</strong> de 18 dígitos indicada arriba.</li>
            <li>En Banco Receptor selecciona <strong>{bank}</strong>.</li>
            <li>Transfiere la cantidad <strong>exacta</strong> para que el pago se acredite automáticamente en segundos.</li>
          </ol>
        </div>

        {/* Acciones */}
        <div className="flex gap-3 print:hidden">
          <button
            type="button"
            className="btn-secondary w-1/2 text-sm py-2.5 flex items-center justify-center gap-1.5"
            onClick={() => window.print()}
          >
            <span>🖨️</span>
            <span>Imprimir Datos</span>
          </button>
          <button
            type="button"
            className="btn-primary w-1/2 text-sm py-2.5"
            onClick={onClose}
          >
            Finalizar
          </button>
        </div>
      </div>
    </div>
  )
}
