/**
 * Convierte un `Date` a `'YYYY-MM-DD'` usando sus componentes en hora LOCAL, no UTC.
 * `Date#toISOString()` convierte primero a UTC, así que en zonas horarias detrás de UTC
 * (México, UTC-6) puede devolver el día siguiente si ya pasó cierta hora local (ej. las
 * 6pm en punto) — este helper evita ese corrimiento.
 * @param {Date} date
 * @returns {string} `'YYYY-MM-DD'` en hora local.
 */
export function toLocalDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Fecha de hoy en `'YYYY-MM-DD'`, en hora local (ver {@link toLocalDateStr}). */
export function todayLocalDateStr() {
  return toLocalDateStr(new Date())
}
