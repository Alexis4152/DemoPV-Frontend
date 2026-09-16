/**
 * Adaptador para el SDK de Openpay en el cliente (PCI-DSS SAQ A).
 *
 * Encapsula la configuración de la pasarela, la generación del identificador
 * de sesión antifraude (deviceSessionId) y la tokenización directa de tarjetas de crédito/débito
 * en promesas asíncronas para evitar el uso de callbacks y mantener el código limpio.
 */

const MERCHANT_ID = import.meta.env.VITE_OPENPAY_MERCHANT_ID || 'mnkt5l2z2or5x3r0v0uf'
const PUBLIC_KEY = import.meta.env.VITE_OPENPAY_PUBLIC_KEY || 'pk_dd6766e3510a45a58dbd5e20af39e247'
const IS_SANDBOX = import.meta.env.VITE_OPENPAY_SANDBOX !== 'false'

let isInitialized = false

/**
 * Inicializa el SDK de Openpay si aún no ha sido configurado.
 * @returns {boolean} true si el SDK está disponible y configurado.
 */
export function initOpenpay() {
  if (typeof window === 'undefined' || !window.OpenPay) {
    console.warn('[OpenPay] SDK de Openpay no detectado en window.OpenPay.')
    return false
  }

  if (!isInitialized) {
    window.OpenPay.setId(MERCHANT_ID)
    window.OpenPay.setApiKey(PUBLIC_KEY)
    window.OpenPay.setSandboxMode(IS_SANDBOX)
    isInitialized = true
  }

  return true
}

/**
 * Genera el Device Session ID antifraude mediante OpenPay.deviceData.setup().
 *
 * @returns {string} Identificador único de sesión antifraude para el dispositivo actual.
 */
export function getDeviceSessionId() {
  initOpenpay()
  if (window.OpenPay && window.OpenPay.deviceData) {
    try {
      return window.OpenPay.deviceData.setup()
    } catch (err) {
      console.warn('[OpenPay] Error al generar deviceSessionId:', err)
    }
  }
  // Fallback seguro en caso de bloqueo por adblocker para no congelar la app en desarrollo
  return 'device-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

/**
 * Mapeo de códigos de error de Openpay a mensajes claros y amigables para el usuario en español.
 */
const ERROR_DESCRIPTIONS = {
  1000: 'Servicio no disponible temporalmente. Intenta más tarde.',
  1001: 'El número de tarjeta es inválido o no cumple con el dígito verificador.',
  1002: 'El código de seguridad (CVV2) es inválido.',
  1003: 'La fecha de expiración es inválida o la tarjeta ya ha vencido.',
  1004: 'El nombre del titular de la tarjeta es obligatorio.',
  1005: 'El formato de la fecha de expiración es incorrecto.',
  2004: 'El número de dígitos de la tarjeta no es válido.',
  3001: 'La tarjeta fue declinada por el banco emisor. Contacta a tu banco.',
  3002: 'La tarjeta ha expirado.',
  3003: 'Fondos insuficientes en la tarjeta.',
  3004: 'Tarjeta rechazada por reporte de extravío o robo.',
  3005: 'Transacción rechazada por el sistema de prevención de fraudes.',
}

/**
 * Tokeniza los datos de la tarjeta directamente contra los servidores de Openpay.
 *
 * Cumplimiento PCI-DSS SAQ A: Los datos de la tarjeta nunca pasan ni se almacenan
 * en nuestro backend.
 *
 * @param {Object} params
 * @param {string} params.cardNumber - Número de la tarjeta (15 o 16 dígitos sin espacios).
 * @param {string} params.holderName - Nombre del titular tal como aparece en el plástico.
 * @param {string} params.expMonth - Mes de expiración (2 dígitos, ej. '05' o '12').
 * @param {string} params.expYear - Año de expiración (2 dígitos, ej. '26' o '28').
 * @param {string} params.cvv2 - Código de seguridad (3 dígitos, o 4 para AMEX).
 * @returns {Promise<string>} Promesa que resuelve con el token (sourceId) de la tarjeta.
 */
export function tokenizeCard({ cardNumber, holderName, expMonth, expYear, cvv2 }) {
  return new Promise((resolve, reject) => {
    if (!initOpenpay()) {
      reject(new Error('El SDK de Openpay no se encuentra cargado en el navegador.'))
      return
    }

    const cleanCardNumber = (cardNumber || '').replace(/\s+/g, '')
    const cleanMonth = (expMonth || '').trim().padStart(2, '0')
    const cleanYear = (expYear || '').trim().slice(-2)

    const cardData = {
      card_number: cleanCardNumber,
      holder_name: (holderName || '').trim(),
      expiration_year: cleanYear,
      expiration_month: cleanMonth,
      cvv2: (cvv2 || '').trim(),
    }

    window.OpenPay.token.create(
      cardData,
      (response) => {
        if (response?.data?.id) {
          resolve(response.data.id)
        } else {
          reject(new Error('Respuesta inesperada al tokenizar tarjeta con Openpay.'))
        }
      },
      (errorResponse) => {
        const errCode = errorResponse?.data?.error_code
        const rawDesc = errorResponse?.data?.description || errorResponse?.message
        const friendlyMsg = ERROR_DESCRIPTIONS[errCode] || rawDesc || 'Error al procesar la tarjeta con Openpay.'
        reject(new Error(friendlyMsg))
      }
    )
  })
}

/** Formatea número de tarjeta en bloques de 4 dígitos. */
export function formatCardNumber(value = '') {
  const digits = value.replace(/\D/g, '').slice(0, 16)
  const parts = []
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4))
  }
  return parts.join(' ')
}

/** Formatea fecha de expiración en MM/YY. */
export function formatExpiry(value = '') {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length > 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }
  return digits
}

/** Detecta la marca de la tarjeta según el BIN inicial. */
export function detectCardBrand(cardNumber = '') {
  const digits = cardNumber.replace(/\D/g, '')
  if (/^4/.test(digits)) return { brand: 'visa', label: 'Visa', icon: '💳' }
  if (/^(5[1-5]|2[2-7])/.test(digits)) return { brand: 'mastercard', label: 'Mastercard', icon: '💳' }
  if (/^3[47]/.test(digits)) return { brand: 'amex', label: 'American Express', icon: '💳' }
  if (/^6(011|5)/.test(digits)) return { brand: 'discover', label: 'Discover', icon: '💳' }
  return { brand: 'unknown', label: 'Tarjeta', icon: '💳' }
}

/** Valida el algoritmo de Luhn (Módulo 10). */
export function isValidLuhn(number = '') {
  const digits = number.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false

  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}
