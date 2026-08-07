import { createContext, useCallback, useContext, useState } from 'react'

const NotifyContext = createContext(null)

let idCounter = 0

const TOAST_STYLES = {
  error: { box: 'bg-red-50 border-red-200 text-red-700', icon: '⚠️' },
  success: { box: 'bg-green-50 border-green-200 text-green-700', icon: '✅' },
  // "info" usa la paleta purple-*, que ya sigue el color de marca de la tienda
  info: { box: 'bg-purple-50 border-purple-200 text-purple-700', icon: 'ℹ️' },
}

// Reemplaza los alert()/confirm() nativos del navegador (los feos "localhost dice") por
// toasts y un modal de confirmación con el estilo de la app — el botón de confirmar usa
// btn-primary/btn-danger, que ya siguen el color elegido por el admin de cada tienda.
export function NotifyProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const notify = useCallback((message, type = 'error') => {
    const id = ++idCounter
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => dismiss(id), 4500)
  }, [dismiss])

  const confirmDialog = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setConfirmState({ message, opts, resolve })
    })
  }, [])

  function handleConfirm(result) {
    confirmState?.resolve(result)
    setConfirmState(null)
  }

  return (
    <NotifyContext.Provider value={{ notify, confirmDialog }}>
      {children}

      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const style = TOAST_STYLES[t.type] ?? TOAST_STYLES.error
          return (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-lg shadow-lg border px-4 py-3 text-sm flex items-start gap-3 animate-[toast-in_0.2s_ease-out] ${style.box}`}
            >
              <span className="text-base leading-none">{style.icon}</span>
              <p className="flex-1">{t.message}</p>
              <button className="text-current opacity-50 hover:opacity-100 leading-none" onClick={() => dismiss(t.id)}>✕</button>
            </div>
          )
        })}
      </div>

      {confirmState && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[101] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            {confirmState.opts.title && <h3 className="text-lg font-bold text-gray-900 mb-2">{confirmState.opts.title}</h3>}
            <p className="text-sm text-gray-700 mb-6">{confirmState.message}</p>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => handleConfirm(false)}>
                {confirmState.opts.cancelText ?? 'Cancelar'}
              </button>
              <button
                className={confirmState.opts.danger === false ? 'btn-primary' : 'btn-danger'}
                onClick={() => handleConfirm(true)}
              >
                {confirmState.opts.confirmText ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotifyContext.Provider>
  )
}

export const useNotify = () => useContext(NotifyContext)
