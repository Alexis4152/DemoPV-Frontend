import { useEffect, useRef, useState } from 'react'
import {
  getRawMaterialsPage, getRawMaterialsLowStock, createRawMaterial, updateRawMaterial, adjustRawMaterialStock,
  transferRawMaterialToInventory, getRawMaterialMovements, deleteRawMaterial,
} from '../api/rawMaterials'
import { searchProducts } from '../api/products'
import { getCategories } from '../api/categories'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import IconButton from '../components/IconButton'
import { PencilIcon, SlidersIcon, ArchiveIcon, ClockHistoryIcon, BoxesIcon } from '../components/icons'
import ModalCloseButton from '../components/ModalCloseButton'
import useEscapeClose from '../hooks/useEscapeClose'
import useTableSort from '../hooks/useTableSort'
import SortableTh from '../components/SortableTh'

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const pzs = (n) => `${n} pza${Number(n) === 1 ? '' : 's'}`
const PAGE_SIZES = [10, 20, 50, 100]
const MAX_INT = 2147483647
const emptyForm = { name: '', description: '', barcode: '', cost: '', stock: '', minStock: 0, categoryId: '' }
const onlyDigits = (v) => v.replace(/[^0-9]/g, '')

/** Errores por campo que manda el backend (`data: {campo: mensaje}`), o `{}`. */
const fieldErrorsOf = (err) => {
  const data = err.response?.data?.data
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
}

/**
 * Materia prima: inventario por piezas que NO está a la venta (no aparece en el Punto de
 * Venta ni en apartados). Funciona como Inventario —alta, edición, entradas/salidas, stock
 * bajo e historial— y permite pasar piezas al inventario vendible, a un producto que ya
 * existe o a uno nuevo. Permisos finos por rol: `RAW_MATERIALS` crear/editar/eliminar.
 */
export default function RawMaterials() {
  const { isAdmin, hasAction } = useAuth()
  const { notify, confirmDialog } = useNotify()
  const [pageData, setPageData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [categories, setCategories] = useState([])
  const [lowStockItems, setLowStockItems] = useState([])
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [page, setPage] = useState(0)
  // Orden de la tabla por encabezado (se aplica en el servidor; ver useTableSort).
  const tableSort = useTableSort('sort:rawMaterials')
  const onSort = (k) => { tableSort.toggle(k); setPage(0) }
  const [size, setSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { kind: 'form'|'adjust'|'transfer'|'history', item }

  const canCreate = hasAction('RAW_MATERIALS', 'CREATE')
  const canEdit = hasAction('RAW_MATERIALS', 'EDIT')
  const canDelete = hasAction('RAW_MATERIALS', 'DELETE')
  // Pasar a inventario también toca Inventario: producto existente (editar) o nuevo (crear).
  const canTransfer = canEdit && (hasAction('INVENTORY', 'EDIT') || hasAction('INVENTORY', 'CREATE'))

  function loadPage() {
    setLoading(true)
    getRawMaterialsPage({ q: search.trim() || undefined, categoryId: filterCat || undefined, lowStock: lowStockOnly || undefined, ...tableSort.params, page, size })
      .then((r) => setPageData(r.data.data ?? { content: [], totalElements: 0, totalPages: 0 }))
      .catch((err) => notify(err.response?.data?.message ?? 'No se pudo cargar la materia prima', 'error'))
      .finally(() => setLoading(false))
  }

  function loadLowStock() {
    getRawMaterialsLowStock().then((r) => setLowStockItems(r.data.data ?? [])).catch(() => {})
  }

  useEffect(() => {
    const t = setTimeout(loadPage, 250)
    return () => clearTimeout(t)
  }, [search, filterCat, lowStockOnly, page, size, tableSort.sort]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getCategories().then((r) => setCategories((r.data.data ?? []).filter((c) => c.isActive !== false))).catch(() => {})
    loadLowStock()
  }, [])

  function afterChange() {
    setModal(null)
    loadPage()
    loadLowStock()
  }

  async function handleDelete(m) {
    if (!(await confirmDialog(`¿Desactivar "${m.name}"? Su historial se conserva.`, { confirmText: 'Desactivar' }))) return
    try {
      await deleteRawMaterial(m.id)
      notify(`"${m.name}" desactivada`, 'success')
      afterChange()
    } catch (err) {
      notify(err.response?.data?.message ?? 'No se pudo desactivar', 'error')
    }
  }

  const items = pageData.content ?? []
  const totalElements = pageData.totalElements ?? 0
  const totalPages = pageData.totalPages ?? 0
  const rangeFrom = totalElements === 0 ? 0 : page * size + 1
  const rangeTo = Math.min((page + 1) * size, totalElements)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-2xl font-bold text-gray-900">Materia prima</h2>
        {canCreate && <button className="btn-primary" onClick={() => setModal({ kind: 'form', item: null })}>+ Nueva materia prima</button>}
      </div>
      <p className="text-sm text-gray-500 mb-6">Piezas que no están a la venta. Cuando quieras venderlas, pásalas a inventario.</p>

      {lowStockItems.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3 mb-4">
          ⚠️ {lowStockItems.length} materia{lowStockItems.length > 1 ? 's' : ''} prima{lowStockItems.length > 1 ? 's' : ''} en stock mínimo o por debajo: {' '}
          {lowStockItems.map((m) => m.name).join(', ')}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input className="input flex-1 min-w-[220px]" placeholder="Buscar por nombre o código..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }} />
        <select className="input w-52" value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(0) }}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          type="button"
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            lowStockOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          onClick={() => { setLowStockOnly((v) => !v); setPage(0) }}
        >
          ⚠️ Stock bajo
        </button>
        {(search || filterCat || lowStockOnly) && (
          <button type="button" className="btn-secondary text-sm" onClick={() => { setSearch(''); setFilterCat(''); setLowStockOnly(false); setPage(0) }}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <SortableTh label="Materia prima" sortKey="name" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                <SortableTh label="Categoría" sortKey="category" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                <SortableTh label="Código" sortKey="barcode" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                <SortableTh label="Costo" sortKey="cost" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                <SortableTh label="Stock" sortKey="stock" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                <SortableTh label="Mín." sortKey="minStock" sort={tableSort.sort} onSort={onSort} className="text-left px-4 py-3 font-medium text-gray-600" align="left" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Se pasa a</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                  <td className="px-4 py-3 text-gray-500">{m.category?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{m.barcode}</td>
                  <td className="px-4 py-3 text-gray-700">{fmt(m.cost)}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${m.stock <= m.minStock ? 'text-red-600' : 'text-green-600'}`}>{pzs(m.stock)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{m.minStock}</td>
                  <td className="px-4 py-3 text-gray-500">{m.linkedProductName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      {canTransfer && (
                        <button
                          type="button"
                          className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-purple-200 text-purple-700 text-xs font-semibold hover:bg-purple-50 disabled:opacity-40"
                          disabled={m.stock <= 0}
                          title={m.stock <= 0 ? 'Sin piezas para pasar' : undefined}
                          onClick={() => setModal({ kind: 'transfer', item: m })}
                        >
                          <BoxesIcon className="w-4 h-4" /> Pasar a inventario
                        </button>
                      )}
                      <IconButton icon={ClockHistoryIcon} label="Historial" onClick={() => setModal({ kind: 'history', item: m })} />
                      {canEdit && <IconButton icon={PencilIcon} label="Editar" variant="primary" onClick={() => setModal({ kind: 'form', item: m })} />}
                      {canEdit && <IconButton icon={SlidersIcon} label="Ajustar stock" variant="purple" onClick={() => setModal({ kind: 'adjust', item: m })} />}
                      {canDelete && <IconButton icon={ArchiveIcon} label="Desactivar" variant="danger" onClick={() => handleDelete(m)} />}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">{loading ? 'Cargando...' : 'Sin materia prima'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <span>Mostrar</span>
            <select className="input !w-auto py-1" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>por página · {totalElements === 0 ? 'sin resultados' : `${rangeFrom}–${rangeTo} de ${totalElements}`}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary py-1 px-3 text-xs disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹ Anterior</button>
            <span className="text-gray-500 text-xs">Página {totalPages === 0 ? 0 : page + 1} de {totalPages}</span>
            <button className="btn-secondary py-1 px-3 text-xs disabled:opacity-40" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente ›</button>
          </div>
        </div>
      </div>

      {modal?.kind === 'form' && <FormModal item={modal.item} categories={categories} onClose={() => setModal(null)} onSaved={afterChange} />}
      {modal?.kind === 'adjust' && <AdjustModal item={modal.item} isAdmin={isAdmin} onClose={() => setModal(null)} onSaved={afterChange} />}
      {modal?.kind === 'transfer' && <TransferModal item={modal.item} categories={categories} onClose={() => setModal(null)} onSaved={afterChange} />}
      {modal?.kind === 'history' && <HistoryModal item={modal.item} onClose={() => setModal(null)} />}
    </div>
  )
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  useEscapeClose(true, onClose)
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`relative bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 max-h-[90vh] overflow-y-auto`}>
        <ModalCloseButton onClick={onClose} />
        <h3 className="text-lg font-bold pr-8">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

const FieldError = ({ msg }) => (msg ? <p className="text-red-600 text-xs mt-1">{msg}</p> : null)

/** Alta o edición. El stock inicial solo se captura al crear; después, con "Ajustar stock". */
function FormModal({ item, categories, onClose, onSaved }) {
  const { notify, confirmDialog } = useNotify()
  const [form, setForm] = useState(() => item ? {
    name: item.name ?? '', description: item.description ?? '', barcode: item.barcode ?? '',
    cost: item.cost != null ? String(item.cost) : '', stock: '', minStock: item.minStock ?? 0, categoryId: item.category?.id ?? '',
  } : emptyForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function handleSave(e) {
    e.preventDefault()
    const errs = {}
    if (!form.name.trim()) errs.name = 'El nombre es obligatorio'
    else if (form.name.length > 200) errs.name = 'El nombre no puede tener más de 200 caracteres'
    if (form.barcode.length > 100) errs.barcode = 'El código de producto no puede tener más de 100 caracteres'
    if (form.description.length > 500) errs.description = 'La descripción no puede tener más de 500 caracteres'
    if (form.cost !== '' && (Number.isNaN(Number(form.cost)) || Number(form.cost) < 0)) errs.cost = 'Captura un costo válido'
    else if (form.cost !== '' && Number(form.cost) > 9999999999.99) errs.cost = 'El costo no puede ser mayor a 9,999,999,999.99'
    if (form.stock !== '' && Number(form.stock) > MAX_INT) errs.stock = 'El stock no puede ser mayor a 2,147,483,647'
    if (form.minStock !== '' && Number(form.minStock) > MAX_INT) errs.minStock = 'El stock mínimo no puede ser mayor a 2,147,483,647'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    const msg = item ? `¿Guardar los cambios de "${form.name.trim()}"?` : `¿Agregar "${form.name.trim()}" a materia prima${form.stock ? ` con ${pzs(form.stock)}` : ''}?`
    if (!(await confirmDialog(msg, { confirmText: item ? 'Guardar cambios' : 'Agregar', danger: false }))) return
    setSaving(true)
    const payload = {
      name: form.name.trim(), description: form.description.trim() || null, barcode: form.barcode.trim() || null,
      cost: form.cost === '' ? 0 : Number(form.cost), minStock: form.minStock === '' ? 0 : Number(form.minStock),
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      ...(item ? {} : { stock: form.stock === '' ? 0 : Number(form.stock) }),
    }
    try {
      if (item) await updateRawMaterial(item.id, payload)
      else await createRawMaterial(payload)
      notify(item ? 'Materia prima actualizada' : 'Materia prima agregada', 'success')
      onSaved()
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      notify(err.response?.data?.message ?? 'No se pudo guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={item ? 'Editar materia prima' : 'Nueva materia prima'} subtitle="Se maneja por piezas" onClose={onClose} wide>
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Nombre *</label>
          <input className="input" value={form.name} onChange={set('name')} />
          <FieldError msg={errors.name} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Código de producto</label>
            <input className="input" value={form.barcode} onChange={set('barcode')} />
            <FieldError msg={errors.barcode} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Categoría (opcional)</label>
            <select className="input" value={form.categoryId} onChange={set('categoryId')}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Costo por pieza ($)</label>
            <input className="input" type="text" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value.replace(/[^0-9.]/g, '') })} />
            <FieldError msg={errors.cost} />
          </div>
          {!item && (
            <div>
              <label className="text-xs font-medium text-gray-600">Piezas iniciales</label>
              <input className="input" type="text" inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: onlyDigits(e.target.value) })} placeholder="0" />
              <FieldError msg={errors.stock} />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600">Stock mínimo (piezas)</label>
            <input className="input" type="text" inputMode="numeric" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: onlyDigits(e.target.value) })} />
            <FieldError msg={errors.minStock} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Descripción</label>
          <textarea className="input" rows={2} value={form.description} onChange={set('description')} />
          <FieldError msg={errors.description} />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : item ? 'Guardar cambios' : 'Agregar'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Entrada o salida manual de piezas. Quitar piezas: solo admin/supervisor (igual que Inventario). */
function AdjustModal({ item, isAdmin, onClose, onSaved }) {
  const { notify, confirmDialog } = useNotify()
  const [direction, setDirection] = useState('IN')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const qtyNum = Number(qty) || 0
  const preview = direction === 'IN' ? item.stock + qtyNum : item.stock - qtyNum

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (qtyNum <= 0) errs.quantity = 'La cantidad debe ser mayor a 0'
    else if (preview > MAX_INT) errs.quantity = 'El número es excesivamente grande — el máximo permitido es 2,147,483,647'
    else if (preview < 0) errs.quantity = `Solo hay ${pzs(item.stock)}`
    if (reason.length > 255) errs.reason = 'El motivo no puede tener más de 255 caracteres'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    const msg = direction === 'IN' ? `¿Agregar ${pzs(qtyNum)} a "${item.name}"?` : `¿Quitar ${pzs(qtyNum)} de "${item.name}"?`
    if (!(await confirmDialog(msg, { confirmText: 'Confirmar', danger: direction === 'OUT' }))) return
    setSaving(true)
    try {
      await adjustRawMaterialStock(item.id, { quantity: direction === 'IN' ? qtyNum : -qtyNum, reason: reason.trim() || null })
      notify(direction === 'IN' ? `${pzs(qtyNum)} agregada(s) a "${item.name}"` : `${pzs(qtyNum)} descontada(s) de "${item.name}"`, 'success')
      onSaved()
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      notify(err.response?.data?.message ?? 'No se pudo ajustar el stock', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Ajustar stock" subtitle={`${item.name} — actual: ${pzs(item.stock)} · mínimo: ${item.minStock}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className={`grid gap-2 ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button type="button"
            className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${direction === 'IN' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            onClick={() => { setDirection('IN'); setErrors({}) }}>➕ Agregar piezas</button>
          {isAdmin && (
            <button type="button"
              className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${direction === 'OUT' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              onClick={() => { setDirection('OUT'); setErrors({}) }}>➖ Quitar piezas</button>
          )}
        </div>
        <QtyStepper value={qty} onChange={setQty} error={errors.quantity} />
        {qtyNum > 0 && preview <= MAX_INT && (
          <div className={`text-sm rounded-lg px-3 py-2 ${preview < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
            Nuevo stock: <span className="font-bold">{preview}</span> pzas{preview < 0 && ' — no puede ser negativo'}
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-gray-600">Motivo</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Compra, merma, uso interno..." />
          <FieldError msg={errors.reason} />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving || qtyNum === 0 || preview < 0}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Botón que repite su acción mientras se mantiene presionado: un paso al tocar, y tras
 * una pausa corta repite, cada vez más rápido. Con teclado (Enter/Espacio) da un paso por
 * pulsación, como un botón normal.
 */
function HoldButton({ onStep, label, children }) {
  const timer = useRef(null)
  const stepRef = useRef(onStep)
  stepRef.current = onStep

  function stop() {
    clearTimeout(timer.current)
    timer.current = null
  }

  function start(e) {
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    stop()
    stepRef.current()
    let delay = 400
    let count = 0
    const tick = () => {
      stepRef.current()
      count += 1
      // Acelera: 120 ms al empezar, 60 ms tras 10 pasos, 30 ms tras 30.
      delay = count < 10 ? 120 : count < 30 ? 60 : 30
      timer.current = setTimeout(tick, delay)
    }
    timer.current = setTimeout(tick, delay)
  }

  useEffect(() => stop, [])

  return (
    <button
      type="button" aria-label={label}
      className="w-9 h-9 rounded border text-gray-600 hover:bg-gray-100 text-lg leading-none select-none touch-none"
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      // Solo teclado (detail 0): con mouse/touch el paso ya lo dio onPointerDown.
      onClick={(e) => { if (e.detail === 0) onStep() }}
    >
      {children}
    </button>
  )
}

function QtyStepper({ value, onChange, error, max }) {
  const clamp = (n) => Math.max(0, max != null ? Math.min(n, max) : Math.min(n, MAX_INT))
  // Actualización funcional: al repetir rápido, cada paso parte del valor más reciente.
  const step = (delta) => onChange((prev) => String(clamp((Number(prev) || 0) + delta)))
  return (
    <div>
      <label className="text-xs font-medium text-gray-600">Cantidad de piezas *</label>
      <div className="flex items-center gap-2">
        <HoldButton label="Quitar una" onStep={() => step(-1)}>−</HoldButton>
        <input className="input text-center" type="text" inputMode="numeric" value={value} onChange={(e) => onChange(onlyDigits(e.target.value))} />
        <HoldButton label="Agregar una" onStep={() => step(1)}>+</HoldButton>
      </div>
      <p className="text-xs text-gray-400 mt-1">Mantén presionado − o + para avanzar rápido.</p>
      <FieldError msg={error} />
    </div>
  )
}

/**
 * Pasar piezas a inventario: a un producto existente (por defecto el último al que se
 * pasó) o a uno nuevo que se crea con el costo de la materia prima.
 */
function TransferModal({ item, categories, onClose, onSaved }) {
  const { hasAction } = useAuth()
  const { notify, confirmDialog } = useNotify()
  const canExisting = hasAction('INVENTORY', 'EDIT')
  const canNew = hasAction('INVENTORY', 'CREATE')
  const [mode, setMode] = useState(canExisting ? 'existing' : 'new')
  const [qty, setQty] = useState(String(Math.min(1, item.stock)))
  const [product, setProduct] = useState(item.linkedProductId && item.linkedProductName ? { id: item.linkedProductId, name: item.linkedProductName } : null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [newProduct, setNewProduct] = useState({ name: item.name, price: '', categoryId: item.category?.id ?? '', barcode: item.barcode ?? '' })
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const qtyNum = Number(qty) || 0

  useEffect(() => {
    if (mode !== 'existing' || !q.trim()) { setResults([]); return undefined }
    const t = setTimeout(() => {
      searchProducts({ q: q.trim(), size: 8 }).then((r) => setResults(r.data.data ?? [])).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q, mode])

  const targetName = mode === 'existing' ? product?.name : newProduct.name.trim()

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (qtyNum <= 0) errs.quantity = 'La cantidad debe ser mayor a 0'
    else if (qtyNum > item.stock) errs.quantity = `Solo hay ${pzs(item.stock)}`
    if (mode === 'existing' && !product) errs.product = 'Elige el producto que recibe las piezas'
    if (mode === 'new') {
      if (!newProduct.name.trim()) errs.newProductName = 'El nombre es obligatorio'
      else if (newProduct.name.length > 200) errs.newProductName = 'El nombre no puede tener más de 200 caracteres'
      if (newProduct.price === '' || Number.isNaN(Number(newProduct.price))) errs.newProductPrice = 'Captura el precio de venta'
      else if (Number(newProduct.price) > 9999999999.99) errs.newProductPrice = 'El precio no puede ser mayor a 9,999,999,999.99'
      if (!newProduct.categoryId) errs.newProductCategoryId = 'Elige la categoría'
      if (newProduct.barcode.length > 100) errs.barcode = 'El código de producto no puede tener más de 100 caracteres'
    }
    if (note.length > 255) errs.reason = 'La nota no puede tener más de 255 caracteres'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    const msg = mode === 'existing'
      ? `¿Pasar ${pzs(qtyNum)} de "${item.name}" al producto "${targetName}"? Saldrán de materia prima y quedarán a la venta.`
      : `¿Crear el producto "${targetName}" a ${fmt(newProduct.price)} y pasarle ${pzs(qtyNum)} de "${item.name}"? Quedarán a la venta.`
    if (!(await confirmDialog(msg, { confirmText: 'Pasar a inventario', danger: false }))) return
    setSaving(true)
    try {
      await transferRawMaterialToInventory(item.id, {
        quantity: qtyNum,
        reason: note.trim() || null,
        ...(mode === 'existing'
          ? { productId: product.id }
          : {
              newProductName: newProduct.name.trim(), newProductPrice: Number(newProduct.price),
              newProductCategoryId: Number(newProduct.categoryId), newProductBarcode: newProduct.barcode.trim() || null,
            }),
      })
      notify(`${pzs(qtyNum)} pasada(s) a "${targetName}"`, 'success')
      onSaved()
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      notify(err.response?.data?.message ?? 'No se pudo pasar a inventario', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Pasar a inventario" subtitle={`${item.name} — hay ${pzs(item.stock)}`} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <QtyStepper value={qty} onChange={setQty} error={errors.quantity} max={item.stock} />

        {canExisting && canNew && (
          <div role="tablist" aria-label="Producto que recibe" className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
            {[{ key: 'existing', label: 'Producto existente' }, { key: 'new', label: 'Producto nuevo' }].map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={mode === t.key}
                className={`min-h-[40px] rounded-lg text-sm font-semibold ${mode === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}
                onClick={() => { setMode(t.key); setErrors({}) }}>{t.label}</button>
            ))}
          </div>
        )}

        {mode === 'existing' ? (
          <div className="space-y-2">
            {product ? (
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl border-2 border-purple-600 bg-purple-50">
                <span className="text-sm"><span className="font-semibold">{product.name}</span>{product.stock != null && <span className="text-gray-600"> · hay {pzs(product.stock)}</span>}</span>
                <button type="button" className="text-sm text-purple-700 font-semibold hover:underline" onClick={() => setProduct(null)}>Cambiar</button>
              </div>
            ) : (
              <>
                <label htmlFor="transfer-search" className="text-xs font-medium text-gray-600 block">Producto que recibe las piezas *</label>
                <input id="transfer-search" className="input" placeholder="Buscar producto por nombre o código..." value={q} onChange={(e) => setQ(e.target.value)} />
                {results.length > 0 && (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                    {results.map((p) => (
                      <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between gap-2"
                        onClick={() => { setProduct(p); setQ(''); setResults([]) }}>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-gray-500">{fmt(p.price)} · {pzs(p.stock)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {q.trim() && results.length === 0 && <p className="text-xs text-gray-500">Sin coincidencias.{canNew && ' Puedes crearlo en "Producto nuevo".'}</p>}
              </>
            )}
            <FieldError msg={errors.product} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Nombre del producto *</label>
              <input className="input" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
              <FieldError msg={errors.newProductName ?? errors.name} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Precio de venta ($) *</label>
              <input className="input" type="text" inputMode="decimal" value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value.replace(/[^0-9.]/g, '') })} />
              <FieldError msg={errors.newProductPrice ?? errors.price} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Categoría *</label>
              <select className="input" value={newProduct.categoryId} onChange={(e) => setNewProduct({ ...newProduct, categoryId: e.target.value })}>
                <option value="">Elige la categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <FieldError msg={errors.newProductCategoryId} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Código del producto</label>
              <input className="input" value={newProduct.barcode} onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })} />
              <FieldError msg={errors.barcode} />
              <p className="text-xs text-gray-500 mt-1">Costo: {fmt(item.cost)} por pieza (el de la materia prima).</p>
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-600">Nota (opcional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Para la temporada" />
          <FieldError msg={errors.reason} />
        </div>

        {qtyNum > 0 && qtyNum <= item.stock && targetName && (
          <div className="text-sm rounded-lg px-3 py-2 bg-blue-50 text-blue-900 space-y-0.5">
            <p>Materia prima: {item.stock} → <span className="font-bold">{item.stock - qtyNum}</span> pzas</p>
            <p>{targetName}: <span className="font-bold">+{qtyNum}</span> pzas a la venta</p>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving || item.stock <= 0}>{saving ? 'Guardando...' : 'Pasar a inventario'}</button>
        </div>
      </form>
    </Modal>
  )
}

const MOVE_LABELS = {
  IN: { label: 'Entrada', cls: 'bg-green-100 text-green-800', sign: '+' },
  OUT: { label: 'Salida', cls: 'bg-red-100 text-red-800', sign: '−' },
  TO_INVENTORY: { label: 'A inventario', cls: 'bg-purple-100 text-purple-800', sign: '−' },
}

/** Historial paginado de movimientos de una materia prima. */
function HistoryModal({ item, onClose }) {
  const { notify } = useNotify()
  const [data, setData] = useState({ content: [], totalPages: 0 })
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getRawMaterialMovements(item.id, { page, size: 10 })
      .then((r) => setData(r.data.data ?? { content: [], totalPages: 0 }))
      .catch((err) => notify(err.response?.data?.message ?? 'No se pudo cargar el historial', 'error'))
      .finally(() => setLoading(false))
  }, [item.id, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data.content ?? []
  return (
    <Modal title="Historial" subtitle={`${item.name} — hay ${pzs(item.stock)}`} onClose={onClose} wide>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="text-left py-2 pr-2 font-medium">Fecha</th>
              <th className="text-left py-2 pr-2 font-medium">Tipo</th>
              <th className="text-left py-2 pr-2 font-medium">Detalle</th>
              <th className="text-right py-2 pr-2 font-medium">Piezas</th>
              <th className="text-right py-2 font-medium">Antes → después</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((m) => {
              const t = MOVE_LABELS[m.type] ?? { label: m.type, cls: 'bg-gray-100 text-gray-700', sign: '' }
              return (
                <tr key={m.id}>
                  <td className="py-2 pr-2 whitespace-nowrap text-gray-600">{fmtDate(m.createdAt)}</td>
                  <td className="py-2 pr-2"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.cls}`}>{t.label}</span></td>
                  <td className="py-2 pr-2 text-gray-700">{m.reason ?? '—'}{m.userName && <span className="block text-xs text-gray-400">{m.userName}</span>}</td>
                  <td className="py-2 pr-2 text-right font-semibold">{t.sign}{m.quantity}</td>
                  <td className="py-2 text-right text-gray-600 whitespace-nowrap">{m.previousStock} → {m.newStock}</td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-400">{loading ? 'Cargando...' : 'Sin movimientos'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between pt-3 text-sm">
        <button className="btn-secondary py-1 px-3 text-xs disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹ Anterior</button>
        <span className="text-xs text-gray-500">Página {data.totalPages === 0 ? 0 : page + 1} de {data.totalPages}</span>
        <button className="btn-secondary py-1 px-3 text-xs disabled:opacity-40" disabled={page + 1 >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente ›</button>
      </div>
      <div className="flex justify-end pt-3">
        <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}
