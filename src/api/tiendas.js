import api from './axios'

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
