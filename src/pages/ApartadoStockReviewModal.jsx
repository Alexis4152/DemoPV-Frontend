import { useState } from 'react'
import { reviewApartadoStock } from '../api/apartados'
import { useNotify } from '../context/NotifyContext'
import useEscapeClose from '../hooks/useEscapeClose'
import ModalCloseButton from '../components/ModalCloseButton'
import ItemOutcomePicker, { anyNotRestocked, outcomesPayload } from '../components/ItemOutcomePicker'

/**
 * Revisar el inventario de un apartado que venció o que canceló el cliente desde la tienda en
 * línea (ver ApartadoService#reviewStock): el producto no regresó solo; aquí se decide, por
 * producto, si regresa, es merma o no regresó.
 */
export default function ApartadoStockReviewModal({ apartado, onClose, onDone }) {
  const { notify } = useNotify()
  const [outcomes, setOutcomes] = useState({})
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEscapeClose(!saving, onClose)

  const items = (apartado.items ?? []).filter((i) => i.product && !i.product.isMadeToOrder)
    .map((i) => ({ id: i.id, name: i.productName, quantity: i.quantity }))
  const noteRequired = anyNotRestocked(items, outcomes)
  const why = apartado.status === 'EXPIRED' ? 'venció' : 'lo canceló el cliente desde la tienda en línea'

  async function submit() {
    const n = note.trim()
    const err = noteRequired && !n ? 'Escribe el motivo: hay productos que no regresan al inventario'
      : n.length > 300 ? 'La nota no puede tener más de 300 caracteres' : ''
    setError(err)
    if (err) {
      notify('Revisa los campos marcados en rojo', 'error')
      return
    }
    setSaving(true)
    try {
      await reviewApartadoStock(apartado.id, { items: outcomesPayload(items, outcomes), note: n || undefined })
      notify('Inventario revisado', 'success')
      onDone()
    } catch (e) {
      const field = e.response?.data?.data?.note
      if (field) setError(field)
      notify(field ?? e.response?.data?.message ?? 'No se pudo guardar la revisión', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <ModalCloseButton onClick={onClose} disabled={saving} />
        <h3 className="text-lg font-bold mb-1 pr-8">Revisar inventario · apartado #{apartado.folio}</h3>
        <p className="text-xs text-gray-500 mb-4">
          {apartado.customerName} — {why}. El producto sigue apartado (fuera del inventario) hasta que confirmes qué pasó con él.
        </p>

        <div className="mb-4">
          <ItemOutcomePicker items={items} value={outcomes} onChange={(v) => { setOutcomes(v); setError('') }} />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">
            Nota {noteRequired ? <span className={error ? 'text-red-600' : ''}>*</span> : <span className="text-gray-400">(opcional)</span>}
          </label>
          <textarea className="input" rows={2} placeholder="Ej. Las carnes frías ya no estaban en condiciones"
            value={note} onChange={(e) => { setNote(e.target.value); setError('') }} />
          {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cerrar</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
            {saving ? 'Guardando...' : 'Guardar revisión'}
          </button>
        </div>
      </div>
    </div>
  )
}
