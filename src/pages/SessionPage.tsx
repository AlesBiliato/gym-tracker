import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getSettings } from '../db/repo'
import { formatDate } from '../domain/format'
import ExerciseCard from '../components/ExerciseCard'
import { PageHeader } from '../components/ui'

export default function SessionPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const session = useLiveQuery(() => db.sessions.get(id), [id])
  const exs = useLiveQuery(() => db.sessionExercises.where('sessionId').equals(id).sortBy('order'), [id])
  const allSets = useLiveQuery(async () => {
    const ids = (await db.sessionExercises.where('sessionId').equals(id).primaryKeys()) as string[]
    return db.sets.where('sessionExerciseId').anyOf(ids).toArray()
  }, [id])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const [openId, setOpenId] = useState<string | null | undefined>(undefined)

  // Pantalla siempre encendida durante la sesión (si el navegador lo permite).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const req = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock
        lock = (await wl?.request('screen')) ?? null
      } catch { /* sin wake lock */ }
    }
    req()
    const onVis = () => document.visibilityState === 'visible' && req()
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}) }
  }, [])

  if (!session || !exs || !allSets || !exercises || !settings) return <PageHeader title="Sesión" />
  const exOf = (eid: string) => exercises.find((e) => e.id === eid)!
  const nameOf = (eid: string) => exercises.find((e) => e.id === eid)?.name ?? '?'
  const setsOf = (seId: string) => allSets.filter((s) => s.sessionExerciseId === seId)

  const mains = exs.filter((e) => !e.pairedWithId)
  // Al entrar en la sesión no hay ningún ejercicio abierto: se abre el que toques, y se queda abierto
  // (así la corrección de reps/RIR de la última serie no desaparece sola).
  const currentOpen = openId ?? null
  const readOnly = session.status === 'cerrada'
  const totalDone = allSets.filter((s) => s.done).length
  const totalSets = exs.reduce((n, e) => n + (e.status === 'no_hecho' ? 0 : e.plan.sets), 0)

  return (
    <>
      <PageHeader
        title={`Sesión ${session.templateCode ?? ''}`}
        sub={`${formatDate(session.date)} · ${totalDone}/${totalSets} series`}
        right={<Link to="/" className="btn btn-soft btn-sm">Salir</Link>}
      />
      <div className="mb-3 mx-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-sky-500 transition-all" style={{ width: `${totalSets ? (100 * totalDone) / totalSets : 0}%` }} />
      </div>
      <div className="space-y-3 px-4">
        {mains.map((m) => {
          const children = exs.filter((c) => c.pairedWithId === m.id)
          return (
            <ExerciseCard
              key={m.id} se={m} ex={exOf(m.exerciseId)} allExercises={exercises} nameOf={nameOf}
              sets={setsOf(m.id)} settings={settings} readOnly={readOnly}
              open={currentOpen === m.id} onToggle={() => setOpenId(currentOpen === m.id ? null : m.id)}
            >
              {children.map((c) => (
                <ExerciseCard
                  key={c.id} se={c} ex={exOf(c.exerciseId)} allExercises={exercises} nameOf={nameOf}
                  sets={setsOf(c.id)} settings={settings} readOnly={readOnly} nested
                  open={currentOpen === c.id} onToggle={() => setOpenId(currentOpen === c.id ? null : c.id)}
                />
              ))}
            </ExerciseCard>
          )
        })}
        <button className="btn btn-primary mt-4 w-full text-xl" onClick={() => nav(`/sesion/${id}/resumen`)}>
          {readOnly ? 'Ver resumen' : 'Terminar sesión'}
        </button>
      </div>
    </>
  )
}
