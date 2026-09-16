import { useState, useEffect } from 'react'
import {
  tokenizeCard,
  getDeviceSessionId,
  formatCardNumber,
  formatExpiry,
  detectCardBrand,
  isValidLuhn,
} from '../../utils/openpay'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

export default function CardPaymentModal({
  isOpen,
  onClose,
  amount,
  initialCustomer = {},
  onSubmitPayment,
  loading = false,
  errorMessage = '',
}) {
  const [cardNumber, setCardNumber] = useState('')
  const [holderName, setHolderName] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')

  // Datos del cliente requeridos por Openpay (CustomerRequest)
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [localError, setLocalError] = useState('')
  const [isTokenizing, setIsTokenizing] = useState(false)

  // Pre-poblar datos de cliente si vienen del POS
  useEffect(() => {
    if (isOpen) {
      const parts = (initialCustomer.name || '').trim().split(' ')
      setName(parts[0] || '')
      setLastName(parts.slice(1).join(' ') || (parts[0] ? 'Cliente' : ''))
      setEmail(initialCustomer.email || '')
      setPhone(initialCustomer.phone || '')
      setCardNumber('')
      setHolderName(initialCustomer.name || '')
      setExpiry('')
      setCvv('')
      setLocalError('')
    }
  }, [isOpen, initialCustomer])

  if (!isOpen) return null

  const brandInfo = detectCardBrand(cardNumber)

  async function handleSubmit(e) {
    e.preventDefault()
    setLocalError('')

    const cleanCard = cardNumber.replace(/\s+/g, '')
    if (cleanCard.length < 15 || cleanCard.length > 16) {
      setLocalError('El número de tarjeta debe tener 15 o 16 dígitos.')
      return
    }

    if (!isValidLuhn(cleanCard)) {
      setLocalError('El número de tarjeta no es válido (algoritmo de verificación).')
      return
    }

    const expiryParts = expiry.split('/')
    if (expiryParts.length !== 2 || expiryParts[0].length !== 2 || expiryParts[1].length !== 2) {
      setLocalError('La fecha de vencimiento debe tener formato MM/AA (ej. 12/28).')
      return
    }

    const monthNum = parseInt(expiryParts[0], 10)
    if (monthNum < 1 || monthNum > 12) {
      setLocalError('El mes de vencimiento debe estar entre 01 y 12.')
      return
    }

    if (cvv.length < 3 || cvv.length > 4) {
      setLocalError('El código de seguridad CVV debe tener 3 o 4 dígitos.')
      return
    }

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setLocalError('El teléfono de contacto debe tener al menos 10 dígitos.')
      return
    }

    setIsTokenizing(true)
    try {
      // 1. Obtener identificador antifraude del dispositivo
      const deviceSessionId = getDeviceSessionId()

      // 2. Tokenizar la tarjeta directamente contra Openpay (PCI-DSS)
      const sourceId = await tokenizeCard({
        cardNumber: cleanCard,
        holderName,
        expMonth: expiryParts[0],
        expYear: expiryParts[1],
        cvv2: cvv,
      })

      // 3. Pasar al orquestador del POS para llamar a POST /api/v1/payments
      await onSubmitPayment({
        sourceId,
        deviceSessionId,
        customer: {
          name: name.trim() || 'Cliente',
          lastName: lastName.trim() || 'Mostrador',
          email: email.trim() || 'cliente@tienda.com',
          phoneNumber: phone.replace(/\D/g, '').slice(0, 15),
        },
      })
    } catch (err) {
      setLocalError(err.message || 'Error al procesar el pago con la tarjeta.')
    } finally {
      setIsTokenizing(false)
    }
  }

  const isBusy = isTokenizing || loading

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💳</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Cobro con Tarjeta (Openpay)</h3>
              <p className="text-xs text-gray-500">Procesamiento seguro con tokenización directa</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="text-gray-400 hover:text-gray-600 text-lg disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {/* Monto a pagar */}
        <div className="bg-purple-50/70 border border-purple-100 rounded-xl p-3 mb-4 flex justify-between items-center">
          <span className="text-sm font-medium text-purple-900">Total a liquidar:</span>
          <span className="text-xl font-black text-purple-700">{fmt(amount)}</span>
        </div>

        {(localError || errorMessage) && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 mb-4 flex items-start gap-2">
            <span className="text-base">⚠️</span>
            <span>{localError || errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Datos del plástico */}
          <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100 space-y-3">
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Datos de la Tarjeta</h4>
            
            <div>
              <label className="text-xs font-medium text-gray-600 flex justify-between">
                <span>Número de Tarjeta</span>
                <span className="font-semibold text-purple-700">{brandInfo.label}</span>
              </label>
              <div className="relative mt-1">
                <input
                  className="input pr-10 font-mono tracking-wider"
                  type="text"
                  placeholder="4111 1111 1111 1111"
                  maxLength="19"
                  required
                  disabled={isBusy}
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                />
                <span className="absolute right-3 top-2.5 text-lg pointer-events-none">{brandInfo.icon}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">Nombre del Titular (como aparece en la tarjeta)</label>
              <input
                className="input mt-1 uppercase"
                type="text"
                placeholder="JUAN PEREZ"
                required
                disabled={isBusy}
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Expiración (MM/AA)</label>
                <input
                  className="input mt-1 font-mono text-center"
                  type="text"
                  placeholder="MM/AA"
                  maxLength="5"
                  required
                  disabled={isBusy}
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">CVV / CVC</label>
                <input
                  className="input mt-1 font-mono text-center"
                  type="password"
                  placeholder="123"
                  maxLength="4"
                  required
                  disabled={isBusy}
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
            </div>
          </div>

          {/* Datos del cliente para prevención de fraudes */}
          <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100 space-y-3">
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Datos del Cliente (Antifraude)</h4>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Nombre(s) *</label>
                <input
                  className="input mt-1"
                  required
                  disabled={isBusy}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Juan"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Apellido(s) *</label>
                <input
                  className="input mt-1"
                  required
                  disabled={isBusy}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Pérez"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Correo Electrónico *</label>
                <input
                  className="input mt-1"
                  type="email"
                  required
                  disabled={isBusy}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@correo.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Teléfono (10 dígitos) *</label>
                <input
                  className="input mt-1 font-mono"
                  type="tel"
                  required
                  disabled={isBusy}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="5512345678"
                  maxLength="15"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <button
              type="button"
              className="btn-secondary w-1/3 text-sm py-2.5"
              onClick={onClose}
              disabled={isBusy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary w-2/3 text-sm py-2.5 flex items-center justify-center gap-2"
              disabled={isBusy}
            >
              {isBusy ? (
                <>
                  <span className="animate-spin text-base">⏳</span>
                  <span>Procesando pago...</span>
                </>
              ) : (
                <>
                  <span>🔒</span>
                  <span>Confirmar Cargo de {fmt(amount)}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
