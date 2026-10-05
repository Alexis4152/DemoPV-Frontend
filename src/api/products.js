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
 * Busca stock disponible de un producto en las tiendas "hermanas" de la del usuario (las
 * que comparten el mismo Supervisor de tiendas), sin exponer nada más de ellas — ej. para
 * saber si una sucursal del mismo grupo tiene existencias antes de mandar a un cliente
 * para allá. Disponible para cualquier rol con acceso a Inventario, no solo SUPER_ADMIN/
 * SUPERVISOR. Si la tienda del usuario no tiene un Supervisor asignado (o no tiene
 * "hermanas"), el backend regresa una página vacía, no un error.
 * @param {Object} params Query params: `q` (obligatorio), `page`, `size`.
 * @returns {Promise} Respuesta de axios con `{content, page, size, totalElements, totalPages}`.
 */
export const getSiblingStock = (params) => api.get('/products/sibling-stock', { params })

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
 * Piezas actualmente comprometidas en apartados abiertos (`PENDING`/`ACTIVE`) de cada
 * producto activo (incluye los que no tienen ninguno, con 0) — usado para la columna
 * "Apartados" de Inventario.
 * @returns {Promise} Respuesta de axios con filas `[productId, cantidadApartada]`.
 */
export const getProductReservedStats = () => api.get('/products/reserved-stats')

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

// ── Fotos del producto (galería para la tienda pública de apartados) ──────────────────

/**
 * Fotos de un producto, portada primero.
 * @param {number|string} id Id del producto.
 * @returns {Promise} Respuesta de axios con la lista de fotos.
 */
export const getProductImages = (id) => api.get(`/products/${id}/images`)

/**
 * Sube una foto nueva para un producto.
 * @param {number|string} id Id del producto.
 * @param {File} file Archivo de imagen (PNG, JPG o WEBP, máx. 5 MB).
 * @returns {Promise} Respuesta de axios con la foto recién guardada.
 */
export const uploadProductImage = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/products/${id}/images`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

/**
 * Marca una foto como portada del producto.
 * @param {number|string} id Id del producto.
 * @param {number|string} imageId Id de la foto.
 * @returns {Promise} Respuesta de axios confirmando el cambio.
 */
export const setPrimaryProductImage = (id, imageId) => api.put(`/products/${id}/images/${imageId}/primary`)

/**
 * Borra una foto de un producto.
 * @param {number|string} id Id del producto.
 * @param {number|string} imageId Id de la foto a borrar.
 * @returns {Promise} Respuesta de axios confirmando la eliminación.
 */
export const deleteProductImage = (id, imageId) => api.delete(`/products/${id}/images/${imageId}`)

// ── Carga masiva de productos por Excel ────────────────────────────────────────────────

/**
 * Descarga la plantilla (.xlsx) de carga masiva de productos, con las columnas esperadas
 * y una fila de ejemplo. Disponible para ADMIN/SUPER_ADMIN/SUPERVISOR.
 * @returns {Promise} Respuesta de axios con el archivo en `data` (blob).
 */
export const getBulkImportTemplate = () => api.get('/products/bulk-import/template', { responseType: 'blob' })

/**
 * Sube un archivo de carga masiva de productos. Solo SUPER_ADMIN. Crea un producto por
 * cada fila válida y reporta el resto como errores, sin tumbar la carga completa por una
 * sola fila mala — ver `data.errors` (primeros 10) y `data.errorReportBase64` (el Excel
 * completo de errores en base64, solo si hubo más de 10).
 * @param {File} file Archivo .xlsx con el mismo formato que la plantilla.
 * @returns {Promise} Respuesta de axios con el resumen de la carga.
 */
export const bulkImportProducts = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/products/bulk-import', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

