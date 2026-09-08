import { useEffect } from 'react'

/**
 * Cierra una modal/popup con la tecla ESC. El clic afuera se maneja aparte, con
 * `onClick` en el overlay (`fixed inset-0 ...`) que envuelve el contenido — este hook
 * solo cubre el teclado.
 *
 * @param {boolean} isOpen - Si la modal está abierta (el listener no se agrega si no).
 * @param {() => void} onClose - Se llama al presionar ESC mientras `isOpen` es `true`.
 */
export default function useEscapeClose(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])
}
