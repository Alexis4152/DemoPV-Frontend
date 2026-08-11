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
