import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, me as apiMe } from '../api/auth'
import { applyDefaultBrand, applyTiendaBrand } from '../utils/theme'

const AuthContext = createContext(null)

// SUPER_ADMIN no pertenece a ninguna tienda → siempre azul Nexora fijo.
// El resto sigue el color que su tienda haya elegido (o Nexora si no eligió ninguno).
function applyBrandFor(userData) {
  if (!userData || userData.role === 'SUPER_ADMIN' || !userData.tienda?.primaryColor) {
    applyDefaultBrand()
  } else {
    applyTiendaBrand(userData.tienda.primaryColor)
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('pos_user')
    const token = localStorage.getItem('pos_token')
    if (stored && token) {
      try {
        const parsed = JSON.parse(stored)
        setUser(parsed)
        applyBrandFor(parsed)
        // refresca secciones/rol/tienda por si el admin cambió permisos o color desde el último login
        apiMe()
          .then((r) => {
            const fresh = r.data.data
            const merged = {
              ...parsed,
              role: fresh.role?.name ?? parsed.role,
              sections: fresh.role?.sections ?? parsed.sections,
              tienda: fresh.tienda ?? parsed.tienda,
            }
            localStorage.setItem('pos_user', JSON.stringify(merged))
            setUser(merged)
            applyBrandFor(merged)
          })
          .catch(() => {})
      } catch { logout() }
    } else {
      applyDefaultBrand()
    }
    setLoading(false)
  }, [])

  async function login(email, password) {
    const res = await apiLogin({ email, password })
    const { token, ...userData } = res.data.data
    localStorage.setItem('pos_token', token)
    localStorage.setItem('pos_user', JSON.stringify(userData))
    setUser(userData)
    applyBrandFor(userData)
    return userData
  }

  function logout() {
    localStorage.removeItem('pos_token')
    localStorage.removeItem('pos_user')
    setUser(null)
    applyDefaultBrand()
  }

  const isAdmin = user?.role === 'ADMIN'
  const hasSection = (code) => !!user?.sections?.includes(code)

  // Actualiza campos de user.tienda en memoria + localStorage al instante, sin
  // recargar ni volver a loguear. Usado por Apariencia (color) y Datos de la
  // tienda (nombre, logo) justo después de guardar en el backend.
  function patchTienda(partial) {
    if (!user?.tienda) return
    const merged = { ...user, tienda: { ...user.tienda, ...partial } }
    localStorage.setItem('pos_user', JSON.stringify(merged))
    setUser(merged)
    if ('primaryColor' in partial) applyBrandFor(merged)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, hasSection, loading, patchTienda }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
