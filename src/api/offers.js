import api from './axios'

/**
 * Lista las ofertas activas de la tienda del usuario, con sus productos ligados ya
 * incluidos — usada tanto por la pantalla de administración de Ofertas como por el POS
 * (para calcular en vivo cuánto se cobra por cada línea del carrito, ver `POS.jsx`).
 * @returns {Promise} Respuesta de axios con el listado de ofertas.
 */
export const getOffers = () => api.get('/offers')

/**
 * Búsqueda paginada de ofertas para la pantalla de administración, con filtros opcionales
 * por nombre, estado y rango de fecha de alta. Reservado a ADMIN/SUPER_ADMIN/SUPERVISOR.
 * @param {Object} [params] Query params: `name`, `isActive`, `from`, `to`, `page`, `size`.
 * @returns {Promise} Respuesta de axios con `{content, page, size, totalElements, totalPages}`.
 */
export const getOffersPage = (params) => api.get('/offers/page', { params })

/**
 * Crea una nueva oferta ("compra X paga Y").
 * @param {Object} data `{ name, buyQuantity, payQuantity, maxPromosPerSale, startsAt, endsAt, isActive, productIds }`.
 * @returns {Promise} Respuesta de axios con la oferta creada.
 */
export const createOffer = (data) => api.post('/offers', data)

/**
 * Actualiza una oferta existente.
 * @param {number|string} id Id de la oferta.
 * @param {Object} data Mismos campos que `createOffer`.
 * @returns {Promise} Respuesta de axios con la oferta actualizada.
 */
export const updateOffer = (id, data) => api.put(`/offers/${id}`, data)

/**
 * Elimina (borrado suave) una oferta.
 * @param {number|string} id Id de la oferta a eliminar.
 * @returns {Promise} Respuesta de axios confirmando la eliminación.
 */
export const deleteOffer = (id) => api.delete(`/offers/${id}`)

/**
 * Reactiva una oferta desactivada.
 * @param {number|string} id Id de la oferta.
 * @returns {Promise} Respuesta de axios con la oferta reactivada.
 */
export const activateOffer = (id) => api.post(`/offers/${id}/activate`)
