import api from './axios'

export const updateTiendaTheme = (id, primaryColor) => api.put(`/tiendas/${id}/theme`, { primaryColor })

export const getTiendaInfo = (id) => api.get(`/tiendas/${id}/info`)
export const updateTiendaInfo = (id, data) => api.put(`/tiendas/${id}/info`, data)

export const uploadTiendaLogo = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/tiendas/${id}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const removeTiendaLogo = (id) => api.delete(`/tiendas/${id}/logo`)
