import qz from 'qz-tray'
import { getSaleTicketEscPos } from '../api/sales'

/**
 * Puente con la impresora térmica de tickets (USB) y el cajón de dinero (conectado por
 * RJ11 a la propia impresora), usando QZ Tray como agente local.
 *
 * Por qué existe esto: el backend corre en un servidor en la nube y no tiene forma de
 * hablarle a un puerto USB de la computadora de la caja — ningún navegador puede hacerlo
 * tampoco, por seguridad. QZ Tray es una aplicación pequeña que el cajero instala UNA VEZ
 * en su propia computadora; corre en segundo plano y expone un WebSocket en
 * localhost que esta página sí puede usar para mandarle bytes crudos a la impresora.
 *
 * Requisito en la máquina de la caja: tener QZ Tray instalado y corriendo
 * (https://qz.io/download/). Sin eso, imprimir/abrir el cajón desde aquí no es posible —
 * fallará con un error claro, no en silencio.
 *
 * No se configuró firma digital de certificado (eso es para distribuir a muchas
 * computadoras sin que salga ningún aviso). Con la conexión sin firmar, QZ Tray va a
 * pedirle una vez al cajero que "permita" la conexión desde este sitio — normal, se
 * puede marcar "recordar esta decisión" para que no vuelva a preguntar.
 */

let securityConfigured = false

function ensureSecurityConfigured() {
  if (securityConfigured) return
  // Sin certificado/firma: QZ Tray simplemente le pedirá una vez al usuario que autorice
  // la conexión desde este sitio, en vez de aceptarla en automático y sin aviso.
  qz.security.setCertificatePromise((resolve) => resolve())
  qz.security.setSignaturePromise(() => (resolve) => resolve())
  securityConfigured = true
}

async function ensureConnected() {
  ensureSecurityConfigured()
  if (qz.websocket.isActive()) return
  try {
    await qz.websocket.connect({ retries: 2, delay: 1 })
  } catch (err) {
    throw new Error(
      'No se pudo conectar con QZ Tray. Verifica que esté instalado y corriendo en esta computadora (https://qz.io/download/).'
    )
  }
}

/**
 * Nombre de impresora a usar, si el usuario configuró una específica en esta máquina
 * (útil cuando la computadora tiene más de una impresora instalada y la térmica no es
 * la que el sistema marca como predeterminada).
 */
const PRINTER_NAME_KEY = 'pos_escpos_printer_name'

export function getConfiguredPrinterName() {
  try {
    return localStorage.getItem(PRINTER_NAME_KEY) || ''
  } catch {
    return ''
  }
}

export function setConfiguredPrinterName(name) {
  try {
    if (name) localStorage.setItem(PRINTER_NAME_KEY, name)
    else localStorage.removeItem(PRINTER_NAME_KEY)
  } catch {
    // localStorage no disponible; simplemente no se recuerda la preferencia
  }
}

/** Lista los nombres de impresoras que QZ Tray ve instaladas en esta computadora. */
export async function listPrinters() {
  await ensureConnected()
  return qz.printers.find()
}

/**
 * Imprime el ticket de una venta ya registrada en la impresora térmica configurada, y
 * abre el cajón de dinero si la venta fue en efectivo (eso lo decide el backend, no esta
 * función — ver `EscPosTicketService` en el backend).
 *
 * @param {number|string} saleId Id de la venta a imprimir.
 * @throws {Error} con un mensaje en español listo para mostrarle al cajero, si QZ Tray
 *   no está disponible o la impresión falla.
 */
export async function printSaleTicket(saleId) {
  const res = await getSaleTicketEscPos(saleId)
  const hex = res.data?.data
  if (!hex) throw new Error('El servidor no devolvió el contenido del ticket.')

  await ensureConnected()

  const configuredName = getConfiguredPrinterName()
  const printer = configuredName || (await qz.printers.getDefault())
  const config = qz.configs.create(printer)

  const data = [
    {
      type: 'raw',
      format: 'hex',
      flavor: 'plain',
      data: hex,
    },
  ]

  try {
    await qz.print(config, data)
  } catch (err) {
    throw new Error(
      `No se pudo imprimir el ticket (¿está encendida y conectada la impresora "${printer}"?): ${err?.message || err}`
    )
  }
}
