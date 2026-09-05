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
 * Búsqueda paginada de productos para Inventario (metadatos completos de paginación),
 * con los mismos filtros que `searchProducts` más uno opcional por historial de ventas
 * (`sold: 'NEVER_SOLD' | 'TOP_SELLERS'`). A diferencia de `searchProducts` (usado por
 * POS/Dashboard, devuelve solo un arreglo), esta pagina en el servidor para que
 * Inventario no tenga que cargar el catálogo completo de un jalón.
 * @param {Object} [params] Query params: `q`, `categoryId`, `lowStock`, `sold`, `page`, `size`.
 * @returns {Promise} Respuesta de axios con `{content, page, size, totalElements, totalPages}`.
 */
export const getProductsPage = (params) => api.get('/products/page', { params })

/**
 * Obtiene el detalle de un producto por id.
 * @param {number|string} id Id del producto.
 * @returns {Promise} Respuesta de axios con el producto solicitado.
 */
export const getProduct = (id) => api.get(`/products/${id}`)

/**
 * Busca un producto activo por su código de barras EXACTO (pensado para lectores de
 * código de barras en venta/inventario, a diferencia de `searchProducts` que hace
 * coincidencia parcial). A diferencia de `getProduct`, un código que no exista no es un
 * error: la respuesta llega igual con `data: null`, no lanza excepción.
 * @param {string} barcode Código de barras exacto a buscar.
 * @returns {Promise} Respuesta de axios con el producto encontrado, o `data: null`.
 */
export const getProductByBarcode = (barcode) => api.get(`/products/by-barcode/${encodeURIComponent(barcode)}`)

/**
 * Total histórico de unidades vendidas de cada producto activo (incluye los que nunca se
 * han vendido, con 0) — usado para los filtros "sin ventas" / "más vendidos" de Inventario.
 * @returns {Promise} Respuesta de axios con filas `[productId, cantidadVendida]`.
 */
export const getProductSalesStats = () => api.get('/products/sales-stats')

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

