import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTiendaInfo, updateTiendaInfo, uploadTiendaLogo, removeTiendaLogo } from '../api/tiendas'
import { useNotify } from '../context/NotifyContext'
import defaultLogo from '../assets/logo.png'

const FIELDS = [
  { key: 'name', label: 'Nombre de la tienda', required: true },
  { key: 'razonSocial', label: 'Razón social' },
  { key: 'rfc', label: 'RFC' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'paginaWeb', label: 'Página web' },
  { key: 'calle', label: 'Calle' },
  { key: 'colonia', label: 'Colonia' },
  { key: 'codigoPostal', label: 'Código postal' },
  { key: 'localidad', label: 'Localidad' },
  { key: 'estado', label: 'Estado' },
  { key: 'redesSociales', label: 'Redes sociales', textarea: true },
  { key: 'notasAdicionales', label: 'Otros datos', textarea: true },
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
  const { confirmDialog } = useNotify()
  const tiendaId = user?.tienda?.id

  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Carga los datos fiscales/de contacto actuales de la tienda para precargar el formulario.
  useEffect(() => {
    if (!tiendaId) return
    getTiendaInfo(tiendaId).then((r) => {
      const info = r.data.data
      setForm({
        name: info.tienda?.name || '',
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
    if (!(await confirmDialog('¿Deseas guardar estos datos? Se usarán en el ticket de venta.', { confirmText: 'Guardar datos', danger: false }))) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const maxDiscountAmount = form.maxDiscountAmount === '' ? null : Number(form.maxDiscountAmount)
      const maxDiscountPercent = form.maxDiscountPercent === '' ? null : Number(form.maxDiscountPercent)
      const maxApartadoDiscountAmount = form.maxApartadoDiscountAmount === '' ? null : Number(form.maxApartadoDiscountAmount)
      const maxApartadoDiscountPercent = form.maxApartadoDiscountPercent === '' ? null : Number(form.maxApartadoDiscountPercent)
      const res = await updateTiendaInfo(tiendaId, {
        ...form, maxDiscountAmount, maxDiscountPercent, maxApartadoDiscountAmount, maxApartadoDiscountPercent,
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

  if (loading || !form) return <p className="text-gray-400 text-sm">Cargando...</p>

  const logoSrc = user?.tienda?.logoPath || defaultLogo

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
        <p className="text-xs text-gray-400 mt-3">PNG, JPG o WEBP, máximo 3 MB. Si no subes uno, se usa el logo de Nexora.</p>
      </div>

      <form onSubmit={handleSave} className="card space-y-4">
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
            </div>
          ))}
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
              <input
                type="number" min="0" step="0.01"
                className="input" placeholder="Sin definir (descuentos deshabilitados)"
                value={form.maxDiscountAmount}
                onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Porcentaje máximo de descuento (%)</label>
              <input
                type="number" min="0" max="100" step="1"
                className="input" placeholder="Sin definir (descuentos deshabilitados)"
                value={form.maxDiscountPercent}
                onChange={(e) => setForm({ ...form, maxDiscountPercent: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
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
                {form.publicSlug && (
                  <p className="text-xs text-gray-400 mt-1 break-all">{window.location.origin}/apartar/{form.publicSlug}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horas que dura un apartado</label>
                <input
                  type="number" min="1" className="input sm:max-w-[160px]"
                  value={form.defaultApartadoHours}
                  onChange={(e) => setForm({ ...form, defaultApartadoHours: e.target.value })}
                />
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
                    <input
                      type="number" min="0" step="0.01" className="input" placeholder="Sin definir (deshabilitado)"
                      value={form.maxApartadoDiscountAmount}
                      onChange={(e) => setForm({ ...form, maxApartadoDiscountAmount: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Porcentaje máximo (%)</label>
                    <input
                      type="number" min="0" max="100" step="1" className="input" placeholder="Sin definir (deshabilitado)"
                      value={form.maxApartadoDiscountPercent}
                      onChange={(e) => setForm({ ...form, maxApartadoDiscountPercent: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{message}</div>
        )}

        <button className="btn-primary" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar datos'}
        </button>
      </form>
    </div>
  )
}
