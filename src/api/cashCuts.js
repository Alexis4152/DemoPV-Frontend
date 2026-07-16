import api from './axios'

export const getCashCuts = (params) => api.get('/cash-cuts', { params })
export const getOpenCashCut = () => api.get('/cash-cuts/open')
export const getCashCut = (id) => api.get(`/cash-cuts/${id}`)
export const getCashCutSummary = (id) => api.get(`/cash-cuts/${id}/summary`)
export const openCashCut = (data) => api.post('/cash-cuts/open', data)
export const closeCashCut = (id, data) => api.post(`/cash-cuts/${id}/close`, data)
