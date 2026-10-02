import api from './axios'

/**
 * Llamadas a la vitrina pública de apartados (`/api/public/tiendas/{slug}/**`, sin
 * autenticación) — usadas únicamente por `PublicApartar.jsx`. Reusan la misma instancia
 * `api` que el resto de la app: como el visitante no tiene sesión iniciada, el
 * interceptor de axios simplemente no encuentra token que adjuntar, no hace falta un
 * cliente aparte.
 */

/**
 * Nombre/logo/color de una tienda para el encabezado de su vitrina pública.
 * @param {string} slug
 * @returns {Promise} Respuesta de axios con `{name, logoPath, primaryColor}`.
 */
export const getPublicTienda = (slug) => api.get(`/public/tiendas/${slug}`)

/**
 * Categorías de una tienda, para el filtro de su vitrina pública.
 * @param {string} slug
 * @returns {Promise} Respuesta de axios con la lista de categorías.
 */
export const getPublicCategories = (slug) => api.get(`/public/tiendas/${slug}/categories`)

/**
 * Catálogo paginado de productos reservables de una tienda.
 * @param {string} slug
 * @param {Object} [params] `{ categoryId, q, page, size }` — `q` busca por nombre (parcial, sin mayúsculas).
 * @returns {Promise} Respuesta de axios con `{content, page, size, totalElements, totalPages}`.
 */
export const getPublicProducts = (slug, params) => api.get(`/public/tiendas/${slug}/products`, { params })

/**
 * Reconsulta un conjunto puntual de productos por id (sin paginar) — usado para revalidar
 * un carrito de apartado restaurado desde `localStorage` contra el stock/precio/oferta
 * actuales, no para navegar el catálogo normal (eso es `getPublicProducts`). Un id que ya
 * no existe, se desactivó o dejó de ser reservable simplemente no viene en la respuesta.
 * @param {string} slug
 * @param {number[]} ids
 * @returns {Promise} Respuesta de axios con la lista de productos encontrados.
 */
export const getPublicProductsByIds = (slug, ids) =>
  api.get(`/public/tiendas/${slug}/products/by-ids`, { params: { ids: ids.join(',') } })

/**
 * Solicita un apartado. Queda pendiente de confirmación por la tienda (no descuenta
 * stock todavía).
 * @param {string} slug
 * @param {Object} data `{ customerName, customerPhone, customerEmail, notes, items: [{ productId, quantity }] }`.
 * @returns {Promise} Respuesta de axios con la confirmación del apartado creado.
 */
export const createPublicApartado = (slug, data) => api.post(`/public/tiendas/${slug}/apartados`, data)

/**
 * Consulta el estado de un apartado ya hecho, por folio (su id) + teléfono — para que un
 * cliente sin cuenta pueda darle seguimiento sin llamar a la tienda. El folio por sí solo
 * no basta: el teléfono debe coincidir con el que se dejó al solicitarlo.
 * @param {string} slug
 * @param {Object} data `{ id, phone }`.
 * @returns {Promise} Respuesta de axios con el apartado y su estado actual.
 */
export const lookupPublicApartado = (slug, data) => api.post(`/public/tiendas/${slug}/apartados/lookup`, data)

/**
 * "¿No tienes tu folio?" — lista los apartados recientes de la tienda que coincidan con un
 * teléfono (sin folio). A propósito menos estricto que `lookupPublicApartado`: cualquiera
 * que sepa el teléfono de alguien puede ver su historial de apartados en esa tienda.
 * @param {string} slug
 * @param {Object} data `{ phone }`.
 * @returns {Promise} Respuesta de axios con la lista de apartados que coinciden (hasta 10).
 */
export const lookupPublicApartadosByPhone = (slug, data) => api.post(`/public/tiendas/${slug}/apartados/lookup-by-phone`, data)

/**
 * El cliente cancela su propio apartado (sin hablarle a la tienda) — mismo folio+teléfono
 * que `lookupPublicApartado` para verificar que de verdad es suyo, revalidado en el
 * servidor. También es la base de "editar" en la vitrina: se cancela este y el frontend
 * reconstruye un carrito con los mismos productos para que el cliente lo reenvíe.
 * @param {string} slug
 * @param {Object} data `{ id, phone, reason? }`.
 * @returns {Promise} Respuesta de axios con el apartado ya CANCELLED.
 */
export const selfCancelPublicApartado = (slug, data) => api.post(`/public/tiendas/${slug}/apartados/self-cancel`, data)
