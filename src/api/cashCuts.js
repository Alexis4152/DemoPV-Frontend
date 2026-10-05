import api from './axios'

/**
 * Lista los cortes de caja (de la tienda del usuario, o de todas si es SUPER_ADMIN),
 * opcionalmente filtrados/paginados.
 * @param {Object} [params] Query params de filtro/paginación (ej. rango de fechas, cajero).
 * @returns {Promise} Respuesta de axios con el listado de cortes de caja.
 */
export const getCashCuts = (params) => api.get('/cash-cuts', { params })

/**
 * Cajeros distintos con al menos un corte de caja en la tienda del usuario — para poblar
 * el filtro "Cajero" del historial, sin depender de la sección Usuarios.
 * @returns {Promise} Respuesta de axios con `[{id, name}]`.
 */
export const getCashCutCashiers = () => api.get('/cash-cuts/cashiers')

/**
 * Obtiene el corte de caja abierto actualmente (puede haber varios cajeros con
 * corte abierto a la vez en la misma tienda; este endpoint resuelve el del contexto actual).
 * @returns {Promise} Respuesta de axios con el corte abierto.
 */
export const getOpenCashCut = () => api.get('/cash-cuts/open')

/**
 * Obtiene el corte de caja de HOY perteneciente al usuario (cajero) autenticado.
 * @returns {Promise} Respuesta de axios con el corte del día del usuario actual.
 */
export const getMyTodayCashCut = () => api.get('/cash-cuts/mine/today')

/**
 * Obtiene el detalle de un corte de caja por id.
 * @param {number|string} id Id del corte de caja.
 * @returns {Promise} Respuesta de axios con el corte solicitado.
 */
export const getCashCut = (id) => api.get(`/cash-cuts/${id}`)

/**
 * Obtiene el resumen (totales, ventas incluidas, etc.) de un corte de caja.
 * @param {number|string} id Id del corte de caja.
 * @returns {Promise} Respuesta de axios con el resumen del corte.
 */
export const getCashCutSummary = (id) => api.get(`/cash-cuts/${id}/summary`)

/**
 * Abre un nuevo corte de caja para el cajero autenticado (ej. con el fondo inicial de caja).
 * @param {Object} data Datos de apertura del corte (ej. monto inicial).
 * @returns {Promise} Respuesta de axios con el corte recién abierto.
 */
export const openCashCut = (data) => api.post('/cash-cuts/open', data)

/**
 * Cierra un corte de caja existente.
 * @param {number|string} id Id del corte de caja a cerrar.
 * @param {Object} data Datos de cierre (ej. monto final contado, notas).
 * @returns {Promise} Respuesta de axios con el corte ya cerrado.
 */
export const closeCashCut = (id, data) => api.post(`/cash-cuts/${id}/close`, data)
