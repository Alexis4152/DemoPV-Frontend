/**
 * Pantalla que se muestra en el Login mientras hay una ventana de mantenimiento ACTIVA: en
 * lugar del formulario, un aviso con ilustración (engranes, dibujados aquí en SVG — sin
 * imágenes externas, carga al instante) y la hora estimada de regreso. Solo el SUPER_ADMIN
 * puede entrar en ese tiempo, por la URL especial /login?admin (ver Login.jsx).
 *
 * @param {{ endAt: string }} props Fin estimado de la ventana (ISO).
 */
export default function MaintenanceScreen({ endAt }) {
  const end = new Date(endAt)
  const sameDay = end.toDateString() === new Date().toDateString()
  const time = end.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const day = end.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="bg-white rounded-2xl shadow-2xl shadow-[#155dea]/30 w-full p-6 sm:p-8 text-center">
      <Gears />
      <h1 className="text-2xl font-bold text-gray-900 mt-4">Estamos mejorando el sistema</h1>
      <p className="text-gray-600 mt-2">
        Realizamos un mantenimiento programado para que todo funcione mejor.
      </p>
      <div className="mt-5 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Regresamos aproximadamente</p>
        <p className="text-lg font-bold text-gray-900 mt-0.5">
          {sameDay ? `a las ${time} hrs` : `el ${day} a las ${time} hrs`}
        </p>
      </div>
      <p className="text-sm text-gray-500 mt-5">🔒 Tu información está segura. No necesitas hacer nada.</p>
      <p className="text-xs text-gray-400 mt-2">Esta página se actualiza sola cuando el sistema vuelva a estar disponible.</p>
    </div>
  )
}

/** Dos engranes entrelazados que giran en sentidos opuestos (quietos con "reducir movimiento"). */
function Gears() {
  return (
    <svg viewBox="0 0 200 140" className="w-48 h-auto mx-auto" role="img" aria-label="Engranes en mantenimiento">
      <g className="motion-safe:animate-[spin_8s_linear_infinite]" style={{ transformOrigin: '78px 70px' }}>
        <Gear cx={78} cy={70} r={34} teeth={10} color="#155dea" />
      </g>
      <g className="motion-safe:animate-[spin_6s_linear_infinite_reverse]" style={{ transformOrigin: '140px 46px' }}>
        <Gear cx={140} cy={46} r={22} teeth={8} color="#2b84f5" />
      </g>
    </svg>
  )
}

/** Engrane: dientes alrededor de un círculo, con un hueco al centro. */
function Gear({ cx, cy, r, teeth, color }) {
  const toothW = (2 * Math.PI * r) / teeth / 2
  const toothH = r * 0.28
  return (
    <g fill={color}>
      {Array.from({ length: teeth }, (_, i) => (
        <rect
          key={i}
          x={cx - toothW / 2}
          y={cy - r - toothH + 2}
          width={toothW}
          height={toothH}
          rx={2}
          transform={`rotate(${(360 / teeth) * i} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r} />
      <circle cx={cx} cy={cy} r={r * 0.38} fill="white" />
    </g>
  )
}
