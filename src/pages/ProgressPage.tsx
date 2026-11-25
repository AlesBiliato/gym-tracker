import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { formatDate, formatKg, weekdayName } from '../domain/format'
import { PageHeader } from '../components/ui'
import type { SetLog } from '../db/types'

export default function ProgressPage() {
  const sessions = useLiveQuery(async () => (await db.sessions.toArray()).filter((s) => !s.deletedAt).sort((a, b) => b.date.localeCompare(a.date)), [])
  const exs = useLiveQuery(() => db.sessionExercises.toArray(), [])
  const sets = useLiveQuery(() => db.sets.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const [open, setOpen] = useState<string | null>(null)
  if (!sessions || !exs || !sets || !exercises) return <PageHeader title="Progreso" />

  const fmt = (s: SetLog, uni: boolean) =>
    `${uni ? `${formatKg(s.l)}/${formatKg(s.r)}` : formatKg(s.w)}×${s.reps ?? '–'}${s.rir != null ? ` (${s.rir})` : ''}${s.failed ? '✗' : ''}`

  return (
    <>
      <PageHeader title="Progreso" sub="Historial de sesiones (gráficas y volumen: fase 2)" />
      <div className="space-y-3 px-4">
        {sessions.length === 0 && <p className="text-center text-slate-500">Sin sesiones todavía. Importa tu historial desde <Link to="/mas" className="text-sky-500 underline">Más</Link>.</p>}
        {sessions.map((s) => {
          const list = exs.filter((e) => e.sessionId === s.id).sort((a, b) => a.order - b.order)
          const isOpen = open === s.id
          return (
            <div key={s.id} className="card !p-0 overflow-hidden">
              <button className="flex min-h-16 w-full items-center justify-between p-4 text-left" onClick={() => setOpen(isOpen ? null : s.id)}>
                <span>
                  <span className="block text-lg font-bold">{formatDate(s.date)} · {weekdayName(s.date)}</span>
                  <span className="text-sm text-slate-500">Sesión {s.templateCode ?? '–'} · {list.length} ejercicios{s.status === 'en_curso' ? ' · en curso' : ''}</span>
                </span>
                <span className="text-slate-400">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
                  {s.notes && <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">{s.notes}</p>}
                  {list.map((e) => {
                    const ex = exercises.find((x) => x.id === e.exerciseId)
                    const ss = sets.filter((x) => x.sessionExerciseId === e.id && x.done).sort((a, b) => a.index - b.index)
                    return (
                      <div key={e.id}>
                        <p className="font-semibold">{ex?.name ?? '?'} {e.status === 'no_hecho' && <span className="text-slate-400">· no hecho</span>}</p>
                        <p className="text-sm tabular-nums text-slate-500">{ss.map((x) => fmt(x, !!ex?.unilateral)).join('  ') || '—'}</p>
                        {e.obs && <p className="text-sm italic text-slate-500">{e.obs}</p>}
                      </div>
                    )
                  })}
                  <Link to={`/sesion/${s.id}/resumen`} className="btn btn-soft btn-sm">Ver resumen</Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
