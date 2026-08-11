/**
 * Catálogo de módulos/secciones de la aplicación disponibles para RBAC.
 *
 * Debe reflejar uno a uno el enum `AppSection` del backend: el campo `code` de cada
 * entrada es el mismo string que el backend usa para identificar la sección dentro
 * de un rol (`role.sections`) y dentro de `user.sections` (las secciones habilitadas
 * para el usuario autenticado, derivadas de su rol).
 *
 * Cada entrada define, además del `code`, cómo se representa esa sección en la UI:
 * - `label`: texto mostrado en la navegación.
 * - `icon`: emoji usado como ícono en la navegación.
 * - `to`: ruta de React Router a la que enlaza.
 *
 * Consumido principalmente por:
 * - `Layout.jsx`, para construir el menú de navegación filtrando estas entradas
 *   contra `user.sections` (vía `hasSection` de `AuthContext`).
 * - `PrivateRoute.jsx`, para bloquear el acceso directo por URL a una ruta cuya
 *   sección no esté habilitada para el usuario.
 *
 * Si el backend agrega/renombra un valor de `AppSection`, este arreglo debe
 * actualizarse en conjunto para mantener el RBAC del frontend sincronizado.
 */
export const SECTIONS = [
  { code: 'DASHBOARD', label: 'Dashboard', icon: '📊', to: '/' },
  { code: 'POS', label: 'Punto de Venta', icon: '🛒', to: '/pos' },
  { code: 'INVENTORY', label: 'Inventario', icon: '📦', to: '/inventory' },
  { code: 'SALES', label: 'Ventas', icon: '📋', to: '/sales' },
  { code: 'CASH_CUTS', label: 'Cortes de Caja', icon: '💰', to: '/cash-cuts' },
  { code: 'REPORTS', label: 'Reportes', icon: '📈', to: '/reports' },
  { code: 'USERS', label: 'Usuarios', icon: '👥', to: '/users' },
  { code: 'ROLES', label: 'Roles y Permisos', icon: '🔑', to: '/roles' },
]
