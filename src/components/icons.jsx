/**
 * Set mínimo de iconos de trazo (24x24, stroke-based, sin relleno) usados por `IconButton`
 * en las columnas de "Acciones" de las tablas del portal — Inventario, Usuarios,
 * Categorías, Ventas, Cortes de Caja, Apartados, Roles. Mismo lenguaje visual que la
 * propuesta de diseño que se aprobó para Inventario, extendido al resto de la app para que
 * las acciones de fila se vean/funcionen igual en todas partes, en vez de links de texto en
 * algunas pantallas e iconos en otras.
 *
 * Cada uno es un componente de una sola línea que solo dibuja un `<svg>` — nada de estado,
 * nada de lógica. `props` se pasa tal cual (así `IconButton` le mete `className`/tamaño sin
 * que cada icono tenga que declarar esa prop a mano).
 */
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export const PencilIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

export const SlidersIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 21V14" /><path d="M4 10V3" />
    <path d="M12 21v-9" /><path d="M12 8V3" />
    <path d="M20 21v-5" /><path d="M20 12V3" />
    <circle cx="4" cy="12" r="2" /><circle cx="12" cy="10" r="2" /><circle cx="20" cy="14" r="2" />
  </svg>
)

export const ArchiveIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </svg>
)

export const TrashIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 7h16" />
    <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M10 11v6" /><path d="M14 11v6" />
  </svg>
)

export const EyeIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const XCircleIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15 9-6 6" /><path d="m9 9 6 6" />
  </svg>
)

export const CheckCircleIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 5-5" />
  </svg>
)

/** Usado para "Completar" en Apartados (cobrar/cerrar el apartado) — se mantiene distinto
 *  de {@link CheckCircleIcon} ("Confirmar") para que no se vean idénticos en la misma fila. */
export const CreditCardIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
  </svg>
)

export const PrinterIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M6 9V3h12v6" />
    <rect x="4" y="9" width="16" height="8" rx="2" />
    <path d="M6 17h12v5H6z" />
  </svg>
)

export const LogOutIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
    <path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
  </svg>
)
