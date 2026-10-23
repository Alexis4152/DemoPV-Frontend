// Catálogo de los 6 derechos ARCO que reconoce el sistema (Ley Federal de Protección de
// Datos Personales en Posesión de los Particulares) — compartido entre el formulario
// público (ArcoRequest.jsx), "Mis solicitudes" (MyArcoRequests.jsx) y la administración
// (ArcoRequests.jsx) para no triplicar la misma lista.
export const ARCO_TYPES = [
  ['ACCESS', 'Acceso', 'Quiero saber qué datos personales míos tienen y para qué los usan.'],
  ['RECTIFICATION', 'Rectificación', 'Mis datos están incompletos o tienen un error — quiero corregirlos.'],
  ['CANCELLATION', 'Cancelación', 'Quiero que eliminen mis datos personales.'],
  ['OPPOSITION', 'Oposición', 'No quiero que usen mis datos personales para algo en particular.'],
  ['REVOCATION', 'Revocación', 'Quiero revocar un consentimiento que ya había dado.'],
  ['LIMITATION', 'Limitación', 'Quiero limitar un uso o divulgación específica de mis datos.'],
]

export const ARCO_TYPE_LABELS = Object.fromEntries(ARCO_TYPES.map(([v, l]) => [v, l]))

// Mismos 4 tipos que en Citas exigen volver a confirmar la contraseña cuando se levantan
// desde una cuenta ya autenticada — son los que de verdad exponen o alteran datos
// sensibles; Oposición/Limitación solo detienen un uso puntual.
export const ARCO_STRONG_IDENTITY_TYPES = ['ACCESS', 'RECTIFICATION', 'CANCELLATION', 'REVOCATION']

export const ARCO_STATUS_LABELS = {
  PENDING_EMAIL: { label: 'Falta confirmar correo', color: 'bg-gray-100 text-gray-600' },
  PENDING: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  INFO_REQUESTED: { label: 'Esperando información', color: 'bg-orange-100 text-orange-700' },
  APPROVED: { label: 'Aprobada — falta ejecutar', color: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Completada', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rechazada', color: 'bg-red-100 text-red-700' },
  NOT_FILED: { label: 'No presentada', color: 'bg-gray-100 text-gray-500' },
}

export const ARCO_CHANNEL_LABELS = {
  WEB: 'Formulario público',
  ACCOUNT: 'Cuenta propia',
  IN_PERSON: 'Mostrador',
}

// Guía de "qué significa este tipo de solicitud" y "cómo resolverla en este sistema en
// concreto" — pensada para un SUPER_ADMIN que nunca ha atendido una. Nada de esto reemplaza
// criterio legal real, es una guía operativa de dónde tocar en la app.
export const ARCO_TYPE_GUIDANCE = {
  ACCESS: {
    meaning: 'La persona quiere saber qué datos personales suyos tiene el sistema y para qué se usan.',
    howTo: 'Verifica su identidad y responde PROCEDENTE. Al ejecutar, el sistema arma automáticamente un resumen de sus datos (cuenta, ventas y apartados a su nombre) y lo adjunta a la constancia que se le envía por correo.',
  },
  RECTIFICATION: {
    meaning: 'Sus datos están incompletos o tienen un error, y quiere que los corrijas.',
    howTo: 'Verifica su identidad. Si es personal con cuenta, corrígelo desde Usuarios antes de ejecutar. Si es un dato de una venta o apartado, revisa si todavía se puede editar sin afectar la contabilidad (un ticket ya facturado normalmente no se toca). Describe en la ejecución qué corregiste y dónde.',
  },
  CANCELLATION: {
    meaning: 'Quiere que elimines sus datos personales.',
    howTo: 'Verifica su identidad. Al ejecutar, si tiene cuenta de usuario el sistema la desactiva automáticamente. Las ventas/apartados tienen obligación fiscal y NO se borran — descríbelo así en la ejecución.',
  },
  OPPOSITION: {
    meaning: 'No quiere que uses sus datos para algo en particular (ej. que le mandes avisos o promociones).',
    howTo: 'Identifica el uso puntual del que se queja y detenlo a mano (ej. quítala de avisos). Un uso ya consumado (el ticket de una compra que ya hizo) no se puede "deshacer" retroactivamente. Describe en la ejecución qué uso se detuvo.',
  },
  REVOCATION: {
    meaning: 'Quiere revocar un consentimiento que había dado antes para tratar sus datos.',
    howTo: 'Verifica su identidad. Revisa para qué había dado consentimiento y detenlo a mano (similar a Oposición, pero sobre un consentimiento específico ya otorgado). Describe en la ejecución qué se revocó.',
  },
  LIMITATION: {
    meaning: 'Quiere limitar un uso o divulgación específica de sus datos, sin llegar a cancelarlos del todo.',
    howTo: 'Identifica el uso/divulgación específica y acótalo a mano. Describe en la ejecución qué límite se aplicó.',
  },
}
