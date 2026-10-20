import api from './axios'

/**
 * Llamadas de las solicitudes de derechos ARCO (Acceso, Rectificación, Cancelación,
 * Oposición) sobre datos personales. A diferencia del resto de `api/*.js`, no son por
 * tienda: es una obligación de la plataforma completa. El formulario público (`pages/
 * ArcoRequest.jsx`) no exige sesión para llenarse, pero el correo debe corresponder a una
 * cuenta real; SUPER_ADMIN atiende TODAS desde "Solicitudes ARCO" (`pages/
 * ArcoRequests.jsx`), y cualquier usuario ve las SUYAS desde "Mis solicitudes" (`pages/
 * MyArcoRequests.jsx`), iniciando sesión con esa misma cuenta.
 */

/**
 * Levanta una solicitud ARCO. No exige sesión para llenar el formulario, pero
 * `requesterEmail` debe corresponder a una cuenta real del sistema — si no, el backend
 * rechaza con un mensaje claro ("Ese correo no corresponde a ningún usuario...").
 * @param {{requesterName: string, requesterEmail: string, requesterPhone?: string, type: 'ACCESS'|'RECTIFICATION'|'CANCELLATION'|'OPPOSITION', details?: string}} data
 * @returns {Promise} Respuesta de axios con el mensaje de confirmación.
 */
export const createArcoRequest = (data) => api.post('/public/arco-requests', data)

/**
 * Las solicitudes ARCO que el usuario en sesión ha levantado (con su propio correo) —
 * "Mis solicitudes", disponible para cualquier rol, cada quien ve solo las suyas.
 * @returns {Promise} Respuesta de axios con la lista.
 */
export const getMyArcoRequests = () => api.get('/arco-requests/mine')

/**
 * Lista las solicitudes ARCO, pendientes primero. Exclusivo de SUPER_ADMIN.
 * @param {string} [status] `'PENDING'|'COMPLETED'|'REJECTED'` — omite para traer todas.
 * @returns {Promise} Respuesta de axios con la lista.
 */
export const getArcoRequests = (status) => api.get('/admin/arco-requests', { params: { status: status || undefined } })

/**
 * Cuántas solicitudes ARCO siguen sin atender — para el badge del menú lateral.
 * @returns {Promise} Respuesta de axios con el conteo.
 */
export const getArcoRequestsPendingCount = () => api.get('/admin/arco-requests/pending-count')

/**
 * Resuelve una solicitud ARCO pendiente.
 * @param {number} id
 * @param {{status: 'COMPLETED'|'REJECTED', notes: string}} data
 * @returns {Promise} Respuesta de axios con la solicitud ya resuelta.
 */
export const resolveArcoRequest = (id, data) => api.put(`/admin/arco-requests/${id}/resolve`, data)
