import api from './axios'

/**
 * Lista los productos (de la tienda del usuario), opcionalmente filtrados/paginados.
 * @param {Object} [params] Query params de filtro/paginación (ej. categoría, página).
 * @returns {Promise} Respuesta de axios con el listado de productos.
 */
export const getProducts = (params) => api.get('/products', { params })

/**
 * Busca productos por texto/código (ej. para el buscador del punto de venta o inventario).
 * @param {Object} [params] Query params de búsqueda (ej. `{ q: '...' }`).
 * @returns {Promise} Respuesta de axios con los productos que coinciden con la búsqueda.
 */
export const searchProducts = (params) => api.get('/products/search', { params })

/**
 * Obtiene el detalle de un producto por id.
 * @param {number|string} id Id del producto.
 * @returns {Promise} Respuesta de axios con el producto solicitado.
 */
export const getProduct = (id) => api.get(`/products/${id}`)

/**
 * Crea un nuevo producto.
 * @param {Object} data Datos del producto (nombre, precio, categoría, stock, etc.).
 * @returns {Promise} Respuesta de axios con el producto creado.
 */
export const createProduct = (data) => api.post('/products', data)

/**
 * Actualiza un producto existente.
 * @param {number|string} id Id del producto.
 * @param {Object} data Datos a actualizar.
 * @returns {Promise} Respuesta de axios con el producto actualizado.
 */
export const updateProduct = (id, data) => api.put(`/products/${id}`, data)

/**
 * Ajusta manualmente el stock de un producto (ej. entrada/salida de inventario, corrección).
 * @param {number|string} id Id del producto.
 * @param {Object} data Datos del ajuste (ej. cantidad, motivo).
 * @returns {Promise} Respuesta de axios con el producto/stock actualizado.
 */
export const adjustStock = (id, data) => api.post(`/products/${id}/adjust-stock`, data)

/**
 * Elimina un producto.
 * @param {number|string} id Id del producto a eliminar.
 * @returns {Promise} Respuesta de axios confirmando la eliminación.
 */
export const deleteProduct = (id) => api.delete(`/products/${id}`)

