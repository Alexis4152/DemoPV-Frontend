// Códigos de producto generados por el sistema: 8 dígitos = tienda (3) + consecutivo (5),
// ej. 00200001 = tienda 2, producto 1 (ver ProductBarcodeService en el backend). La
// búsqueda por código ya está acotada a la tienda del usuario; esto solo sirve para que,
// cuando un código escaneado no se encuentra, el mensaje diga si es de otra tienda en
// vez de un "no encontrado" genérico.

const GENERATED_CODE = /^\d{8}$/

/**
 * Número de tienda de un código generado de OTRA tienda, o null si el código no tiene el
 * formato generado o es de la tienda actual.
 *
 * @param {string} code Código escaneado.
 * @param {number|undefined} tiendaId Tienda en la que se está trabajando.
 * @returns {number|null}
 */
export function foreignTiendaOf(code, tiendaId) {
  if (!tiendaId || !GENERATED_CODE.test(code)) return null
  const owner = Number(code.slice(0, 3))
  return owner !== Number(tiendaId) ? owner : null
}

/**
 * Mensaje para un código que no se encontró en la tienda actual.
 *
 * @param {string} code Código escaneado.
 * @param {number|undefined} tiendaId Tienda en la que se está trabajando.
 * @returns {string}
 */
export function barcodeNotFoundMessage(code, tiendaId) {
  const owner = foreignTiendaOf(code, tiendaId)
  return owner ? `El código "${code}" es de otra tienda (tienda ${owner})` : `Código "${code}" no encontrado`
}
