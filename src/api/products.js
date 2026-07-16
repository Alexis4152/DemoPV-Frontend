import api from './axios'

export const getProducts = (params) => api.get('/products', { params })
export const searchProducts = (params) => api.get('/products/search', { params })
export const getProduct = (id) => api.get(`/products/${id}`)
export const createProduct = (data) => api.post('/products', data)
export const updateProduct = (id, data) => api.put(`/products/${id}`, data)
export const adjustStock = (id, data) => api.post(`/products/${id}/adjust-stock`, data)
export const deleteProduct = (id) => api.delete(`/products/${id}`)
