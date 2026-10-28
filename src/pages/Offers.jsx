import { useEffect, useState } from 'react'
import { getOffersPage, createOffer, updateOffer, deleteOffer, activateOffer } from '../api/offers'
import { getProducts } from '../api/products'
import { useNotify } from '../context/NotifyContext'
import { useAuth } from '../context/AuthContext'
import IconButton from '../components/IconButton'
import ModalCloseButton from '../components/ModalCloseButton'
import { PencilIcon, ArchiveIcon, CheckCircleIcon } from '../components/icons'

// Campos de piezas: texto sin flechitas, pero solo aceptan dígitos (enteros).
const onlyDigits = (v) => v.replace(/\D/g, '')
const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'
// `datetime-local` necesita "YYYY-MM-DDTHH:mm", sin segundos ni zona — y al revés al enviar.
const toLocalInput = (iso) => iso ? iso.slice(0, 16) : ''
const toIso = (local) => local ? `${local}:00` : null
// Ahora mismo en hora local, mismo formato "YYYY-MM-DDTHH:mm" que `datetime-local`.
const nowLocalInput = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const emptyForm = {
  name: '', buyQuantity: '2', payQuantity: '1', maxPromosPerSale: '',
  startsAt: '', endsAt: '', productIds: [],
}
const EMPTY_FILTERS = { from: '', to: '', name: '', isActive: '' }
const PAGE_SIZES = [10, 20, 50, 100]

/**
 * Pantalla "Ofertas": CRUD de promociones "compra X paga Y" (2x1, 3x2, ...) — ver
 * `Offer.java`/`SaleService#applyOffer` en el backend para cómo se calcula al vender.
 * Visible para los roles con la sección `OFFERS`; crear/editar/desactivar requiere además
 * la acción OFFERS:CREATE/EDIT/DELETE (ver Roles.jsx) — sin ella, solo se ve la lista.
 *
 * Mismo patrón de pantalla que Categories.jsx (filtros con debounce, paginación
 * server-side, modal de alta/edición con Escape) — lo único propio de aquí es el
 * selector de productos (checklist con buscador) dentro del modal.
 */
export default function Offers() {
  const { notify, confirmDialog } = useNotify()
  const { hasAction } = useAuth()
  const canCreate = hasAction('OFFERS', 'CREATE')
  const canEdit = hasAction('OFFERS', 'EDIT')
  const canDelete = hasAction('OFFERS', 'DELETE')
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [showModal, setShowModal] = useState(false)
  const [editOffer, setEditOffer] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [products, setProducts] = useState([])
  const [productFilter, setProductFilter] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  function load() {
    const params = {
      page,
      size,
      name: filters.name || undefined,
      isActive: filters.isActive || undefined,
      from: filters.from ? `${filters.from}T00:00:00` : undefined,
      to: filters.to ? `${filters.to}T23:59:59` : undefined,
    }
    getOffersPage(params).then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [page, size, filters])

  useEffect(() => {
    if (!showModal) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setShowModal(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showModal])

  function setFilter(patch) {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(0)
  }

  function handleClearFilters() {
    setFilters(EMPTY_FILTERS)
    setPage(0)
  }

  const hasFilters = filters.from || filters.to || filters.name || filters.isActive

  function openNew() {
    setEditOffer(null)
    setForm(emptyForm)
    setProductFilter('')
    setFieldErrors({})
    getProducts().then((r) => setProducts(r.data.data ?? []))
    setShowModal(true)
  }

  function openEdit(o) {
    setEditOffer(o)
    setForm({
      name: o.name,
      buyQuantity: String(o.buyQuantity),
      payQuantity: String(o.payQuantity),
      maxPromosPerSale: o.maxPromosPerSale != null ? String(o.maxPromosPerSale) : '',
      startsAt: toLocalInput(o.startsAt),
      endsAt: toLocalInput(o.endsAt),
      productIds: (o.products ?? []).map((p) => p.id),
    })
    setProductFilter('')
    setFieldErrors({})
    getProducts().then((r) => setProducts(r.data.data ?? []))
    setShowModal(true)
  }

  function toggleProduct(id) {
    setForm((prev) => ({
      ...prev,
      productIds: prev.productIds.includes(id)
        ? prev.productIds.filter((pid) => pid !== id)
        : [...prev.productIds, id],
    }))
  }

  /**
   * Valida el formulario del lado del cliente, replicando las reglas de `OfferRequest` en
   * el backend (mismo texto de mensaje) — detecta el error ANTES de pedir confirmación.
   */
  function validateOfferForm() {
    const errors = {}
    if (!form.name.trim()) errors.name = 'El nombre es obligatorio'
    else if (form.name.length > 150) errors.name = 'El nombre no puede tener más de 150 caracteres'
    const buy = Number(form.buyQuantity)
    const pay = Number(form.payQuantity)
    if (form.buyQuantity === '') errors.buyQuantity = 'Indica cuántas piezas se lleva'
    else if (!Number.isInteger(buy)) errors.buyQuantity = 'Debe ser un número entero'
    else if (buy < 2) errors.buyQuantity = 'Debe llevarse al menos 2 piezas'
    else if (buy > 1000) errors.buyQuantity = 'Máximo 1000 piezas por promoción'
    if (form.payQuantity === '') errors.payQuantity = 'Indica cuántas piezas paga'
    else if (!Number.isInteger(pay)) errors.payQuantity = 'Debe ser un número entero'
    else if (pay < 1) errors.payQuantity = 'Debe pagar al menos 1 pieza'
    else if (!errors.buyQuantity && pay >= buy) errors.payQuantity = 'Lo que se paga debe ser menor a lo que se lleva'
    if (form.maxPromosPerSale !== '') {
      const max = Number(form.maxPromosPerSale)
      if (!Number.isInteger(max)) errors.maxPromosPerSale = 'Debe ser un número entero'
      else if (max < 1) errors.maxPromosPerSale = 'El límite debe ser al menos 1 (o déjalo vacío para no poner límite)'
      else if (max > 1000) errors.maxPromosPerSale = 'El límite de promociones no puede ser mayor a 1000'
    }
    // Strings "YYYY-MM-DDTHH:mm" del mismo formato: se comparan bien como texto.
    // "Empieza" sí puede ser pasada (oferta que ya arrancó); "Termina" no — una oferta que
    // ya terminó no tiene caso guardarla.
    if (form.endsAt && form.endsAt < nowLocalInput()) errors.endsAt = 'No puede ser anterior a la fecha y hora actual'
    else if (form.startsAt && form.endsAt && form.endsAt <= form.startsAt) errors.endsAt = 'Debe terminar después de que empieza'
    if (form.productIds.length === 0) errors.productIds = 'Elige al menos un producto'
    return errors
  }

  async function handleSave(e) {
    e.preventDefault()
    const validationErrors = validateOfferForm()
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    const confirmMsg = editOffer
      ? `¿Deseas guardar los cambios de "${form.name}"?`
      : `¿Deseas crear la oferta "${form.name}"?`
    if (!(await confirmDialog(confirmMsg, { confirmText: editOffer ? 'Guardar cambios' : 'Crear', danger: false }))) return
    setLoading(true)
    setFieldErrors({})
    const payload = {
      name: form.name,
      buyQuantity: Number(form.buyQuantity),
      payQuantity: Number(form.payQuantity),
      maxPromosPerSale: form.maxPromosPerSale ? Number(form.maxPromosPerSale) : null,
      startsAt: toIso(form.startsAt),
      endsAt: toIso(form.endsAt),
      productIds: form.productIds,
    }
    try {
      if (editOffer) await updateOffer(editOffer.id, payload)
      else await createOffer(payload)
      setShowModal(false)
      load()
      notify(editOffer ? 'Oferta editada correctamente' : 'Oferta agregada correctamente', 'success')
    } catch (err) {
      // Errores ligados a un campo ({campo: mensaje}) van debajo de su input; los demás
      // (ej. un producto que ya no existe) solo en la notificación, con el mensaje real.
      const data = err.response?.data?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setFieldErrors(data)
        notify('Revisa los campos marcados en rojo', 'error')
      } else {
        setFieldErrors({})
        notify(err.response?.data?.message ?? (editOffer ? 'No se pudo guardar la oferta' : 'No se pudo registrar la oferta'), 'error')
      }
    } finally { setLoading(false) }
  }

  async function handleDelete(o) {
    if (!(await confirmDialog(`¿Desactivar la oferta "${o.name}"? Las ventas ya hechas con esta oferta no se ven afectadas.`, { confirmText: 'Desactivar' }))) return
    await deleteOffer(o.id)
    load()
  }

  async function handleActivate(o) {
    if (!(await confirmDialog(`¿Reactivar la oferta "${o.name}"? Vuelve a aplicar en el Punto de Venta según su vigencia.`, { confirmText: 'Reactivar' }))) return
    try {
      await activateOffer(o.id)
      notify('Oferta reactivada', 'success')
      load()
    } catch (err) {
      notify(err.response?.data?.message || 'No se pudo reactivar la oferta', 'error')
    }
  }

  const offers = pageData.content ?? []
  const totalPages = pageData.totalPages ?? 0
  const totalElements = pageData.totalElements ?? 0
  const from = totalElements === 0 ? 0 : page * size + 1
  const to = Math.min(totalElements, page * size + offers.length)
  const visibleProducts = products.filter((p) => p.name.toLowerCase().includes(productFilter.trim().toLowerCase()))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Ofertas</h2>
        {canCreate && <button className="btn-primary" onClick={openNew}>+ Nueva oferta</button>}
      </div>

      <div className="card mb-4 flex flex-wrap gap-3 items-end">
        <div className="w-36">
          <label className="text-xs font-medium text-gray-600 block mb-1">Desde</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />
        </div>
        <div className="w-36">
          <label className="text-xs font-medium text-gray-600 block mb-1">Hasta</label>
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />
        </div>
        <div className="w-52">
          <label className="text-xs font-medium text-gray-600 block mb-1">Nombre</label>
          <input type="text" className="input" placeholder="Nombre" value={filters.name} onChange={(e) => setFilter({ name: e.target.value })} />
        </div>
        <div className="w-36">
          <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
          <select className="input" value={filters.isActive} onChange={(e) => setFilter({ isActive: e.target.value })}>
            <option value="">Todos</option>
            <option value="true">Activa</option>
            <option value="false">Inactiva</option>
          </select>
        </div>
        {hasFilters && (
          <button type="button" className="btn-secondary text-sm" onClick={handleClearFilters}>Limpiar filtros</button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Nombre', 'Promoción', 'Límite', 'Productos', 'Vigencia', 'Estado', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {offers.map((o) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{o.name}</td>
                <td className="px-4 py-3 text-gray-600">Lleva {o.buyQuantity}, paga {o.payQuantity}</td>
                <td className="px-4 py-3 text-gray-600">{o.maxPromosPerSale ?? 'Sin límite'}</td>
                <td className="px-4 py-3 text-gray-600">{(o.products ?? []).length} producto(s)</td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {o.startsAt || o.endsAt
                    ? `${o.startsAt ? fmtDate(o.startsAt) : 'Siempre'} — ${o.endsAt ? fmtDate(o.endsAt) : 'Indefinido'}`
                    : 'Indefinida'}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${o.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {o.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {canEdit && (
                      <IconButton icon={PencilIcon} label="Editar" variant="primary" onClick={() => openEdit(o)} />
                    )}
                    {o.isActive && canDelete && (
                      <IconButton icon={ArchiveIcon} label="Desactivar" variant="danger" onClick={() => handleDelete(o)} />
                    )}
                    {!o.isActive && canEdit && (
                      <IconButton icon={CheckCircleIcon} label="Reactivar" variant="primary" onClick={() => handleActivate(o)} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {offers.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin ofertas</td></tr>
            )}
          </tbody>
        </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <span>Mostrar</span>
            <select
              className="input !w-auto py-1"
              value={size}
              onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>por página · {totalElements === 0 ? 'sin resultados' : `${from}–${to} de ${totalElements}`}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ‹ Anterior
            </button>
            <span className="text-gray-500 text-xs">Página {totalPages === 0 ? 0 : page + 1} de {totalPages}</span>
            <button
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente ›
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <ModalCloseButton onClick={() => setShowModal(false)} />
            <h3 className="text-lg font-bold mb-1 pr-8">{editOffer ? 'Editar oferta' : 'Nueva oferta'}</h3>
            <p className="text-xs text-gray-500 mb-4">La cantidad que captura el cajero en el Punto de Venta son piezas físicas — el sistema calcula solo cuántas promociones completas caben ahí.</p>
            <form onSubmit={handleSave} noValidate className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Nombre <span className={fieldErrors.name ? 'text-red-600' : ''}>*</span></label>
                <input className="input" autoFocus placeholder="Ej. 2x1 playeras de verano" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                {fieldErrors.name && <p className="text-red-600 text-xs mt-1">{fieldErrors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Se lleva <span className={fieldErrors.buyQuantity ? 'text-red-600' : ''}>*</span></label>
                  <input type="text" inputMode="numeric" className="input" value={form.buyQuantity} onChange={(e) => setForm({ ...form, buyQuantity: onlyDigits(e.target.value) })} />
                  {fieldErrors.buyQuantity && <p className="text-red-600 text-xs mt-1">{fieldErrors.buyQuantity}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Paga <span className={fieldErrors.payQuantity ? 'text-red-600' : ''}>*</span></label>
                  <input type="text" inputMode="numeric" className="input" value={form.payQuantity} onChange={(e) => setForm({ ...form, payQuantity: onlyDigits(e.target.value) })} />
                  {fieldErrors.payQuantity && <p className="text-red-600 text-xs mt-1">{fieldErrors.payQuantity}</p>}
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-2">
                Ej. 2x1 = se lleva 2, paga 1. 3x2 = se lleva 3, paga 2.
              </p>

              <div>
                <label className="text-xs font-medium text-gray-600">Límite de promociones por venta</label>
                <input type="text" inputMode="numeric" className="input" placeholder="Sin límite" value={form.maxPromosPerSale} onChange={(e) => setForm({ ...form, maxPromosPerSale: onlyDigits(e.target.value) })} />
                {fieldErrors.maxPromosPerSale && <p className="text-red-600 text-xs mt-1">{fieldErrors.maxPromosPerSale}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Empieza</label>
                  <input type="datetime-local" className="input" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Termina</label>
                  <input type="datetime-local" className="input" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                  {fieldErrors.endsAt && <p className="text-red-600 text-xs mt-1">{fieldErrors.endsAt}</p>}
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-2">Deja ambas en blanco para que la oferta quede activa indefinidamente.</p>

              <div>
                <label className="text-xs font-medium text-gray-600">Productos <span className={fieldErrors.productIds ? 'text-red-600' : ''}>*</span></label>
                <input
                  type="text"
                  className="input mb-1"
                  placeholder="Buscar producto..."
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                />
                <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-50">
                  {visibleProducts.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={form.productIds.includes(p.id)} onChange={() => toggleProduct(p.id)} />
                      <span className="flex-1">{p.name}</span>
                    </label>
                  ))}
                  {visibleProducts.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-gray-400">Sin productos que coincidan</p>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">{form.productIds.length} producto(s) elegido(s)</p>
                {fieldErrors.productIds && <p className="text-red-600 text-xs mt-1">{fieldErrors.productIds}</p>}
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
