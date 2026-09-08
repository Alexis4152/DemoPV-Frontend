import axios from 'axios'

/**
 * Instancia central de axios usada por todos los módulos de `src/api/*.js`.
 *
 * En desarrollo (sin `VITE_API_URL` definida) usa `/api`, ruta relativa que se apoya en
 * el proxy de Vite hacia el backend Spring Boot en `localhost`. En producción, el front
 * se despliega como sitio estático separado del backend (dominios/contenedores distintos),
 * así que `/api` ya no resolvería a ningún lado — ahí se usa `VITE_API_URL` (variable de
 * entorno inyectada en build time) apuntando a la URL pública real del backend.
 */
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

/**
 * Interceptor de request: adjunta el JWT de la sesión activa a cada petición saliente, y
 * — solo para un SUPER_ADMIN o SUPERVISOR que ya eligió con cuál tienda actuar (ver
 * `AuthContext#selectTienda`) — el header {@code X-Acting-Tienda-Id} con el id de esa
 * tienda, para que el backend sepa sobre cuál operar (ver {@code TenantScope} del
 * backend). Para cualquier otro rol nunca se manda: su tienda siempre es la propia, sin
 * necesidad de este header (y aunque se mandara, el backend lo ignora por completo salvo
 * que el actor sea SUPER_ADMIN o SUPERVISOR — y a un SUPERVISOR encima le verifica que esa
 * tienda de verdad le pertenezca antes de confiar en el header).
 *
 * El JWT se lee de `localStorage.pos_token` (colocado ahí por `AuthContext` tras el
 * login) y, si existe, se agrega como header `Authorization: Bearer <token>`. Así ningún
 * módulo de `api/*.js` necesita preocuparse por la autenticación ni por la tienda
 * actuante: basta con importar esta instancia `api` para que las peticiones ya vayan
 * autenticadas y (si aplica) apuntando a la tienda correcta.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pos_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  try {
    const stored = localStorage.getItem('pos_user')
    const user = stored ? JSON.parse(stored) : null
    if ((user?.role === 'SUPER_ADMIN' || user?.role === 'SUPERVISOR') && user?.tienda?.id) {
      config.headers['X-Acting-Tienda-Id'] = String(user.tienda.id)
    }
  } catch {
    // pos_user corrupto o ilegible: simplemente no se manda el header, no debe tumbar la petición
  }
  return config
})

/**
 * Interceptor de response: maneja de forma centralizada la expiración/invalidez de sesión.
 *
 * Si el backend responde 401 (token vencido o inválido), se limpia la sesión guardada
 * (`pos_token`, `pos_user`) y se redirige a `/login`, evitando que cada componente tenga
 * que detectar y manejar el 401 por su cuenta.
 *
 * Se excluye explícitamente la petición de login (`/auth/login`): un 401 ahí significa
 * "credenciales inválidas", no "sesión expirada", y no debe disparar un logout/redirect
 * que taparía el mensaje de error de la pantalla de login.
 */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginRequest = err.config?.url?.includes('/auth/login')
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('pos_token')
      localStorage.removeItem('pos_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
