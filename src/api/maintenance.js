import api from './axios'

/**
 * Ventana de mantenimiento relevante AHORA MISMO (en curso o la próxima programada), sin
 * sesión — es lo que consulta `Login.jsx` para mostrar el aviso. `data` es `null` si no hay
 * ninguna.
 * @returns {Promise} Respuesta de axios con `{id, startAt, endAt, phase}` o `null`.
 */
export const getPublicMaintenanceWindow = () => api.get('/public/maintenance-window')

/**
 * Misma ventana relevante, pero para el panel de SUPER_ADMIN (con sesión) — usada por
 * `Maintenance.jsx` para saber si ya hay una programada/en curso antes de ofrecer el
 * formulario de "programar una nueva".
 * @returns {Promise} Respuesta de axios con `{id, startAt, endAt, phase}` o `null`.
 */
export const getCurrentMaintenanceWindow = () => api.get('/admin/maintenance-windows/current')

/**
 * Programa una ventana de mantenimiento nueva. Exclusivo de SUPER_ADMIN.
 * @param {{startAt: string, endAt: string}} data Fechas en formato ISO (`datetime-local`).
 * @returns {Promise} Respuesta de axios con la ventana ya creada.
 */
export const scheduleMaintenanceWindow = (data) => api.post('/admin/maintenance-windows', data)

/**
 * Prolonga una ventana ya programada/en curso a una hora de fin posterior a la actual.
 * @param {number} id
 * @param {string} endAt Nueva fecha/hora de fin, en formato ISO (`datetime-local`).
 * @returns {Promise} Respuesta de axios con la ventana ya actualizada.
 */
export const extendMaintenanceWindow = (id, endAt) => api.put(`/admin/maintenance-windows/${id}/extend`, { endAt })

/**
 * Cancela una ventana que todavía no empieza (corrige una programada por error).
 * @param {number} id
 * @returns {Promise} Respuesta de axios confirmando la cancelación.
 */
export const cancelMaintenanceWindow = (id) => api.delete(`/admin/maintenance-windows/${id}`)
