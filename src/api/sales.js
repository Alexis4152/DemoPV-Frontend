import api from './axios'

export const getSales = (params) => api.get('/sales', { params })
export const getSale = (id) => api.get(`/sales/${id}`)
export const createSale = (data) => api.post('/sales', data)
export const cancelSale = (id) => api.delete(`/sales/${id}`)
