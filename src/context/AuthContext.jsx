import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, me as apiMe } from '../api/auth'
import { applyDefaultBrand, applyTiendaBrand } from '../utils/theme'

const AuthContext = createContext(null)

// Un SUPER_ADMIN no tiene tienda propia en el backend (siempre null ahí) — pero en el
// frontend, en cuanto elige con cuál tienda actuar (ver `selectTienda`), su `user.tienda`
// SÍ se llena con esa tienda, exactamente como si fuera su ADMIN. Por diseño: así todo el
// resto de la app (Layout, POS, Apartados, Appearance, StoreInfo, Reports...) que ya lee
// `user.tienda` para pintar nombre/logo/color o resolver límites de descuento funciona
// igual para un SUPER_ADMIN actuando, sin tener que tocar cada una de esas pantallas por
// separado. Mientras no ha elegido ninguna, `user.tienda` sigue siendo null — es la señal
// que usa `PrivateRoute` para mandarlo al selector (`SelectTienda.jsx`).
/**
 * Decide y aplica el color de marca (branding/theming) que corresponde al usuario dado.
 *
 * Sin `tienda` (todavía no hay sesión, o es un SUPER_ADMIN que no ha elegido ninguna) o
 * sin `primaryColor` definido en ella, se ve el azul fijo "Nexora" por defecto. Con una
 * tienda con color propio, se ve ese. Es una función interna, no se expone en el contexto.
 *
 * @param {object|null} userData - Usuario en sesión (o `null` si no hay ninguno).
 * @returns {void}
 */
function applyBrandFor(userData) {
  if (!userData?.tienda?.primaryColor) {
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
 * y expone `login`/`logout`, los flags derivados `isAdmin`/`isSuperAdmin`/`hasSection`
 * (RBAC), `patchTienda` para reflejar en caliente cambios en los datos de la tienda, y
 * `selectTienda`/`clearSelectedTienda` para que un SUPER_ADMIN elija (o cambie) sobre
 * cuál tienda está actuando.
 *
 * Al montar, si hay una sesión guardada en `localStorage` la restaura de inmediato
 * (para evitar parpadeos de UI) y en paralelo llama a `apiMe()` para refrescar
 * rol/secciones/tienda por si cambiaron desde el último login (p. ej. el admin
 * quitó un permiso o cambió el color de marca), fusionando el resultado sobre el
 * usuario ya cargado. Para un SUPER_ADMIN, `apiMe()` siempre trae `tienda: null` (así es
 * en el backend) — el merge usa `??`, que solo reemplaza en `undefined`/`null` cuando el
 * lado izquierdo también lo es... en este caso si conserva `parsed.tienda` porque el
 * operador se evalúa sobre el valor de `fresh.tienda`, no sobre si cambió: `null ?? x`
 * siempre da `x`, así que la tienda elegida sobrevive al refresco sin ningún caso especial.
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

  /** `true` si el usuario en sesión es `SUPER_ADMIN` (usuario de plataforma, sin tienda
   *  propia — ve/administra todas, de una en una, vía `selectTienda`). */
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  /** `true` si el usuario en sesión es `SUPERVISOR` ("Supervisor de tiendas": usuario de
   *  plataforma sin tienda propia, con visibilidad total sobre el SUBCONJUNTO de tiendas
   *  que tenga asignadas — mismo mecanismo de `selectTienda` que SUPER_ADMIN, pero el
   *  backend solo le deja elegir entre las suyas). */
  const isSupervisor = user?.role === 'SUPERVISOR'
  /** `true` si el usuario en sesión es SUPER_ADMIN o SUPERVISOR — los dos roles "de
   *  plataforma" sin tienda propia que necesitan pasar por `SelectTienda.jsx` antes de
   *  usar el resto de la app (ver `PrivateRoute`) y que pueden "cambiar de tienda" desde
   *  el sidebar (ver `Layout`). */
  const isPlatformActor = isSuperAdmin || isSupervisor
  // Incluye a SUPER_ADMIN/SUPERVISOR a propósito: mientras están actuando sobre una tienda
  // (ver selectTienda), deben poder hacer TODO lo que su ADMIN podría — dar de alta/editar/
  // dar de baja productos y usuarios, ver el historial de cortes, cancelar ventas, entrar a
  // Apariencia/Datos de la tienda, etc. Son "un ADMIN con la posibilidad de pararse en
  // una o varias tiendas", no roles aparte con permisos propios — así que en todo el
  // frontend basta con revisar `isAdmin`, sin tener que acordarse de sumar estos flags en
  // cada pantalla una por una (el backend hace el cumplimiento real de todas formas, incluyendo
  // la jerarquía de quién puede crear/editar a quién).
  /** `true` si el usuario en sesión tiene el rol `ADMIN`, o es SUPER_ADMIN/SUPERVISOR
   *  actuando como tal sobre la tienda elegida — para efectos de qué puede hacer en la UI,
   *  cuentan igual. */
  const isAdmin = user?.role === 'ADMIN' || isPlatformActor
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
   * No hace nada si el usuario actual no tiene `tienda` asociada (SUPER_ADMIN sin
   * ninguna elegida todavía).
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

  // Apaga `mustChangePassword` en memoria + localStorage al instante, justo después de que
  // ChangePasswordRequired.jsx confirma el cambio en el backend — sin esto, PrivateRoute
  // seguiría rebotando al usuario a /change-password hasta el siguiente login.
  /** Marca en el usuario en sesión que ya no debe forzarse el cambio de contraseña. */
  function clearMustChangePassword() {
    if (!user) return
    const merged = { ...user, mustChangePassword: false }
    localStorage.setItem('pos_user', JSON.stringify(merged))
    setUser(merged)
  }

  // Reemplaza `user.tienda` por completo (no fusiona campos como `patchTienda`, que es
  // para editar la tienda ACTUAL) — usado únicamente por SelectTienda.jsx cuando un
  // SUPER_ADMIN elige con cuál tienda actuar. A partir de aquí el resto de la app ve esa
  // tienda como si fuera la suya (nombre/logo/color en el sidebar, límites de descuento en
  // POS/Apartados, etc.) — y `api/axios.js` manda su id en cada petición al backend
  // (header `X-Acting-Tienda-Id`) para que el aislamiento por tienda del lado del servidor
  // también sepa cuál es.
  /**
   * Establece la tienda sobre la que un SUPER_ADMIN va a actuar, en memoria y en
   * `localStorage`, y reaplica el color de marca de inmediato.
   *
   * @param {object} tienda - Tienda completa (id, name, logoPath, primaryColor, ...) elegida.
   * @returns {void}
   */
  function selectTienda(tienda) {
    if (!user) return
    const merged = { ...user, tienda }
    localStorage.setItem('pos_user', JSON.stringify(merged))
    setUser(merged)
    applyBrandFor(merged)
  }

  /**
   * Quita la tienda elegida (vuelve a `null`) — usado por el botón "Cambiar tienda" del
   * sidebar antes de mandar al SUPER_ADMIN/SUPERVISOR de vuelta al selector. Sin efecto
   * para cualquier otro rol (siempre tienen su propia tienda, no "eligen" ninguna).
   * @returns {void}
   */
  function clearSelectedTienda() {
    if (!user || !isPlatformActor) return
    const merged = { ...user, tienda: null }
    localStorage.setItem('pos_user', JSON.stringify(merged))
    setUser(merged)
    applyBrandFor(merged)
  }

  return (
    <AuthContext.Provider value={{
      user, login, logout, isAdmin, isSuperAdmin, isSupervisor, isPlatformActor, hasSection, loading,
      patchTienda, clearMustChangePassword, selectTienda, clearSelectedTienda,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

/** Hook de acceso al contexto de autenticación (`user`, `login`, `logout`, `isAdmin`,
 *  `isSuperAdmin`, `isSupervisor`, `isPlatformActor`, `hasSection`, `patchTienda`,
 *  `clearMustChangePassword`, `selectTienda`, `clearSelectedTienda`, `loading`). */
export const useAuth = () => useContext(AuthContext)
