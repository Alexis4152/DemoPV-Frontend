import { useEffect, useState } from 'react'
import { getCategoriesPage, createCategory, updateCategory, deleteCategory } from '../api/categories'
import { useNotify } from '../context/NotifyContext'

const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const emptyForm = { name: '', description: '' }
const EMPTY_FILTERS = { from: '', to: '', name: '', isActive: '' }
const PAGE_SIZES = [10, 20, 50, 100]

/**
 * Pantalla "Categorías": CRUD completo de las categorías de producto de la tienda del
 * usuario en sesión (o de todas si es SUPER_ADMIN, según lo que filtre el backend).
 * Reservada a ADMIN/SUPER_ADMIN/SUPERVISOR (ver `adminOnly` en `PrivateRoute`, la misma
 * regla que Apariencia/Datos de la tienda) — a diferencia del resto de módulos, no es una
 * `AppSection` configurable por rol.
 *
 * Convive con la forma rápida de dar de alta una categoría "al vuelo" desde el formulario
 * de Inventario/Nuevo producto (opción "+ Otra categoría..."), que sigue existiendo tal
 * cual — esta pantalla es la vista completa para administrarlas todas: editar, buscar,
 * filtrar y dar de baja (borrado suave), algo que ese atajo nunca ofreció.
 *
 * Mismos patrones que el resto de módulos paginados (Users/Sales/CashCuts/Inventory):
 * filtros que aplican solos al cambiar cualquier campo (debounce de 250ms en Nombre, sin
 * botón "Filtrar"), paginación server-side, "Limpiar filtros" solo si hay algo que
 * limpiar, y el modal de alta/edición se cierra con Escape o clic fuera.
 */
export default function Categories() {
  const { notify, confirmDialog } = useNotify()
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [showModal, setShowModal] = useState(false)
  const [editCategory, setEditCategory] = useState(null)
  const [form, setForm] = useState(emptyForm)
  // Error general del modal de categoría (reglas de negocio sin campo asociado, o
  // cualquier fallo que no venga de @Valid).
  const [error, setError] = useState('')
  // Errores de validación por campo, { nombreDelCampo: mensaje } — mismo formato que
  // GlobalExceptionHandler ya manda para @Valid (ver CategoryRequest en el backend). Se
  // muestran justo debajo de su input y ponen en rojo el asterisco de "obligatorio".
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  /**
   * Recarga el listado usando `page`/`size` y los `filters` vigentes. El rango de fecha se
   * expande a inicio/fin de día (`T00:00:00` / `T23:59:59`) para que el filtro "Desde/Hasta"
   * incluya el día completo y no solo el instante exacto de medianoche.
   */
  function load() {
    const params = {
      page,
      size,
      name: filters.name || undefined,
      isActive: filters.isActive || undefined,
      from: filters.from ? `${filters.from}T00:00:00` : undefined,
      to: filters.to ? `${filters.to}T23:59:59` : undefined,
    }
    getCategoriesPage(params).then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
  }

  // Debounce de 250ms (mismo patrón que Users.jsx/Inventory.jsx) para no pegarle a la API
  // en cada tecla de Nombre; fecha/estado/página disparan igual de rápido.
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [page, size, filters])

  // Cierra con ESC el modal de categoría (mismo efecto que "Cancelar"), descartando lo capturado.
  useEffect(() => {
    if (!showModal) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setShowModal(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showModal])

  /** Actualiza un filtro y reinicia a la primera página, para no quedar "atorado" en una
   *  página que ya no existe con el nuevo filtro. */
  function setFilter(patch) {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(0)
  }

  /** Limpia todos los filtros y vuelve a la primera página. */
  function handleClearFilters() {
    setFilters(EMPTY_FILTERS)
    setPage(0)
  }

  const hasFilters = filters.from || filters.to || filters.name || filters.isActive

  /** Abre el modal en blanco para crear una categoría nueva. */
  function openNew() {
    setEditCategory(null)
    setForm(emptyForm)
    setError('')
    setFieldErrors({})
    setShowModal(true)
  }

  /** Abre el modal precargado con los datos de la categoría a editar. */
  function openEdit(c) {
    setEditCategory(c)
    setForm({ name: c.name, description: c.description ?? '' })
    setError('')
    setFieldErrors({})
    setShowModal(true)
  }

  /**
   * Valida el formulario de categoría del lado del cliente, replicando el límite que ya
   * exige `CategoryRequest` en el backend (mismo texto de mensaje) — para detectar el error
   * ANTES de pedir confirmación de guardado (ver `handleSave`), en vez de hasta después del
   * viaje redondo al servidor. Sin `required` nativo en Nombre (ver el JSX del modal) — ese
   * globo del navegador se disparaba antes de que este formulario alcanzara a correr.
   *
   * @returns {{[field: string]: string}} vacío si el formulario es válido
   */
  function validateCategoryForm() {
    const errors = {}
    if (!form.name.trim()) errors.name = 'El nombre es obligatorio'
    else if (form.name.length > 100) errors.name = 'El nombre no puede tener más de 100 caracteres'
    if (form.description.length > 200) errors.description = 'La descripción no puede tener más de 200 caracteres'
    return errors
  }

  // Crea o actualiza la categoría según haya o no un `editCategory` en edición (previa
  // confirmación explícita), y recarga el listado (respetando los filtros aplicados). La
  // validación local corre ANTES de pedir esa confirmación: no tiene sentido preguntar
  // "¿deseas crear/guardar?" si el backend lo va a rechazar de todas formas.
  async function handleSave(e) {
    e.preventDefault()
    const validationErrors = validateCategoryForm()
    if (Object.keys(validationErrors).length > 0) {
      // Advertencia de validación local, NO el mismo mensaje que un fallo real del
      // backend (ver el catch de abajo) — aquí todavía no se intentó guardar nada.
      setFieldErrors(validationErrors)
      setError('')
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    const confirmMsg = editCategory
      ? `¿Deseas guardar los cambios de "${form.name}"?`
      : `¿Deseas crear la categoría "${form.name}"?`
    if (!(await confirmDialog(confirmMsg, { confirmText: editCategory ? 'Guardar cambios' : 'Crear', danger: false }))) return
    setLoading(true)
    setError('')
    setFieldErrors({})
    try {
      if (editCategory) await updateCategory(editCategory.id, form)
      else await createCategory(form)
      setShowModal(false)
      load()
      notify(editCategory ? 'Categoría editada correctamente' : 'Categoría agregada correctamente', 'success')
    } catch (err) {
      // Errores de validación (@Valid, ver GlobalExceptionHandler en el backend) traen
      // { campo: mensaje } en `data` — se reparten a `fieldErrors` para mostrarse justo
      // debajo de cada input. Cualquier otro tipo de error va al mensaje general.
      const data = err.response?.data?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setFieldErrors(data)
        setError('')
      } else {
        setFieldErrors({})
        setError(err.response?.data?.message ?? 'Error al guardar')
      }
      notify(editCategory ? 'Error al guardar la categoría' : 'Error al registrar la categoría', 'error')
    } finally { setLoading(false) }
  }

  /**
   * "Elimina" (desactiva) una categoría tras confirmación explícita. Es un borrado suave:
   * el backend marca `isActive=false` en vez de borrar la fila, por lo que sigue
   * apareciendo en la tabla (estado "Inactiva") salvo que el filtro de Estado la oculte —
   * su nombre queda libre para poder reutilizarse en una categoría nueva.
   */
  async function handleDelete(c) {
    if (!(await confirmDialog(`¿Desactivar la categoría "${c.name}"? Los productos que ya la tengan asignada no se ven afectados.`, { confirmText: 'Desactivar' }))) return
    await deleteCategory(c.id)
    load()
  }

  const categories = pageData.content ?? []
  const totalPages = pageData.totalPages ?? 0
  const totalElements = pageData.totalElements ?? 0
  const from = totalElements === 0 ? 0 : page * size + 1
  const to = Math.min(totalElements, page * size + categories.length)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Categorías</h2>
        <button className="btn-primary" onClick={openNew}>+ Nueva categoría</button>
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
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Nombre', 'Descripción', 'Fecha de alta', 'Estado', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {categories.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{c.description || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(c.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(c)}>Editar</button>
                    {c.isActive && (
                      <button className="text-red-500 hover:underline text-xs" onClick={() => handleDelete(c)}>Desact.</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin categorías</td></tr>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editCategory ? 'Editar categoría' : 'Nueva categoría'}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              {/* Sin `required` nativo a propósito (ver validateCategoryForm): el globo del
                  navegador se disparaba antes de que este formulario alcanzara a correr. */}
              <div>
                <label className="text-xs font-medium text-gray-600">Nombre <span className={fieldErrors.name ? 'text-red-600' : ''}>*</span></label>
                <input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                {fieldErrors.name && <p className="text-red-600 text-xs mt-1">{fieldErrors.name}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Descripción</label>
                <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                {fieldErrors.description && <p className="text-red-600 text-xs mt-1">{fieldErrors.description}</p>}
              </div>
              {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</p>}
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
