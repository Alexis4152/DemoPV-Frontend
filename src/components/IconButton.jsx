const VARIANTS = {
  default: 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700',
  primary: 'border-blue-200 text-blue-600 hover:bg-blue-50',
  purple: 'border-purple-200 text-purple-600 hover:bg-purple-50',
  danger: 'border-red-200 text-red-500 hover:bg-red-50',
  warning: 'border-amber-200 text-amber-600 hover:bg-amber-50',
}

/**
 * Botón de acción de fila — icono solo, sin texto — usado en las columnas de "Acciones" de
 * las tablas del portal (Inventario, Usuarios, Categorías, Ventas, Cortes de Caja,
 * Apartados, Roles). Reemplaza a los links de texto ("Editar", "Ajustar", "Desact.", etc.)
 * que había antes en cada tabla por separado — se pidió explícitamente que esto se viera
 * igual en todo el portal, no solo en Inventario.
 *
 * Sin texto visible, el nombre de la acción SOLO vive en `label` — por eso es obligatorio:
 * alimenta tanto el tooltip nativo (`title`, aparece al dejar el cursor encima) como
 * `aria-label` (lector de pantalla), nunca un botón icon-only se queda sin una forma de
 * saber qué hace.
 */
export default function IconButton({ icon: Icon, label, onClick, variant = 'default', disabled = false, type = 'button' }) {
  return (
    <button
      type={type}
      className={`w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg border transition-colors disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}
