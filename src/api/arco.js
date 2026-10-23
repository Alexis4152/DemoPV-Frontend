import api from './axios'

/**
 * Llamadas de las solicitudes de derechos ARCO (Acceso, Rectificación, Cancelación,
 * Oposición, Revocación, Limitación) sobre datos personales — plataforma completa, no por
 * tienda. Tres formas de levantar una: pública sin sesión (`pages/ArcoRequest.jsx`, el
 * correo debe corresponder a una cuenta real y hay que confirmarlo después por un link),
 * desde la propia cuenta ya autenticada (`pages/MyArcoRequests.jsx`), o en mostrador por
 * personal (`pages/ArcoRequests.jsx`, SUPER_ADMIN). El seguimiento por link vive en
 * `pages/ArcoTracking.jsx`.
 */

// ── Pública (sin sesión) ────────────────────────────────────────────────────────────────

/**
 * Levanta una solicitud ARCO pública (canal WEB). `requesterEmail` debe corresponder a una
 * cuenta real del sistema. Queda pendiente de confirmar correo (se manda un link).
 * @param {{requesterName: string, requesterEmail: string, requesterPhone?: string, type: string, details?: string, representative?: boolean, representativeName?: string, acceptPrivacyNotice: boolean}} data
 */
export const createArcoRequest = (data) => api.post('/public/arco-requests', data)

/** Visitar el link de seguimiento: confirma el correo (si hacía falta) y regresa el estado actual. */
export const trackArcoRequest = (token) => api.get(`/public/arco-requests/track/${token}`)

/** El titular responde, por el link de seguimiento, lo que el personal le pidió. */
export const answerArcoInfoByToken = (token, answer) => api.post(`/public/arco-requests/track/${token}/answer-info`, { answer })

// ── Cuenta propia (con sesión, cualquier rol) ───────────────────────────────────────────

/** Las solicitudes ARCO que el usuario en sesión ha levantado — "Mis solicitudes". */
export const getMyArcoRequests = () => api.get('/arco-requests/mine')

/**
 * Levanta una solicitud ARCO a nombre de la cuenta en sesión (canal ACCOUNT) — nombre/
 * correo se toman de la cuenta, no se mandan. Si el tipo exige identidad fuerte (Acceso,
 * Rectificación, Cancelación, Revocación), `password` es obligatoria.
 * @param {{requesterPhone?: string, type: string, details?: string, representative?: boolean, representativeName?: string, password?: string, acceptPrivacyNotice: boolean}} data
 */
export const createMyArcoRequest = (data) => api.post('/arco-requests', data)

/** Responde, desde la propia cuenta, lo que el personal pidió sobre una solicitud propia. */
export const answerMyArcoInfo = (id, answer) => api.post(`/arco-requests/${id}/answer-info`, { answer })

// ── Administración (SUPER_ADMIN) ────────────────────────────────────────────────────────

/** Lista las solicitudes ARCO, abiertas primero. */
export const getArcoRequests = (status) => api.get('/admin/arco-requests', { params: { status: status || undefined } })

/** Cuántas solicitudes ARCO siguen sin cerrar — para el badge del menú lateral. */
export const getArcoRequestsPendingCount = () => api.get('/admin/arco-requests/pending-count')

export const getArcoRequest = (id) => api.get(`/admin/arco-requests/${id}`)

/** Registra una solicitud en mostrador, para alguien verificado en persona (con o sin cuenta). */
export const createArcoRequestInPerson = (data) => api.post('/admin/arco-requests/in-person', data)

/** @param {{method: string, notes: string}} data */
export const verifyArcoIdentity = (id, data) => api.post(`/admin/arco-requests/${id}/verify-identity`, data)

/** @param {{infoRequest: string}} data */
export const requestArcoInfo = (id, data) => api.post(`/admin/arco-requests/${id}/request-info`, data)

/** @param {{reason: string}} data */
export const extendArcoRequest = (id, data) => api.post(`/admin/arco-requests/${id}/extend`, data)

/** @param {{outcome: 'PROCEDENTE'|'PARCIAL'|'IMPROCEDENTE', legalBasis?: string, notes: string}} data */
export const respondArcoRequest = (id, data) => api.post(`/admin/arco-requests/${id}/respond`, data)

/** @param {{summary: string}} data */
export const executeArcoRequest = (id, data) => api.post(`/admin/arco-requests/${id}/execute`, data)

/** Descarga la constancia en PDF (vía axios, para que viaje el token de sesión) y la abre en una pestaña nueva. */
export function openArcoConstancia(id) {
  return api.get(`/admin/arco-requests/${id}/constancia.pdf`, { responseType: 'blob' }).then((res) => {
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    window.open(url, '_blank', 'noopener')
  })
}
