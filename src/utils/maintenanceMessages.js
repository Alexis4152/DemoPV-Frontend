// Plantilla fija del aviso de mantenimiento que ve cualquiera en el Login (cualquier
// tienda, es de plataforma) — lo único que el SUPER_ADMIN elige al programar una ventana
// son las fechas/horas (ver Maintenance.jsx); el resto del texto es siempre este mismo,
// para que el aviso sea consistente sin importar quién lo programe. Login.jsx y la vista
// previa de Maintenance.jsx comparten estas mismas funciones para no tener el texto
// duplicado (y que nunca se desincronicen entre sí).

function formatDay(iso) {
  return new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

/** Aviso que se ve ANTES de que empiece la ventana (fase "SCHEDULED"). */
export function scheduledMaintenanceMessage(startAt, endAt) {
  const sameDay = new Date(startAt).toDateString() === new Date(endAt).toDateString()
  const when = sameDay
    ? `el ${formatDay(startAt)}, de ${formatTime(startAt)} a ${formatTime(endAt)} hrs`
    : `del ${formatDay(startAt)} a las ${formatTime(startAt)} hrs, hasta el ${formatDay(endAt)} a las ${formatTime(endAt)} hrs`
  return `Estimado usuario: tendremos una ventana de mantenimiento programada ${when} (hora aproximada). `
    + 'Durante ese tiempo el sistema podría no estar disponible. Agradecemos tu paciencia.'
}

/** Aviso que se ve MIENTRAS la ventana está en curso (fase "ACTIVE"). */
export function activeMaintenanceMessage(endAt) {
  return `Estimado usuario: en este momento estamos realizando mantenimiento al sistema. `
    + `Hora estimada de finalización: ${formatTime(endAt)} hrs. Agradecemos tu paciencia.`
}
