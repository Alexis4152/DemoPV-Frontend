import api from './axios'

export const getSalesSummary = (from, to) => api.get('/reports/sales-summary', { params: { from, to } })
export const getTopProducts = (from, to, limit = 10) => api.get('/reports/top-products', { params: { from, to, limit } })
export const getSalesByDay = (from, to) => api.get('/reports/sales-by-day', { params: { from, to } })
export const getInventoryStatus = () => api.get('/reports/inventory-status')
