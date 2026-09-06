import api from './axios'

/**
 * Inicia sesión contra el backend.
 * @param {{ username: string, password: string }} data Credenciales del usuario.
 * @returns {Promise} Respuesta de axios; `data.data` trae el usuario autenticado y su JWT.
 */
export const login = (data) => api.post('/auth/login', data)

/**
 * Obtiene los datos frescos del usuario actualmente autenticado (según el JWT enviado).
 * `AuthContext` la usa al recargar la sesión guardada, para reflejar cambios recientes
 * de permisos (rol/sections) o de la tienda (ej. color de marca) hechos desde el último login.
 * @returns {Promise} Respuesta de axios con los datos actuales del usuario.
 */
export const me = () => api.get('/auth/me')

/**
 * Pide el link de recuperación de contraseña para el correo dado. El backend responde
 * siempre el mismo mensaje genérico exista o no el correo (protección contra enumeración),
 * así que esta llamada nunca debe usarse para inferir si un correo está registrado.
 * @param {string} email Correo del usuario que quiere recuperar su contraseña.
 * @returns {Promise} Respuesta de axios con el mensaje genérico a mostrar.
 */
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email })

/**
 * Completa la recuperación de contraseña con el token recibido por correo.
 * @param {string} token Token del link (query param `?token=` de la pantalla de reset).
 * @param {string} newPassword Nueva contraseña elegida por el usuario.
 * @returns {Promise} Respuesta de axios confirmando el cambio.
 */
export const resetPassword = (token, newPassword) => api.post('/auth/reset-password', { token, newPassword })
