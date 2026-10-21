import api from './axios'

/**
 * Obtiene el resumen de ventas (totales, número de ventas, etc.) en un rango de fechas.
 * @param {string} from Fecha inicial del rango (ej. 'YYYY-MM-DD').
 * @param {string} to Fecha final del rango (ej. 'YYYY-MM-DD').
 * @returns {Promise} Respuesta de axios con el resumen de ventas.
 */
export const getSalesSummary = (from, to) => api.get('/reports/sales-summary', { params: { from, to } })

/**
 * Obtiene los productos más vendidos en un rango de fechas.
 * @param {string} from Fecha inicial del rango.
 * @param {string} to Fecha final del rango.
 * @param {number} [limit=10] Cantidad máxima de productos a devolver.
 * @returns {Promise} Respuesta de axios con el ranking de productos más vendidos.
 */
export const getTopProducts = (from, to, limit = 10) => api.get('/reports/top-products', { params: { from, to, limit } })

/**
 * Obtiene el total de ventas agrupado por día dentro de un rango de fechas.
 * @param {string} from Fecha inicial del rango.
 * @param {string} to Fecha final del rango.
 * @returns {Promise} Respuesta de axios con las ventas totalizadas por día.
 */
export const getSalesByDay = (from, to) => api.get('/reports/sales-by-day', { params: { from, to } })

/**
 * Obtiene el estado actual del inventario (ej. existencias, productos con stock bajo).
 * @returns {Promise} Respuesta de axios con el estado del inventario.
 */
export const getInventoryStatus = () => api.get('/reports/inventory-status')

/**
 * Obtiene el total vendido y el número de ventas agrupado por método de pago (efectivo,
 * tarjeta, transferencia) dentro de un rango de fechas. Útil para cuadrar caja.
 * @param {string} from Fecha inicial del rango.
 * @param {string} to Fecha final del rango.
 * @returns {Promise} Respuesta de axios con las filas por método de pago.
 */
export const getSalesByPaymentMethod = (from, to) => api.get('/reports/sales-by-payment-method', { params: { from, to } })

/**
 * Obtiene el ranking de vendedores/cajeros por monto total vendido dentro de un rango
 * de fechas.
 * @param {string} from Fecha inicial del rango.
 * @param {string} to Fecha final del rango.
 * @param {number} [limit=10] Cantidad máxima de vendedores a devolver.
 * @returns {Promise} Respuesta de axios con el ranking de vendedores.
 */
export const getTopSellers = (from, to, limit = 10) => api.get('/reports/top-sellers', { params: { from, to, limit } })

/**
 * Obtiene el total vendido agrupado por mes dentro de un rango de fechas, para detectar
 * temporadas altas/bajas en rangos que cubren varios meses.
 * @param {string} from Fecha inicial del rango.
 * @param {string} to Fecha final del rango.
 * @returns {Promise} Respuesta de axios con las ventas totalizadas por mes.
 */
export const getSalesByMonth = (from, to) => api.get('/reports/sales-by-month', { params: { from, to } })

/**
 * Obtiene los productos más rentables (ingreso menos costo actual) dentro de un rango de
 * fechas. Ver la nota sobre el costo actual (no histórico) en el backend.
 * @param {string} from Fecha inicial del rango.
 * @param {string} to Fecha final del rango.
 * @param {number} [limit=10] Cantidad máxima de productos a devolver.
 * @returns {Promise} Respuesta de axios con el ranking de rentabilidad.
 */
export const getTopProductsByMargin = (from, to, limit = 10) => api.get('/reports/top-products-by-margin', { params: { from, to, limit } })

/**
 * Obtiene el total vendido por categoría de producto dentro de un rango de fechas.
 * @param {string} from Fecha inicial del rango.
 * @param {string} to Fecha final del rango.
 * @returns {Promise} Respuesta de axios con las ventas por categoría.
 */
export const getSalesByCategory = (from, to) => api.get('/reports/sales-by-category', { params: { from, to } })

/**
 * Compara el rango de fechas indicado contra el mismo rango del año anterior.
 * @param {string} from Fecha inicial del rango actual.
 * @param {string} to Fecha final del rango actual.
 * @returns {Promise} Respuesta de axios con el comparativo interanual.
 */
export const getYearOverYear = (from, to) => api.get('/reports/year-over-year', { params: { from, to } })

/**
 * Descarga el reporte completo del rango de fechas indicado en PDF (mismos datos que esta
 * pantalla, en tablas). `responseType: 'blob'` porque la respuesta es un archivo binario,
 * no JSON.
 * @param {string} from Fecha inicial del rango.
 * @param {string} to Fecha final del rango.
 * @returns {Promise} Respuesta de axios con el PDF como blob.
 */
export const getReportPdf = (from, to) => api.get('/reports/pdf', { params: { from, to }, responseType: 'blob' })

/**
 * Catálogo de reportes del módulo "Reportes" (título, grupo, filtros que acepta cada
 * uno) — alimenta el menú lateral de `Reports.jsx`. A diferencia de las funciones de
 * arriba (un endpoint fijo por cada consulta, usadas por el widget del Dashboard), este
 * y los dos de abajo son el catálogo genérico: un solo endpoint por tipo de reporte.
 * @returns {Promise} Respuesta de axios con la lista de reportes disponibles.
 */
export const getReportCatalog = () => api.get('/reports/catalog')

/**
 * Genera uno de los reportes del catálogo (ver {@link getReportCatalog}).
 * @param {string} type Tipo del reporte (ej. `'ventas'`, `'ingresos'`) — el mismo `type`
 *        que trae cada entrada del catálogo.
 * @param {Object} params `{ from, to, status, method, movementType }` — cada reporte usa
 *        solo los filtros que declara, el resto se ignora.
 * @returns {Promise} Respuesta de axios con el reporte (indicadores, gráficas y tabla).
 */
export const getReportItem = (type, params) => api.get(`/reports/${type}`, { params })

/**
 * Exporta uno de los reportes del catálogo a CSV, Excel o PDF. `responseType: 'blob'`
 * porque la respuesta es un archivo binario, no JSON.
 * @param {string} type Tipo del reporte.
 * @param {string} format `'csv' | 'xlsx' | 'pdf'`.
 * @param {Object} params Mismos filtros que {@link getReportItem}.
 * @returns {Promise} Respuesta de axios con el archivo como blob.
 */
export const exportReportItem = (type, format, params) =>
  api.get(`/reports/${type}/export`, { params: { ...params, format }, responseType: 'blob' })
