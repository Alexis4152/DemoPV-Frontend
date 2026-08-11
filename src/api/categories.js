import api from './axios'

/**
 * Lista las categorías de producto (de la tienda del usuario).
 * @returns {Promise} Respuesta de axios con el listado de categorías.
 */
export const getCategories = () => api.get('/categories')

/**
 * Crea una nueva categoría de producto.
 * @param {Object} data Datos de la categoría (ej. nombre).
 * @returns {Promise} Respuesta de axios con la categoría creada.
 */
export const createCategory = (data) => api.post('/categories', data)

/**
 * Actualiza una categoría existente.
 * @param {number|string} id Id de la categoría.
 * @param {Object} data Datos a actualizar.
 * @returns {Promise} Respuesta de axios con la categoría actualizada.
 */
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data)

/**
 * Elimina una categoría.
 * @param {number|string} id Id de la categoría a eliminar.
 * @returns {Promise} Respuesta de axios confirmando la eliminación.
 */
export const deleteCategory = (id) => api.delete(`/categories/${id}`)
