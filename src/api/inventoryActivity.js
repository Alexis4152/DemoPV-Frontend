import api from './axios'

/**
 * Pestaña "Movimientos" de Inventario: movimientos de stock + bitácora de acciones, en una
 * sola lista paginada. Solo admin/supervisor/super admin.
 * @param {{ from: string, to: string, q?: string, categoryId?: number, userId?: number,
 *           action?: string, page?: number, size?: number }} params Fechas `YYYY-MM-DD`.
 * @returns {Promise} Respuesta de axios con la página en `data.data`.
 */
export const getInventoryActivity = (params) => api.get('/inventory-activity', { params })

/**
 * Usuarios con alguna acción en el rango, para el filtro "Usuario".
 * @param {{ from: string, to: string }} params
 * @returns {Promise} Respuesta de axios con `[{ id, name }]` en `data.data`.
 */
export const getInventoryActivityUsers = (params) => api.get('/inventory-activity/users', { params })
