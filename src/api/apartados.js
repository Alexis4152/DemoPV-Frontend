import api from './axios'

/**
 * Lista paginada de apartados de la tienda del usuario, con filtros opcionales.
 * @param {Object} [params] `{ status, from, to, q, page, size }` — `q` busca por nombre o
 *   teléfono del cliente, o por el nombre de algún producto en sus líneas (parcial, sin
 *   distinguir mayúsculas).
 * @returns {Promise} Respuesta de axios con `{content, page, size, totalElements, totalPages}`.
 */
export const getApartados = (params) => api.get('/apartados', { params })

/**
 * Cuántos apartados están `PENDING` (por revisar) — alimenta el badge del sidebar.
 * @returns {Promise} Respuesta de axios con el conteo.
 */
export const getApartadosPendingCount = () => api.get('/apartados/pending-count')

/**
 * Detalle de un apartado por id.
 * @param {number|string} id
 * @returns {Promise} Respuesta de axios con el apartado.
 */
export const getApartado = (id) => api.get(`/apartados/${id}`)

/**
 * Confirma un apartado `PENDING`: descuenta el stock y arranca el plazo de vigencia.
 * @param {number|string} id
 * @param {Object} [data] `{ durationHours, items: [{ itemId, discount }] }`.
 * @returns {Promise} Respuesta de axios con el apartado ya `ACTIVE`.
 */
export const confirmApartado = (id, data) => api.post(`/apartados/${id}/confirm`, data)

/**
 * Completa un apartado `ACTIVE` (el cliente recogió y pagó): genera la venta real.
 * @param {number|string} id
 * @param {Object} data `{ paymentMethod, amountReceived, customerEmail }` — `customerEmail`
 *   opcional, para el ticket digital cuando el cliente no dejó uno (o quiere otro) al
 *   solicitar el apartado.
 * @returns {Promise} Respuesta de axios con el apartado ya `COMPLETED` (incluye `saleId`).
 */
export const completeApartado = (id, data) => api.post(`/apartados/${id}/complete`, data)

/**
 * Cancela un apartado `PENDING` o `ACTIVE`.
 * @param {number|string} id
 * @param {Object} [data] `{ reason }` — motivo opcional; si el cliente dejó correo al
 *   solicitar el apartado, se le avisa la cancelación incluyéndolo.
 * @returns {Promise} Respuesta de axios con el apartado ya `CANCELLED`.
 */
export const cancelApartado = (id, data) => api.post(`/apartados/${id}/cancel`, data)
