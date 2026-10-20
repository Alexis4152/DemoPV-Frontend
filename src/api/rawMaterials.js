import api from './axios'

/**
 * Materia prima: inventario por piezas que no está a la venta. Mismos filtros que
 * `getProductsPage` (`q`, `categoryId`, `lowStock`, `page`, `size`).
 */
export const getRawMaterialsPage = (params) => api.get('/raw-materials/page', { params })

/** Materias primas en su stock mínimo o por debajo. */
export const getRawMaterialsLowStock = () => api.get('/raw-materials/low-stock')

export const createRawMaterial = (data) => api.post('/raw-materials', data)

/** Edita los datos; el stock no cambia aquí (usa `adjustRawMaterialStock`). */
export const updateRawMaterial = (id, data) => api.put(`/raw-materials/${id}`, data)

/** Entrada (`quantity` positiva) o salida (negativa, solo admin/supervisor) de piezas. */
export const adjustRawMaterialStock = (id, data) => api.post(`/raw-materials/${id}/adjust-stock`, data)

/**
 * Pasa piezas al inventario vendible: a un producto existente (`productId`) o a uno nuevo
 * (`newProductName`, `newProductPrice`, `newProductCategoryId`, `newProductBarcode`).
 */
export const transferRawMaterialToInventory = (id, data) => api.post(`/raw-materials/${id}/to-inventory`, data)

/** Historial paginado de una materia prima, del más reciente al más antiguo. */
export const getRawMaterialMovements = (id, params) => api.get(`/raw-materials/${id}/movements`, { params })

export const deleteRawMaterial = (id) => api.delete(`/raw-materials/${id}`)
