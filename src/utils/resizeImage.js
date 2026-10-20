// Reduce una foto antes de subirla. Las fotos de celular (sobre todo iPhone) pesan 2–5 MB
// y miden ~4000 px, mucho más de lo que se muestra en el inventario o la tienda pública —
// y un cuerpo así de grande puede rebotar en el proxy antes de llegar al backend. Aquí se
// redimensiona a MAX_SIDE px por el lado largo y se recomprime: JPEG/WEBP/HEIC salen como
// JPEG, PNG se queda PNG para no perder la transparencia. De paso se descartan los
// metadatos EXIF (ubicación GPS, modelo del teléfono), que el canvas no conserva.

const MAX_SIDE = 1600
const JPEG_QUALITY = 0.8

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}

/**
 * Redimensiona y recomprime una imagen en el navegador.
 *
 * @param {File} file Imagen elegida por el usuario.
 * @returns {Promise<File>} La imagen reducida, o la original si no se pudo procesar (formato
 *          que el navegador no decodifica) o si la versión reducida no pesa menos — en ese
 *          caso el backend sigue validando tipo y tamaño como siempre.
 */
export async function resizeImage(file) {
  let img
  try {
    img = await loadImage(file)
  } catch {
    return file
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.round(img.naturalWidth * scale)
  const height = Math.round(img.naturalHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, width, height)

  const isPng = file.type === 'image/png'
  const type = isPng ? 'image/png' : 'image/jpeg'
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, isPng ? undefined : JPEG_QUALITY))
  if (!blob || (scale === 1 && blob.size >= file.size)) return file

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto'
  return new File([blob], `${baseName}.${isPng ? 'png' : 'jpg'}`, { type, lastModified: Date.now() })
}
