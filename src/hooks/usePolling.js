import { useEffect, useRef } from 'react'

/**
 * Repite `callback` cada `intervalSeconds` segundos mientras el componente esté
 * montado, y además lo dispara de inmediato al recuperar el foco de la pestaña (ej. el
 * cajero vuelve después de un rato en otra ventana) — así el módulo se actualiza solo,
 * sin depender de un F5 ni de volver a entrar.
 *
 * `callback` se guarda en un ref para no reiniciar el intervalo en cada render (no hace
 * falta envolverlo en `useCallback` en el caller).
 *
 * @param {() => void} callback - función a repetir (normalmente el mismo `load()` del montaje).
 * @param {number|null|undefined} intervalSeconds - segundos entre cada corrida; `null`/`undefined`/`<= 0` desactiva el intervalo (el refresh al recuperar el foco se conserva).
 */
export default function usePolling(callback, intervalSeconds) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!intervalSeconds || intervalSeconds <= 0) return
    const id = setInterval(() => callbackRef.current(), intervalSeconds * 1000)
    return () => clearInterval(id)
  }, [intervalSeconds])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') callbackRef.current()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])
}
