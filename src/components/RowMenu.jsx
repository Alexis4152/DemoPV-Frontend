import { useEffect, useRef, useState } from 'react'

/**
 * Botón de fila (mismo tamaño que IconButton) que abre un menú con más acciones. El menú se
 * dibuja con posición fija para que no lo corte el scroll horizontal de la tabla; se cierra
 * al elegir, al hacer clic fuera, con Escape o al desplazar la página.
 *
 * @param items [{ key, label, icon, onClick, tone }] — solo las acciones que aplican.
 * @param dot   muestra un punto de aviso (hay algo pendiente dentro del menú).
 */
export default function RowMenu({ icon: Icon, label, items, dot = false }) {
  const [pos, setPos] = useState(null)
  const btn = useRef(null)
  const menu = useRef(null)
  const empty = items.length === 0

  useEffect(() => {
    if (!pos) return undefined
    const close = () => setPos(null)
    const onDown = (e) => {
      if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) close()
    }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])

  function toggle() {
    if (pos) return setPos(null)
    const r = btn.current.getBoundingClientRect()
    const width = 224
    const height = items.length * 40 + 8
    const below = r.bottom + 4 + height <= window.innerHeight
    setPos({
      left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)),
      top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - height),
      width,
    })
  }

  return (
    <>
      <button
        ref={btn} type="button" disabled={empty} onClick={toggle} title={label} aria-label={label}
        aria-haspopup="menu" aria-expanded={!!pos}
        className={`relative w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg border transition-colors disabled:opacity-40 disabled:pointer-events-none border-gray-200 text-gray-600 hover:bg-gray-50 ${pos ? 'bg-gray-100' : ''}`}
      >
        <Icon className="w-4 h-4" />
        {dot && !empty && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" />}
      </button>
      {pos && (
        <div ref={menu} role="menu" style={pos}
          className="fixed z-50 py-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          {items.map(({ key, label: text, icon: ItemIcon, onClick, tone }) => (
            <button
              key={key} type="button" role="menuitem"
              className={`w-full h-10 px-3 flex items-center gap-2 text-sm text-left hover:bg-gray-50 ${tone === 'warning' ? 'text-amber-700' : 'text-gray-700'}`}
              onClick={() => { setPos(null); onClick() }}
            >
              {ItemIcon && <ItemIcon className="w-4 h-4 shrink-0" />}
              <span className="truncate">{text}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
