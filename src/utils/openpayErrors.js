/**
 * Diccionario centralizado de códigos de error de la pasarela Openpay
 * y traductor semántico para la interfaz de usuario del POS.
 */
export const OPENPAY_ERROR_MESSAGES = {
  1000: 'Error interno en los servidores de Openpay. Intenta nuevamente en unos minutos.',
  1001: 'La solicitud contiene datos inválidos o incompletos para procesar la devolución.',
  1002: 'Error de autenticación con la pasarela de pagos. Contacta al administrador.',
  1003: 'La operación no se pudo completar por problemas con el registro de la transacción.',
  1004: 'El servicio de Openpay no se encuentra disponible temporalmente. Intenta más tarde.',
  1005: 'La transacción no existe en el sistema de la pasarela Openpay.',
  1006: 'Conflicto con el identificador de la transacción en la pasarela.',
  1007: 'La transferencia de fondos del reembolso fue rechazada por la entidad bancaria.',
  1008: 'La cuenta comercial en Openpay asociada a la transacción se encuentra inactiva.',
  1009: 'El tamaño de los datos enviados excede el límite permitido por la pasarela.',
  1010: 'Configuración incorrecta de llaves de la pasarela de pagos.',
  1011: 'Operación no soportada para este tipo de recurso en Openpay.',
  1012: 'El monto solicitado excede el límite máximo permitido para la transacción.',
  1013: 'El monto a reembolsar es inferior al mínimo permitido ($0.01).',
  1014: 'Fondos insuficientes en la cuenta del comercio en Openpay para procesar el reembolso.',
  1015: 'El plazo permitido para reembolsar esta transacción ha expirado (límite bancario excedido).',
  1016: 'Esta transacción ya ha sido reembolsada previamente en su totalidad.',
  1017: 'El monto a reembolsar supera el saldo disponible restante de la transacción.',
  1018: 'Este método de pago (Tienda/SPEI) no admite reembolsos automáticos por tarjeta. Realiza la devolución de forma manual.',
  1020: 'Se ha alcanzado el límite máximo de reembolsos parciales permitidos para este cargo.',
  2001: 'La cuenta bancaria receptora no existe o está inactiva.',
  2003: 'El cliente asociado no existe en los registros de Openpay.',
  3001: 'Tarjeta declinada por el banco emisor.',
  3002: 'La tarjeta utilizada se encuentra expirada.',
  3003: 'Fondos insuficientes en la cuenta bancaria.',
  3004: 'Tarjeta bloqueada o reportada como robada.',
  3005: 'Transacción rechazada por el sistema antifraude del banco.',
  4001: 'La cuenta de Openpay se encuentra suspendida o bloqueada por seguridad.',
}

/**
 * Extrae y traduce un error de Axios/Spring Boot al mensaje más amigable posible para el usuario.
 *
 * @param {Error|Object} err - Error lanzado por Axios o llamada HTTP.
 * @param {string} [defaultMessage='Error al procesar la operación'] - Fallback genérico.
 * @returns {string} Mensaje descriptivo para toasts o alertas visuales.
 */
export function getFriendlyErrorMessage(err, defaultMessage = 'Error al procesar la operación') {
  if (!err) return defaultMessage

  // Errores de red o timeout
  if (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout')) {
    return 'Tiempo de espera agotado al conectar con el servidor. Verifica tu conexión a internet.'
  }
  if (!err.response && (err.message === 'Network Error' || !navigator.onLine)) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión a internet.'
  }

  const { status, data } = err.response || {}

  // 1. Prioridad: Código numérico de error retornado por Openpay
  const openpayCode = data?.errorCode || data?.openpayErrorCode
  if (openpayCode && OPENPAY_ERROR_MESSAGES[openpayCode]) {
    return OPENPAY_ERROR_MESSAGES[openpayCode]
  }

  // 2. Errores HTTP de dominio POS / Spring Security
  if (status === 403) {
    return 'Acceso denegado: Solo administradores pueden autorizar cancelaciones o reembolsos.'
  }
  if (status === 404) {
    return data?.message || 'El registro o la transacción de pago no fue encontrada.'
  }
  if (status === 409) {
    return data?.message || 'La transacción no se encuentra en un estado elegible para reembolso.'
  }
  if (status === 400) {
    return data?.message || 'Los datos de la solicitud son inválidos.'
  }
  if (status === 422) {
    return data?.message || 'La operación de pago/reembolso fue declinada por la entidad financiera.'
  }
  if (status === 502) {
    return data?.message || 'Error de comunicación con la pasarela de pagos Openpay.'
  }

  // 3. Mensaje enviado explícitamente por el backend en ApiResponse.message o ProblemDetail.detail
  if (data?.message) return data.message
  if (data?.detail) return data.detail

  return err.message || defaultMessage
}
