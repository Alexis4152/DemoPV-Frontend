import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { trackArcoRequest, answerArcoInfoByToken } from '../api/arco'
import { ARCO_TYPE_LABELS, ARCO_STATUS_LABELS } from '../utils/arcoTypes'
import logo from '../assets/logo.png'

const fmtDate = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const fmtDay = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—'

/**
 * Portal público de seguimiento de una solicitud ARCO, por el link que se manda al correo
 * (`/arco/seguimiento/:token`, sin sesión). Visitarlo YA ES la confirmación de correo si la
 * solicitud seguía {@code PENDING_EMAIL} (ver {@code ArcoRequestService#trackByToken}) — el
 * backend lo hace como efecto secundario del mismo GET, así que no hace falta un paso
 * aparte. Si está {@code INFO_REQUESTED}, aquí mismo se puede responder lo que se pidió.
 *
 * A propósito vive FUERA del `Layout`/`PrivateRoute`, igual que `ArcoRequest.jsx`: el token
 * en la URL es la única credencial que hace falta.
 */
export default function ArcoTracking() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [answer, setAnswer] = useState('')
  const [answering, setAnswering] = useState(false)
  const [answerError, setAnswerError] = useState('')

  function load() {
    setLoading(true)
    trackArcoRequest(token)
      .then((r) => setData(r.data.data))
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar tu solicitud.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAnswer(e) {
    e.preventDefault()
    if (!answer.trim()) { setAnswerError('Escribe tu respuesta'); return }
    setAnswerError('')
    setAnswering(true)
    try {
      const res = await answerArcoInfoByToken(token, answer.trim())
      setData(res.data.data)
      setAnswer('')
    } catch (err) {
      setAnswerError(err.response?.data?.message || 'No se pudo enviar tu respuesta')
    } finally {
      setAnswering(false)
    }
  }

  const status = data ? ARCO_STATUS_LABELS[data.status] : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#03050c] via-[#050b18] to-[#0d1b3d] flex items-center justify-center p-4 relative overflow-hidden">
      <img
        src={logo} alt="" aria-hidden="true"
        className="pointer-events-none select-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-none opacity-[0.05]"
      />
      <div className="bg-white rounded-2xl shadow-2xl shadow-[#155dea]/30 w-full max-w-lg p-6 sm:p-8 relative z-10 max-h-[92vh] overflow-y-auto">
        <div className="text-center mb-6">
          <img src={logo} alt="Nexora Systems" className="w-20 h-20 rounded-full mx-auto mb-3 shadow-[0_0_24px_rgba(43,132,245,0.5)]" />
          <h1 className="text-2xl font-bold text-gray-900">Seguimiento de tu solicitud ARCO</h1>
        </div>

        {loading ? (
          <p className="text-center text-sm text-gray-400 py-8">Cargando...</p>
        ) : error ? (
          <div className="text-center space-y-4">
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-4">{error}</div>
            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">← Volver al inicio de sesión</Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
              <span className="text-xs text-gray-400">Folio #{data.id}</span>
            </div>

            <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1.5 text-sm">
              <p><span className="text-gray-500">Tipo de solicitud:</span> <span className="font-medium">{ARCO_TYPE_LABELS[data.type]}</span></p>
              <p><span className="text-gray-500">Recibida:</span> {fmtDate(data.receivedAt)}</p>
              {data.dueDate && <p><span className="text-gray-500">Plazo de respuesta:</span> {fmtDay(data.dueDate)}</p>}
            </div>

            {data.status === 'PENDING_EMAIL' && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-4 py-3">
                Tu correo ya quedó confirmado y tu solicitud está en curso.
              </div>
            )}

            {data.status === 'INFO_REQUESTED' && (
              <div className="space-y-3">
                <div className="bg-orange-50 border border-orange-200 text-orange-900 text-sm rounded-lg px-4 py-3 space-y-1">
                  <p className="font-semibold">Necesitamos más información de tu parte:</p>
                  <p>{data.infoRequest}</p>
                  {data.infoDue && <p className="text-xs text-orange-700">Respóndenos antes del {fmtDay(data.infoDue)}.</p>}
                </div>
                <form onSubmit={handleAnswer} className="space-y-2">
                  <textarea
                    className="input" rows={3} maxLength={2000} value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Escribe tu respuesta aquí"
                  />
                  {answerError && <p className="text-red-600 text-xs">{answerError}</p>}
                  <button type="submit" className="btn-primary w-full" disabled={answering}>
                    {answering ? 'Enviando...' : 'Enviar respuesta'}
                  </button>
                </form>
              </div>
            )}

            {data.outcome && (
              <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1.5 text-sm">
                <p className="font-semibold text-gray-800">Respuesta: {data.outcome}</p>
                {data.resolutionNotes && <p className="text-gray-600 whitespace-pre-wrap">{data.resolutionNotes}</p>}
                {data.resolvedAt && <p className="text-xs text-gray-400">Respondida el {fmtDate(data.resolvedAt)}</p>}
              </div>
            )}

            {data.status === 'COMPLETED' && data.executionSummary && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm space-y-1">
                <p className="font-semibold text-green-800">Qué se hizo:</p>
                <p className="text-green-800 whitespace-pre-wrap">{data.executionSummary}</p>
              </div>
            )}

            {data.status === 'NOT_FILED' && (
              <div className="bg-gray-50 border border-gray-200 text-gray-600 text-sm rounded-lg px-4 py-3">
                Esta solicitud se cerró porque no recibimos tu respuesta a la información que te pedimos dentro del plazo.
                Si todavía te interesa, puedes levantar una nueva solicitud.
              </div>
            )}

            <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700 pt-2">
              ← Volver al inicio de sesión
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
