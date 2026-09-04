import api from './axios'

/**
 * Lista las ventas (de la tienda del usuario), opcionalmente filtradas/paginadas.
 * @param {Object} [params] Query params de filtro/paginación (ej. rango de fechas, cajero).
 * @returns {Promise} Respuesta de axios con el listado de ventas.
 */
export const getSales = (params) => api.get('/sales', { params })

/**
 * Obtiene el detalle de una venta por id.
 * @param {number|string} id Id de la venta.
 * @returns {Promise} Respuesta de axios con la venta solicitada.
 */
export const getSale = (id) => api.get(`/sales/${id}`)

/**
 * Registra una nueva venta (ej. desde el punto de venta), típicamente asociada
 * al corte de caja abierto del cajero actual.
 * @param {Object} data Datos de la venta (productos, cantidades, forma de pago, etc.).
 * @returns {Promise} Respuesta de axios con la venta creada.
 */
export const createSale = (data) => api.post('/sales', data)

/**
 * Cancela/anula una venta existente.
 * @param {number|string} id Id de la venta a cancelar.
 * @returns {Promise} Respuesta de axios confirmando la cancelación.
 */
export const cancelSale = (id) => api.delete(`/sales/${id}`)

/**
 * Arma el ticket de una venta en formato ESC/POS (texto + comandos de control), listo
 * para pasárselo directo a un puente local de impresión (ver `utils/printer.js`) — no es
 * un PDF, es lo que la impresora térmica USB entiende byte por byte. Viene como una sola
 * cadena hexadecimal (dos caracteres por byte) para que no se corrompa ningún byte de
 * control al viajar por JSON/HTTP. Incluye el comando de apertura del cajón al final si
 * la venta fue en efectivo.
 * @param {number|string} id Id de la venta a imprimir.
 * @returns {Promise} Respuesta de axios con el ticket completo en hexadecimal (`data.data`).
 */
export const getSaleTicketEscPos = (id) => api.get(`/sales/${id}/ticket-escpos`)
