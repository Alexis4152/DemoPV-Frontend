import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, me as apiMe } from '../api/auth'
import { applyDefaultBrand, applyTiendaBrand } from '../utils/theme'

const AuthContext = createContext(null)

// SUPER_ADMIN no pertenece a ninguna tienda → siempre azul Nexora fijo.
// El resto sigue el color que su tienda haya elegido (o Nexora si no eligió ninguno).
/**
 * Decide y aplica el color de marca (branding/theming) que corresponde al usuario dado.
 *
 * Los usuarios `SUPER_ADMIN` (que no pertenecen a ninguna tienda) y cualquier usuario
 * sin `tienda.primaryColor` definido siempre ven el azul fijo "Nexora" por defecto.
 * El resto de usuarios ve el color elegido por el administrador de su tienda
 * (pantalla de Apariencia). Es una función interna, no se expone en el contexto.
 *
 * @param {object|null} userData - Usuario en sesión (o `null` si no hay ninguno).
 * @returns {void}
 */
function applyBrandFor(userData) {
  if (!userData || userData.role === 'SUPER_ADMIN' || !userData.tienda?.primaryColor) {
    applyDefaultBrand()
  } else {
    applyTiendaBrand(userData.tienda.primaryColor)
  }
}

/**
 * Proveedor del contexto de autenticación/sesión de la aplicación.
 *
 * Es la fuente central de verdad sobre "quién es el usuario actual": mantiene el
 * `user` en memoria (sincronizado con `localStorage`, claves `pos_user`/`pos_token`)
 * y expone `login`/`logout`, los flags derivados `isAdmin`/`hasSection` (RBAC), y
 * `patchTienda` para reflejar en caliente cambios en los datos de la tienda.
 *
 * Al montar, si hay una sesión guardada en `localStorage` la restaura de inmediato
 * (para evitar parpadeos de UI) y en paralelo llama a `apiMe()` para refrescar
 * rol/secciones/tienda por si cambiaron desde el último login (p. ej. el admin
 * quitó un permiso o cambió el color de marca), fusionando el resultado sobre el
 * usuario ya cargado.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
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

  /**
   * Inicia sesión contra el backend, persiste el token y los datos del usuario en
   * `localStorage`, actualiza el estado en memoria y aplica el color de marca que
   * corresponda al usuario recién autenticado.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>} Los datos del usuario autenticado (sin el token).
   */
  async function login(email, password) {
    const res = await apiLogin({ email, password })
    const { token, ...userData } = res.data.data
    localStorage.setItem('pos_token', token)
    localStorage.setItem('pos_user', JSON.stringify(userData))
    setUser(userData)
    applyBrandFor(userData)
    return userData
  }

  /**
   * Cierra la sesión actual: limpia `localStorage` (token y usuario), resetea el
   * estado `user` y vuelve a aplicar el color de marca por defecto ("Nexora").
   */
  function logout() {
    localStorage.removeItem('pos_token')
    localStorage.removeItem('pos_user')
    setUser(null)
    applyDefaultBrand()
  }

  /** `true` si el usuario en sesión tiene el rol `ADMIN` (administrador de su tienda). */
  const isAdmin = user?.role === 'ADMIN'
  /** Indica si el usuario en sesión tiene habilitada la `AppSection` con el código dado (RBAC). */
  const hasSection = (code) => !!user?.sections?.includes(code)

  // Actualiza campos de user.tienda en memoria + localStorage al instante, sin
  // recargar ni volver a loguear. Usado por Apariencia (color) y Datos de la
  // tienda (nombre, logo) justo después de guardar en el backend.
  /**
   * Fusiona `partial` sobre `user.tienda` (en memoria y en `localStorage`) sin
   * necesidad de recargar la página ni volver a autenticar. Si `partial` incluye
   * `primaryColor`, también reaplica el color de marca para reflejar el cambio
   * de inmediato (p. ej. en el logo/sidebar).
   *
   * No hace nada si el usuario actual no tiene `tienda` asociada (caso `SUPER_ADMIN`).
   *
   * @param {object} partial - Campos parciales de `tienda` a fusionar (p. ej. `{ primaryColor }` o `{ name, logoPath }`).
   * @returns {void}
   */
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

/** Hook de acceso al contexto de autenticación (`user`, `login`, `logout`, `isAdmin`, `hasSection`, `patchTienda`, `loading`). */
export const useAuth = () => useContext(AuthContext)
