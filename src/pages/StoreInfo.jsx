import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTiendaInfo, updateTiendaInfo, uploadTiendaLogo, removeTiendaLogo, getApartadosPromoPdf, getApartadosQrPng } from '../api/tiendas'
import { useNotify } from '../context/NotifyContext'
import { resolveMediaUrl } from '../utils/media'
import { openOrDownloadBlob } from '../utils/downloadBlob'
import defaultLogo from '../assets/logo.png'

// Mismo límite que TiendaLogoService en el backend (ver ese archivo) — validarlo aquí
// también evita el viaje redondo al servidor solo para enterarse de que pesa de más.
const MAX_LOGO_MB = 3

// Mismos límites reales de columna que TiendaInfoRequest en el backend (ver ese archivo) —
// redesSociales/notasAdicionales son TEXT sin límite de columna, su tope de 500 es solo de
// aplicación, igual que en ProductRequest.description.
const FIELDS = [
  { key: 'name', label: 'Nombre de la tienda', required: true, maxLength: 150 },
  { key: 'razonSocial', label: 'Razón social', maxLength: 200 },
  { key: 'rfc', label: 'RFC', maxLength: 20 },
  { key: 'telefono', label: 'Teléfono', maxLength: 30 },
  { key: 'paginaWeb', label: 'Página web', maxLength: 200 },
  { key: 'calle', label: 'Calle', maxLength: 200 },
  { key: 'colonia', label: 'Colonia', maxLength: 150 },
  { key: 'codigoPostal', label: 'Código postal', maxLength: 10 },
  { key: 'localidad', label: 'Localidad', maxLength: 150 },
  { key: 'estado', label: 'Estado', maxLength: 100 },
  { key: 'redesSociales', label: 'Redes sociales', textarea: true, maxLength: 500 },
  { key: 'notasAdicionales', label: 'Otros datos', textarea: true, maxLength: 500 },
]

const CONTACT_EMAIL_MAX = 150
const PUBLIC_SLUG_MAX = 80
const MONEY_MAX = 9999999999.99
const PERCENT_MAX = 100
const HOURS_MAX = 24
const money = (n) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 })

// Mismo patrón simple que el resto de la app para validar formato de correo del lado del
// cliente — no reemplaza al @Email real del backend, solo adelanta el error más común.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Sin type="number"/type="email" nativos en ningún input de este formulario (ver el JSX
// de abajo) — así se evita el globo de validación del navegador y la potencia "e" que
// permite type="number"; estos sanitizan lo que se escribe en su lugar.
const sanitizeDecimalInput = (raw) => {
  let v = raw.replace(/[^0-9.]/g, '')
  const firstDot = v.indexOf('.')
  if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '')
  return v
}
const sanitizeIntegerInput = (raw) => raw.replace(/[^0-9]/g, '')

// Pestañas en las que se agrupa el formulario — puramente visual: las cuatro viven
// dentro del mismo <form>/`handleSave`, así que cambiar de pestaña nunca pierde lo
// escrito en otra, y "Guardar cambios" (fuera del contenido de la pestaña, siempre
// visible) manda todo el `form` junto sin importar cuál esté abierta.
const TABS = [
  { key: 'general', label: 'General', icon: '🏬' },
  { key: 'ventas', label: 'Ventas', icon: '💰' },
  { key: 'apartados', label: 'Apartados', icon: '🛍️' },
]

/**
 * Pantalla "Datos de la tienda": edita los datos fiscales y de contacto de la tienda del
 * usuario en sesión (razón social, RFC, teléfono, dirección, redes sociales, etc.) y el
 * logo que se muestra en el sidebar y en el ticket de venta. Solo la puede editar el
 * `ADMIN` de esa tienda (según el copy de la propia pantalla); el control de acceso a la
 * ruta ya lo resuelve `PrivateRoute`.
 *
 * La dirección se captura en 5 campos separados (calle, colonia, código postal, localidad,
 * estado) en vez de un solo campo de texto libre, porque el backend imprime cada uno en su
 * propia línea dentro del ticket PDF de venta.
 *
 * Al guardar el nombre de la tienda o el logo, se usa `patchTienda()` de `AuthContext`
 * para reflejar el cambio de inmediato en el sidebar sin recargar la página.
 */
export default function StoreInfo() {
  const { user, patchTienda } = useAuth()
  const { notify, confirmDialog } = useNotify()
  const tiendaId = user?.tienda?.id

  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  // Solo al dar clic en "Guardar cambios" — mismo patrón que Usuarios/Roles/Categorías.
  const [fieldErrors, setFieldErrors] = useState({})
  const [downloadingPromo, setDownloadingPromo] = useState(false)
  const [downloadingQr, setDownloadingQr] = useState(false)
  const [activeTab, setActiveTab] = useState('general')

  // Carga los datos fiscales/de contacto actuales de la tienda para precargar el formulario.
  useEffect(() => {
    if (!tiendaId) return
    getTiendaInfo(tiendaId).then((r) => {
      const info = r.data.data
      setForm({
        name: info.tienda?.name || '',
        contactEmail: info.tienda?.contactEmail || '',
        razonSocial: info.razonSocial || '',
        rfc: info.rfc || '',
        telefono: info.telefono || '',
        paginaWeb: info.paginaWeb || '',
        calle: info.calle || '',
        colonia: info.colonia || '',
        codigoPostal: info.codigoPostal || '',
        localidad: info.localidad || '',
        estado: info.estado || '',
        redesSociales: info.redesSociales || '',
        notasAdicionales: info.notasAdicionales || '',
        maxDiscountAmount: info.tienda?.maxDiscountAmount ?? '',
        maxDiscountPercent: info.tienda?.maxDiscountPercent ?? '',
        apartadosEnabled: !!info.tienda?.apartadosEnabled,
        publicSlug: info.tienda?.publicSlug || '',
        maxApartadoDiscountAmount: info.tienda?.maxApartadoDiscountAmount ?? '',
        maxApartadoDiscountPercent: info.tienda?.maxApartadoDiscountPercent ?? '',
        defaultApartadoHours: info.tienda?.defaultApartadoHours ?? 24,
        dailySalesGoal: info.tienda?.dailySalesGoal ?? '',
        pollingIntervalSeconds: info.tienda?.pollingIntervalSeconds ?? 20,
      })
    }).finally(() => setLoading(false))
  }, [tiendaId])

  /**
   * Guarda los datos fiscales/de contacto de la tienda. Solo el nombre (`form.name`) se
   * refleja de inmediato en `AuthContext` vía `patchTienda`, porque es el único de estos
   * campos que se muestra en el sidebar; el resto (RFC, dirección, etc.) solo se usa en
   * el ticket PDF y no necesita propagarse a la sesión en memoria.
   *
   * Pide confirmación explícita antes de guardar: estos datos van directo al ticket que
   * se le entrega al cliente, así que un error aquí no se nota hasta que ya se imprimió.
   *
   * Los límites de descuento (`maxDiscountAmount`/`maxDiscountPercent`) se reflejan de
   * inmediato en `AuthContext` igual que el nombre, porque el POS los lee de `user.tienda`
   * para validar los descuentos del cajero sin tener que volver a iniciar sesión.
   */
  async function handleSave(e) {
    e.preventDefault()
    // Valida que ningún campo supere su máximo real (mismos límites que TiendaInfoRequest
    // en el backend) ANTES de pedir confirmación — así el usuario ve el error de inmediato
    // en vez de confirmar y que lo rechace el backend.
    const errors = {}
    for (const f of FIELDS) {
      const value = form[f.key] || ''
      if (f.maxLength && value.length > f.maxLength) {
        errors[f.key] = `${f.label} no puede tener más de ${f.maxLength} caracteres`
      }
    }
    if ((form.contactEmail || '').length > CONTACT_EMAIL_MAX) {
      errors.contactEmail = `El correo de contacto no puede tener más de ${CONTACT_EMAIL_MAX} caracteres`
    } else if (form.contactEmail && !EMAIL_RE.test(form.contactEmail)) {
      errors.contactEmail = 'El correo de contacto no es válido'
    }
    if ((form.publicSlug || '').length > PUBLIC_SLUG_MAX) {
      errors.publicSlug = `El enlace no puede tener más de ${PUBLIC_SLUG_MAX} caracteres`
    }
    if (form.dailySalesGoal !== '' && Number(form.dailySalesGoal) > MONEY_MAX) {
      errors.dailySalesGoal = `El número es excesivamente grande — el máximo permitido es ${money(MONEY_MAX)}`
    }
    if (form.maxDiscountAmount !== '' && Number(form.maxDiscountAmount) > MONEY_MAX) {
      errors.maxDiscountAmount = `El número es excesivamente grande — el máximo permitido es ${money(MONEY_MAX)}`
    }
    if (form.maxDiscountPercent !== '' && Number(form.maxDiscountPercent) > PERCENT_MAX) {
      errors.maxDiscountPercent = `El porcentaje máximo de descuento no puede ser mayor a ${PERCENT_MAX}`
    }
    if (form.maxApartadoDiscountAmount !== '' && Number(form.maxApartadoDiscountAmount) > MONEY_MAX) {
      errors.maxApartadoDiscountAmount = `El número es excesivamente grande — el máximo permitido es ${money(MONEY_MAX)}`
    }
    if (form.maxApartadoDiscountPercent !== '' && Number(form.maxApartadoDiscountPercent) > PERCENT_MAX) {
      errors.maxApartadoDiscountPercent = `El porcentaje máximo de descuento de apartado no puede ser mayor a ${PERCENT_MAX}`
    }
    if (form.apartadosEnabled) {
      if (form.defaultApartadoHours === '' || Number(form.defaultApartadoHours) < 1) {
        errors.defaultApartadoHours = 'Las horas que dura un apartado deben ser al menos 1'
      } else if (Number(form.defaultApartadoHours) > HOURS_MAX) {
        errors.defaultApartadoHours = `Las horas que dura un apartado no pueden ser más de ${HOURS_MAX}`
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    setFieldErrors({})
    if (!(await confirmDialog('¿Deseas guardar estos datos? Se usarán en el ticket de venta.', { confirmText: 'Guardar datos', danger: false }))) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const maxDiscountAmount = form.maxDiscountAmount === '' ? null : Number(form.maxDiscountAmount)
      const maxDiscountPercent = form.maxDiscountPercent === '' ? null : Number(form.maxDiscountPercent)
      const maxApartadoDiscountAmount = form.maxApartadoDiscountAmount === '' ? null : Number(form.maxApartadoDiscountAmount)
      const maxApartadoDiscountPercent = form.maxApartadoDiscountPercent === '' ? null : Number(form.maxApartadoDiscountPercent)
      const dailySalesGoal = form.dailySalesGoal === '' ? null : Number(form.dailySalesGoal)
      const pollingIntervalSeconds = Number(form.pollingIntervalSeconds) || 20
      const res = await updateTiendaInfo(tiendaId, {
        ...form, maxDiscountAmount, maxDiscountPercent, maxApartadoDiscountAmount, maxApartadoDiscountPercent, dailySalesGoal, pollingIntervalSeconds,
      })
      // El slug puede haber cambiado si lo dejaste en blanco (se autogenera) o si chocaba
      // con el de otra tienda (el backend lo hubiera rechazado antes de llegar aquí) — se
      // toma el que el backend confirmó, no lo que se escribió en el formulario.
      const savedSlug = res.data.data?.tienda?.publicSlug ?? form.publicSlug
      setForm((f) => ({ ...f, publicSlug: savedSlug }))
      patchTienda({
        name: form.name, maxDiscountAmount, maxDiscountPercent,
        apartadosEnabled: form.apartadosEnabled, publicSlug: savedSlug,
        maxApartadoDiscountAmount, maxApartadoDiscountPercent, defaultApartadoHours: Number(form.defaultApartadoHours) || 24,
        dailySalesGoal, pollingIntervalSeconds,
      })
      setMessage('Datos guardados')
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron guardar los datos')
    } finally {
      setSaving(false)
    }
  }

  // Sube el archivo de logo elegido y actualiza `AuthContext` con la nueva ruta para que
  // el sidebar/ticket lo reflejen sin recargar. Limpia el input file al terminar (éxito o
  // error) para permitir volver a seleccionar el mismo archivo si hace falta reintentar.
  async function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      setError(`El logo pesa demasiado — el máximo permitido es ${MAX_LOGO_MB} MB`)
      e.target.value = ''
      return
    }
    setUploadingLogo(true)
    setError('')
    setMessage('')
    try {
      const res = await uploadTiendaLogo(tiendaId, file)
      patchTienda({ logoPath: res.data.data.logoPath })
      setMessage('Logo actualizado')
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo subir el logo')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  // Quita el logo personalizado de la tienda; a partir de aquí se vuelve a usar el logo
  // por default (de Nexora) tanto en el sidebar como en el ticket.
  async function handleRemoveLogo() {
    setUploadingLogo(true)
    setError('')
    setMessage('')
    try {
      await removeTiendaLogo(tiendaId)
      patchTienda({ logoPath: null })
      setMessage('Se eliminó el logo, ahora se usa el logo por default')
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar el logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  /**
   * Descarga el PDF promocional de apartados (nombre de la tienda + QR a su vitrina
   * pública). Usa `openOrDownloadBlob` (ver ese archivo) en vez del patrón directo de
   * "blob + `<a download>`" porque ese no funciona en Safari de iOS — desde celular
   * abre el PDF en una pestaña nueva, desde donde se guarda con el botón nativo de
   * Compartir; en computadora dispara la descarga tal cual.
   *
   * Usa `form.publicSlug` tal como está en el campo de arriba, igual que "Copiar link":
   * si el admin lo cambió y no ha guardado, el QR va a apuntar a ese link sin guardar
   * todavía — hay que guardar primero para que el PDF quede con el link real.
   */
  async function handleDownloadPromoPdf() {
    setDownloadingPromo(true)
    try {
      const publicUrl = `${window.location.origin}/apartar/${form.publicSlug}`
      await openOrDownloadBlob(
        () => getApartadosPromoPdf(tiendaId, publicUrl),
        `apartados-${form.publicSlug}.pdf`,
        'application/pdf'
      )
    } catch (err) {
      notify('No se pudo generar el PDF promocional', 'error')
    } finally {
      setDownloadingPromo(false)
    }
  }

  /**
   * Descarga SOLO el código QR (sin el resto de la hoja) como imagen PNG independiente —
   * para quien quiera pegarlo en su propio diseño en vez de la hoja lista de arriba. Mismo
   * mecanismo de `openOrDownloadBlob` que `handleDownloadPromoPdf`, para que funcione
   * igual de bien desde cualquier dispositivo.
   */
  async function handleDownloadQr() {
    setDownloadingQr(true)
    try {
      const publicUrl = `${window.location.origin}/apartar/${form.publicSlug}`
      await openOrDownloadBlob(
        () => getApartadosQrPng(tiendaId, publicUrl),
        `qr-${form.publicSlug}.png`,
        'image/png'
      )
    } catch (err) {
      notify('No se pudo generar el QR', 'error')
    } finally {
      setDownloadingQr(false)
    }
  }

  if (loading || !form) return <p className="text-gray-400 text-sm">Cargando...</p>

  const logoSrc = resolveMediaUrl(user?.tienda?.logoPath) || defaultLogo

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Datos de la tienda</h1>
      <p className="text-gray-500 text-sm mb-6">
        Información fiscal y de contacto de <span className="font-medium">{user?.tienda?.name}</span>. Solo la puede
        editar el administrador de esta tienda.
      </p>

      <div className="card mb-6">
        <p className="text-sm font-medium text-gray-700 mb-3">Logo</p>
        <div className="flex flex-wrap items-center gap-4">
          <img src={logoSrc} alt="Logo de la tienda" className="w-20 h-20 rounded-full object-cover border border-gray-200" />
          <div className="flex flex-col gap-2">
            <label className="btn-secondary text-sm cursor-pointer inline-block">
              {uploadingLogo ? 'Subiendo...' : 'Subir logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoChange} disabled={uploadingLogo} />
            </label>
            {user?.tienda?.logoPath && (
              <button type="button" className="text-xs text-red-600 hover:underline text-left" onClick={handleRemoveLogo} disabled={uploadingLogo}>
                Quitar logo (usar el default)
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">PNG, JPG o WEBP, máximo {MAX_LOGO_MB} MB. Si no subes uno, se usa el logo de Nexora.</p>
      </div>

      <div className="border-b border-gray-200 mb-6 flex gap-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`pb-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === t.key ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="card space-y-4">
        {activeTab === 'general' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.textarea ? 'sm:col-span-2' : ''}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              {f.textarea ? (
                <textarea
                  className="input"
                  rows={2}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  type="text"
                  className="input"
                  value={form[f.key]}
                  required={f.required}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
              {fieldErrors[f.key] && <p className="text-red-600 text-xs mt-1">{fieldErrors[f.key]}</p>}
            </div>
          ))}
        </div>
        )}

        {activeTab === 'general' && (
        <div className="border-t border-gray-100 pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Correo de contacto</label>
          {/* Sin type="email" nativo a propósito (ver handleSave). */}
          <input
            type="text"
            className="input sm:max-w-md"
            placeholder="ej. contacto@tunegocio.com"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
          {fieldErrors.contactEmail && <p className="text-red-600 text-xs mt-1">{fieldErrors.contactEmail}</p>}
          <p className="text-xs text-gray-400 mt-1">
            Los tickets y avisos por correo de tu tienda siguen saliendo desde la cuenta del sistema, pero si un
            cliente le da "Responder", le llega a este correo en vez de a la cuenta general — déjalo en blanco si no
            quieres que tus clientes puedan contestarte por correo.
          </p>
        </div>
        )}

        {activeTab === 'ventas' && (
        <>
        <div>
          <p className="text-sm font-semibold text-gray-800">Meta de venta diaria</p>
          <p className="text-xs text-gray-500 mb-3">
            El Dashboard muestra la venta del día contra esta meta, con el % de avance. Déjala en blanco
            para que el Dashboard solo muestre la venta del día, sin porcentaje.
          </p>
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">Meta diaria ($)</label>
            {/* Sin type="number" nativo a propósito (ver handleSave). */}
            <input
              type="text" inputMode="decimal"
              className="input" placeholder="Sin definir"
              value={form.dailySalesGoal}
              onChange={(e) => setForm({ ...form, dailySalesGoal: sanitizeDecimalInput(e.target.value) })}
            />
            {fieldErrors.dailySalesGoal && <p className="text-red-600 text-xs mt-1">{fieldErrors.dailySalesGoal}</p>}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm font-semibold text-gray-800">Límite de descuento en ventas</p>
          <p className="text-xs text-gray-500 mb-3">
            Por seguridad, el Punto de Venta <span className="font-medium">no permite ningún descuento</span> hasta
            que definas al menos uno de estos dos límites — así evitas que un cajero deje un producto
            prácticamente gratis. Si defines los dos, ningún descuento por producto podrá superar cualquiera de
            los dos.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto máximo de descuento ($)</label>
              {/* Sin type="number" nativo a propósito (ver handleSave). */}
              <input
                type="text" inputMode="decimal"
                className="input" placeholder="Sin definir (descuentos deshabilitados)"
                value={form.maxDiscountAmount}
                onChange={(e) => setForm({ ...form, maxDiscountAmount: sanitizeDecimalInput(e.target.value) })}
              />
              {fieldErrors.maxDiscountAmount && <p className="text-red-600 text-xs mt-1">{fieldErrors.maxDiscountAmount}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Porcentaje máximo de descuento (%)</label>
              {/* Sin type="number" nativo a propósito (ver handleSave). */}
              <input
                type="text" inputMode="numeric"
                className="input" placeholder="Sin definir (descuentos deshabilitados)"
                value={form.maxDiscountPercent}
                onChange={(e) => setForm({ ...form, maxDiscountPercent: sanitizeIntegerInput(e.target.value) })}
              />
              {fieldErrors.maxDiscountPercent && <p className="text-red-600 text-xs mt-1">{fieldErrors.maxDiscountPercent}</p>}
            </div>
          </div>
        </div>
        </>
        )}

        {activeTab === 'apartados' && (
        <div>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={form.apartadosEnabled}
              onChange={(e) => setForm({ ...form, apartadosEnabled: e.target.checked })}
            />
            <span className="text-sm font-semibold text-gray-800">Habilitar tienda pública de apartados</span>
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Publica un catálogo que cualquier cliente puede ver y usar para apartar productos, sin necesitar
            cuenta ni contraseña — el apartado queda pendiente hasta que lo confirmes en la sección "Apartados".
          </p>

          {form.apartadosEnabled && (
            <div className="space-y-4 bg-gray-50 rounded-lg p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Enlace de tu tienda</label>
                <div className="flex gap-2">
                  <input
                    type="text" className="input" placeholder="se genera solo si lo dejas en blanco"
                    value={form.publicSlug}
                    onChange={(e) => setForm({ ...form, publicSlug: e.target.value })}
                  />
                  <button
                    type="button" className="btn-secondary text-sm whitespace-nowrap"
                    onClick={() => {
                      navigator.clipboard?.writeText(`${window.location.origin}/apartar/${form.publicSlug}`)
                    }}
                    disabled={!form.publicSlug}
                  >
                    Copiar link
                  </button>
                </div>
                {fieldErrors.publicSlug && <p className="text-red-600 text-xs mt-1">{fieldErrors.publicSlug}</p>}
                {form.publicSlug && (
                  <p className="text-xs text-gray-400 mt-1 break-all">{window.location.origin}/apartar/{form.publicSlug}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button" className="btn-secondary text-sm"
                    onClick={handleDownloadPromoPdf}
                    disabled={!form.publicSlug || downloadingPromo}
                  >
                    {downloadingPromo ? 'Generando...' : '📄 Descargar PDF promocional'}
                  </button>
                  <button
                    type="button" className="btn-secondary text-sm"
                    onClick={handleDownloadQr}
                    disabled={!form.publicSlug || downloadingQr}
                  >
                    {downloadingQr ? 'Generando...' : '🔳 Descargar QR'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  El PDF trae una hoja con el nombre de tu tienda y el QR, lista para imprimir o compartir; el QR solo es la imagen sola, por si la quieres pegar en tu propio diseño. Ambos funcionan igual desde celular o computadora.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horas que dura un apartado</label>
                {/* Sin type="number" nativo a propósito (ver handleSave). */}
                <input
                  type="text" inputMode="numeric" className="input sm:max-w-[160px]"
                  value={form.defaultApartadoHours}
                  onChange={(e) => setForm({ ...form, defaultApartadoHours: sanitizeIntegerInput(e.target.value) })}
                />
                {fieldErrors.defaultApartadoHours && <p className="text-red-600 text-xs mt-1">{fieldErrors.defaultApartadoHours}</p>}
                <p className="text-xs text-gray-400 mt-1">A partir de que lo confirmes (no de cuando el cliente lo solicita) — si no lo recoge a tiempo, el producto vuelve solo al inventario.</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Límite de descuento al confirmar un apartado</p>
                <p className="text-xs text-gray-500 mb-3">
                  Independiente del límite de venta física de arriba — el cliente nunca elige su propio descuento,
                  solo tú al confirmar el apartado.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monto máximo ($)</label>
                    {/* Sin type="number" nativo a propósito (ver handleSave). */}
                    <input
                      type="text" inputMode="decimal" className="input" placeholder="Sin definir (deshabilitado)"
                      value={form.maxApartadoDiscountAmount}
                      onChange={(e) => setForm({ ...form, maxApartadoDiscountAmount: sanitizeDecimalInput(e.target.value) })}
                    />
                    {fieldErrors.maxApartadoDiscountAmount && <p className="text-red-600 text-xs mt-1">{fieldErrors.maxApartadoDiscountAmount}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Porcentaje máximo (%)</label>
                    <input
                      type="text" inputMode="numeric" className="input" placeholder="Sin definir (deshabilitado)"
                      value={form.maxApartadoDiscountPercent}
                      onChange={(e) => setForm({ ...form, maxApartadoDiscountPercent: sanitizeIntegerInput(e.target.value) })}
                    />
                    {fieldErrors.maxApartadoDiscountPercent && <p className="text-red-600 text-xs mt-1">{fieldErrors.maxApartadoDiscountPercent}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{message}</div>
        )}

        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <p className="text-xs text-gray-400">Guarda lo de las 3 pestañas juntas, sin importar cuál esté abierta.</p>
        </div>
      </form>
    </div>
  )
}
