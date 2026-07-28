import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, me as apiMe } from '../api/auth'

const AuthContext = createContext(null)

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
        // refresca secciones/rol por si el admin cambió permisos desde el último login
        apiMe()
          .then((r) => {
            const fresh = r.data.data
            const merged = { ...parsed, role: fresh.role?.name ?? parsed.role, sections: (fresh.role?.sections ?? parsed.sections) }
            localStorage.setItem('pos_user', JSON.stringify(merged))
            setUser(merged)
          })
          .catch(() => {})
      } catch { logout() }
    }
    setLoading(false)
  }, [])

  async function login(email, password) {
    const res = await apiLogin({ email, password })
    const { token, ...userData } = res.data.data
    localStorage.setItem('pos_token', token)
    localStorage.setItem('pos_user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  function logout() {
    localStorage.removeItem('pos_token')
    localStorage.removeItem('pos_user')
    setUser(null)
  }

  const isAdmin = user?.role === 'ADMIN'
  const hasSection = (code) => !!user?.sections?.includes(code)

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, hasSection, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
