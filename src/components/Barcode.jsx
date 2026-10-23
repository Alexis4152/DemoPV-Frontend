import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

/**
 * Código de barras Code 128 dibujado en SVG, con el código en texto abajo — el mismo
 * formato que las etiquetas impresas (ver BarcodeLabelPdfService en el backend). Fondo
 * blanco con margen ("quiet zone") para que una pistola lectora de imagen pueda leerlo
 * directo de la pantalla.
 *
 * @param {{ value: string, height?: number, className?: string }} props
 */
export default function Barcode({ value, height = 48, className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128', height, width: 2, margin: 10, fontSize: 14, displayValue: true,
        background: '#ffffff', lineColor: '#000000',
      })
    } catch {
      // Un valor que Code 128 no puede codificar: se deja el SVG vacío en vez de tronar.
    }
  }, [value, height])

  return <svg ref={ref} className={`max-w-full h-auto ${className}`} />
}
