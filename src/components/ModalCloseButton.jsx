/**
 * Botón "X" de cierre en la esquina superior derecha de un modal. Los modales del sistema
 * ya no se cierran con un clic afuera (era fácil perder lo capturado por un clic de más):
 * se cierran con esta X o con Esc. El contenedor del modal debe tener `relative`.
 *
 * @param {{ onClick: () => void, disabled?: boolean }} props
 */
export default function ModalCloseButton({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      aria-label="Cerrar"
      title="Cerrar (Esc)"
      onClick={onClick}
      disabled={disabled}
      className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-2xl leading-none text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      ×
    </button>
  )
}
