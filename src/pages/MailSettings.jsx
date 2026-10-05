import { useEffect, useState } from 'react'
import { getMailConfig, updateMailConfig } from '../api/mailConfig'
import { useNotify } from '../context/NotifyContext'

/**
 * Pantalla "Correo del sistema": administra la ÚNICA cuenta SMTP con la que el backend
 * manda todos los correos de la plataforma (tickets de venta, reportes de cierre de caja,
 * avisos de apartados, recuperación de contraseña, alta de usuarios) — antes vivía fija en
 * `application.properties`, ahora se guarda en la tabla `mail_config` y se puede rotar sin
 * redeploy.
 *
 * Exclusiva de SUPER_ADMIN (ver `PrivateRoute superAdminOnly` en `App.jsx`): es
 * infraestructura de toda la plataforma, no algo por tienda. El correo que cada tienda SÍ
 * puede editar por su cuenta (para que sus clientes le respondan a ella y no a esta cuenta
 * centralizada) vive en "Datos de la tienda" → Correo de contacto.
 *
 * `smtpPassword` es de solo escritura: nunca se precarga con la contraseña real (el backend
 * jamás la manda de vuelta), solo se manda si el usuario escribe una nueva — dejar el campo
 * en blanco conserva la que ya está guardada.
 */
export default function MailSettings() {
  const { notify, confirmDialog } = useNotify()
  const [form, setForm] = useState(null)
  const [passwordConfigured, setPasswordConfigured] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getMailConfig().then((r) => {
      const cfg = r.data.data
      setForm({ enabled: cfg.enabled, smtpHost: cfg.smtpHost, smtpPort: cfg.smtpPort, smtpUsername: cfg.smtpUsername })
      setPasswordConfigured(cfg.passwordConfigured)
    }).finally(() => setLoading(false))
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    if (!(await confirmDialog(
      'Estos cambios afectan el envío de correo de TODAS las tiendas del sistema (tickets, cortes, apartados, recuperación de contraseña). ¿Continuar?',
      { confirmText: 'Guardar configuración', danger: true }
    ))) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = { ...form, smtpPort: Number(form.smtpPort) }
      if (newPassword.trim()) payload.smtpPassword = newPassword.trim()
      const res = await updateMailConfig(payload)
      setPasswordConfigured(res.data.data.passwordConfigured)
      setNewPassword('')
      setMessage('Configuración guardada')
      notify('Configuración de correo actualizada', 'success')
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) return <p className="text-gray-400 text-sm">Cargando...</p>

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Correo del sistema</h1>
      <p className="text-gray-500 text-sm mb-6">
        Cuenta SMTP única con la que salen los correos de <span className="font-medium">todas las tiendas</span>:
        tickets de venta, reportes de cierre de caja, apartados y recuperación de contraseña.
      </p>

      <form onSubmit={handleSave} className="card space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          <span className="text-sm font-semibold text-gray-800">Envío de correo habilitado</span>
        </label>
        <p className="text-xs text-gray-500 -mt-2">
          Si lo apagas, el sistema sigue funcionando normal (ventas, cortes, apartados) pero ningún correo sale — solo
          queda registrado en el log del servidor.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Host SMTP</label>
            <input
              type="text" className="input" required
              value={form.smtpHost}
              onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Puerto</label>
            <input
              type="number" className="input" required
              value={form.smtpPort}
              onChange={(e) => setForm({ ...form, smtpPort: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta (usuario)</label>
            <input
              type="email" className="input" required
              value={form.smtpUsername}
              onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password" className="input"
              placeholder={passwordConfigured ? 'Ya hay una guardada — déjalo en blanco para conservarla' : 'Sin configurar'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Para Gmail, no es tu contraseña normal: es una "contraseña de aplicación" generada desde la
              configuración de seguridad de esa cuenta de Google.
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-3">
          El "De:" de cada correo siempre sale con esta cuenta (Gmail no permite mandar con un remitente distinto al
          autenticado) — lo que cambia por tienda es el nombre visible y el "Responder a", configurables por cada
          tienda en Datos de la tienda → Correo de contacto.
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{message}</div>
        )}

        <button className="btn-primary" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </form>
    </div>
  )
}
