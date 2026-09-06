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
 * Solicita un apartado. Queda pendiente de confirmación por la tienda (no descuenta
 * stock todavía).
 * @param {string} slug
 * @param {Object} data `{ customerName, customerPhone, customerEmail, notes, items: [{ productId, quantity }] }`.
 * @returns {Promise} Respuesta de axios con la confirmación del apartado creado.
 */
export const createPublicApartado = (slug, data) => api.post(`/public/tiendas/${slug}/apartados`, data)
