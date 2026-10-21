/**
 * Traducción de los nombres de rol del SISTEMA (el identificador interno real, usado por
 * el backend para autorización — nunca cambia) a un texto en español para mostrarse en la
 * UI. Un rol personalizado (creado por un SUPER_ADMIN desde "Roles y Permisos") ya tiene
 * un nombre libre, normalmente en español — ese se muestra tal cual, sin pasar por este mapa.
 *
 * Roles de gestión (ver también SectionAccessService#MANAGEMENT_ROLES en el backend,
 * AuthService#SESSION_RESTRICTION_EXEMPT_ROLES): SUPER_ADMIN, SUPERVISOR, ADMIN. El cuarto
 * rol fijo del sistema es CASHIER. SELLER ya no se siembra en tiendas nuevas, pero se deja
 * su traducción por si una tienda antigua todavía lo tiene.
 */
const ROLE_LABELS = {
  SUPER_ADMIN: 'Súper Administrador',
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Administrador',
  CASHIER: 'Cajero',
  SELLER: 'Vendedor',
}

/** Nombres de los roles "de gestión": siempre tienen CRUD completo en cualquier sección
 *  que vean, nunca quedan sujetos a `actionGrants` (ver SectionAccessService#checkAction
 *  en el backend). */
export const MANAGEMENT_ROLE_NAMES = ['SUPER_ADMIN', 'SUPERVISOR', 'ADMIN']

/** Traduce el nombre interno de un rol a español si es uno de los roles fijos del
 *  sistema; cualquier otro nombre (rol personalizado) se devuelve tal cual. */
export function roleLabel(name) {
  return ROLE_LABELS[name] ?? name
}
