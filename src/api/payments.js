import api from './axios'

/**
 * Cliente HTTP para los servicios de pasarela Openpay del backend (/api/v1/payments).
 *
 * Utiliza la instancia central de Axios con interceptores de autorización JWT y captura
 * de errores RFC 7807 (Problem Details).
 */

/**
 * Crea un cargo o intención de pago en la pasarela Openpay.
 *
 * @param {Object} data - Datos de la solicitud de pago.
 * @param {string} data.orderId - Identificador único de orden (ej. ORD-2026-XXXX).
 * @param {number} data.amount - Monto a cobrar.
 * @param {string} data.currency - Código ISO de moneda ('MXN', 'USD', 'COP').
 * @param {'CARD'|'STORE'|'SPEI'} data.method - Método de pago.
 * @param {string} data.description - Descripción del concepto.
 * @param {string} data.deviceSessionId - Identificador de sesión antifraude de Openpay.
 * @param {string} [data.sourceId] - Token de tarjeta (obligatorio si method === 'CARD').
 * @param {Object} data.customer - Datos de contacto del cliente (name, lastName, email, phoneNumber).
 * @returns {Promise} AxiosResponse con PaymentResponse.
 */
export const createPayment = (data) => api.post('/v1/payments', data)

/**
 * Consulta el estatus e información actualizada de una transacción de pago por su ID interno.
 *
 * @param {string} paymentId - UUID de la transacción interna.
 * @returns {Promise} AxiosResponse con PaymentResponse.
 */
export const getPaymentStatus = (paymentId) => api.get(`/v1/payments/${paymentId}`)

/**
 * Solicita un reembolso total o parcial de un pago completado (restringido a ADMIN).
 *
 * @param {string} paymentId - UUID de la transacción interna.
 * @param {Object} data - Datos del reembolso.
 * @param {number} data.amount - Monto a reembolsar.
 * @param {string} data.reason - Motivo del reembolso.
 * @returns {Promise} AxiosResponse con PaymentResponse actualizado.
 */
export const refundPayment = (paymentId, data) => api.post(`/v1/payments/${paymentId}/refund`, data)
