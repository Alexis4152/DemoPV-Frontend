import api from './axios'

/**
 * Lista todas las tiendas del sistema (activas e inactivas), ordenadas alfabéticamente.
 * Solo la puede llamar un SUPER_ADMIN (todas) o un SUPERVISOR (solo las suyas) — la usa
 * `SelectTienda.jsx` para armar el selector de "con cuál tienda actuar".
 * @returns {Promise} Respuesta de axios con la lista de tiendas.
 */
export const getTiendas = () => api.get('/tiendas')

/**
 * Lista las tiendas asignadas a un SUPERVISOR en particular (en vez de todas) — solo tiene
 * efecto llamada por un SUPER_ADMIN. La usa `Users.jsx` para precargar, al editar un
 * Supervisor existente, cuáles tiendas ya administra (esa info no viaja en el propio
 * usuario: es la relación inversa, vive en `Tienda.supervisor`).
 * @param {number|string} supervisorId Id del usuario Supervisor.
 * @returns {Promise} Respuesta de axios con las tiendas de ese Supervisor.
 */
export const getTiendasBySupervisor = (supervisorId) => api.get('/tiendas', { params: { supervisorId } })

/**
 * Da de alta una tienda nueva (solo SUPER_ADMIN). El backend le siembra de inmediato sus
 * roles base (ADMIN, CASHIER, SELLER) con las secciones correctas — ver
 * `TiendaService#create`/`RoleService#seedDefaultRolesForTienda` — así que queda lista
 * para operar sin ningún paso manual adicional.
 * @param {string} name Nombre de la tienda.
 * @returns {Promise} Respuesta de axios con la tienda creada.
 */
export const createTienda = (name) => api.post('/tiendas', { name })

/**
 * Actualiza el nombre de una tienda existente (solo SUPER_ADMIN, para cualquier tienda;
 * el ADMIN de una tienda no tiene este endpoint disponible — ver `TiendaController`).
 * @param {number|string} id Id de la tienda.
 * @param {string} name Nuevo nombre.
 * @returns {Promise} Respuesta de axios con la tienda actualizada.
 */
export const updateTiendaName = (id, name) => api.put(`/tiendas/${id}`, { name })

/**
 * Actualiza el color primario de marca de una tienda. Tras un guardado exitoso,
 * el llamador típicamente usa `applyTiendaBrand` (ver `utils/theme.js`) y
 * `patchTienda` de `AuthContext` para reflejar el nuevo color sin recargar la app.
 * @param {number|string} id Id de la tienda.
 * @param {string} primaryColor Color primario en formato hex (ej. '#155dea').
 * @returns {Promise} Respuesta de axios con la tienda actualizada.
 */
export const updateTiendaTheme = (id, primaryColor) => api.put(`/tiendas/${id}/theme`, { primaryColor })

/**
 * Obtiene la información (datos fiscales, apariencia, etc.) de una tienda.
 * @param {number|string} id Id de la tienda.
 * @returns {Promise} Respuesta de axios con la información de la tienda.
 */
export const getTiendaInfo = (id) => api.get(`/tiendas/${id}/info`)

/**
 * Actualiza la información general de una tienda (ej. datos fiscales, nombre).
 * @param {number|string} id Id de la tienda.
 * @param {Object} data Datos a actualizar.
 * @returns {Promise} Respuesta de axios con la tienda actualizada.
 */
export const updateTiendaInfo = (id, data) => api.put(`/tiendas/${id}/info`, data)

/**
 * Descarga el PDF promocional de apartados: nombre de la tienda y un QR (con la URL
 * también en texto) que apunta a su vitrina pública. `url` es la URL pública completa ya
 * armada por el caller (`origin` + `/apartar/` + slug) — el backend no conoce su propio
 * dominio público.
 * @param {number|string} id Id de la tienda.
 * @param {string} url URL pública completa de la vitrina de apartados de la tienda.
 * @returns {Promise} Respuesta de axios con el PDF como blob.
 */
export const getApartadosPromoPdf = (id, url) => api.get(`/tiendas/${id}/apartados-promo.pdf`, { params: { url }, responseType: 'blob' })

/**
 * Descarga SOLO el código QR (sin el resto de la hoja) que apunta a la vitrina pública de
 * apartados, como imagen PNG independiente — para quien quiera el código solo, en vez de
 * la hoja completa de `getApartadosPromoPdf`.
 * @param {number|string} id Id de la tienda.
 * @param {string} url URL pública completa de la vitrina de apartados de la tienda.
 * @returns {Promise} Respuesta de axios con el PNG como blob.
 */
export const getApartadosQrPng = (id, url) => api.get(`/tiendas/${id}/apartados-qr.png`, { params: { url }, responseType: 'blob' })

/**
 * Sube/reemplaza el logo de una tienda. Arma un `FormData` con el archivo y lo
 * envía como `multipart/form-data`.
 * @param {number|string} id Id de la tienda.
 * @param {File} file Archivo de imagen del logo.
 * @returns {Promise} Respuesta de axios con la tienda/logo actualizado.
 */
export const uploadTiendaLogo = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/tiendas/${id}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

/**
 * Elimina el logo actual de una tienda.
 * @param {number|string} id Id de la tienda.
 * @returns {Promise} Respuesta de axios confirmando la eliminación.
 */
export const removeTiendaLogo = (id) => api.delete(`/tiendas/${id}/logo`)
