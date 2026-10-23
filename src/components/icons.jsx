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

// ── Iconos del menú de "Reportes" (uno por tipo de reporte del catálogo, ver
// ReportCatalogService#CATALOG en el backend) ──────────────────────────────────────────

export const ReceiptIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 3h16v18l-3-2-2 2-2-2-2 2-2-2-2 2-3-2Z" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
)

export const TagIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M20.6 12.6 13 20.2a2 2 0 0 1-2.8 0L3 13V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8Z" />
    <circle cx="8" cy="8" r="1.4" />
  </svg>
)

export const ClipboardListIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z" />
    <path d="M9 10h6M9 13h6M9 16h4" />
  </svg>
)

export const ClockHistoryIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l3 2" />
    <path d="M5 4 3 6M19 4l2 2" />
  </svg>
)

export const BoxesIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 8l6-3 6 3-6 3-6-3Z" /><path d="M3 8v7l6 3M9 11v7" />
    <path d="M15 8l6-3M21 5v7l-6 3V11" />
  </svg>
)

export const AlertTriangleIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M10.3 3.9 2.9 17a1.8 1.8 0 0 0 1.6 2.7h15a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />
    <path d="M12 9v4" /><path d="M12 16.5h.01" />
  </svg>
)

export const CoinsIcon = (props) => (
  <svg {...base} {...props}>
    <ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
    <path d="M3 12v5c0 1.7 2.7 3 6 3 1 0 2-.1 2.8-.4" />
    <ellipse cx="17" cy="14" rx="4" ry="2" /><path d="M13 14v4c0 1.1 1.8 2 4 2s4-.9 4-2v-4" />
  </svg>
)

export const WalletIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2H5a2 2 0 0 1-2-2Z" />
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5" />
    <circle cx="16" cy="14" r="1.2" />
  </svg>
)

export const UsersIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <circle cx="17.5" cy="9" r="2.4" /><path d="M15.5 14c2.8.3 5 2.6 5 6" />
  </svg>
)

export const TrendingUpIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" />
  </svg>
)

export const CalendarRangeIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18" />
    <path d="M8 2v4M16 2v4" /><path d="M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2" />
  </svg>
)

export const LandmarkIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 10l9-6 9 6" /><path d="M5 10v9M9 10v9M15 10v9M19 10v9" />
    <path d="M3 21h18" />
  </svg>
)

export const BarcodeIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 5v14M7 5v14M10 5v14M14 5v14M17 5v14M21 5v14" />
  </svg>
)
