import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { closeSession, deleteSession, setSessionNotes } from '../db/repo'
import { formatDate } from '../domain/format'
import { summarize } from '../domain/sessionPlan'
import { PageHeader } from '../components/ui'

export default function SummaryPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const session = useLiveQuery(() => db.sessions.get(id), [id])
  const exs = useLiveQuery(() => db.sessionExercises.where('sessionId').equals(id).sortBy('order'), [id])
  const sets = useLiveQuery(async () => {
    const ids = (await db.sessionExercises.where('sessionId').equals(id).primaryKeys()) as string[]
    return db.sets.where('sessionExerciseId').anyOf(ids).toArray()
  }, [id])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  if (!session || !exs || !sets || !exercises) return <PageHeader title="Resumen" />

  const name = (eid: string) => exercises.find((e) => e.id === eid)?.name ?? '?'
  const doneBy: Record<string, number> = {}
  for (const s of sets) if (s.done) doneBy[s.sessionExerciseId] = (doneBy[s.sessionExerciseId] ?? 0) + 1
  const isAcc = (eid: string) => exercises.find((e) => e.id === eid)?.role === 'accesorio'
  const sum = summarize(exs, doneBy, isAcc)
  const readOnly = session.status === 'cerrada'
  const partial = sum.done.filter((e) => (doneBy[e.id] ?? 0) < e.plan.sets || sets.some((s) => s.sessionExerciseId === e.id && s.failed))

  return (
    <>
      <PageHeader title="Resumen" sub={`Sesión ${session.templateCode ?? ''} · ${formatDate(session.date)}`} />
      <div className="space-y-4 px-4">
        {sum.skippedAccessories.length > 0 && (
          <div className="card bg-amber-50 ring-amber-400 dark:bg-amber-950/40 dark:ring-amber-700">
            <p className="mb-2 text-lg font-bold">⚠️ Accesorios sin hacer</p>
            <ul className="list-disc pl-5">{sum.skippedAccessories.map((e) => <li key={e.id}>{name(e.exerciseId)}</li>)}</ul>
          </div>
        )}
        {sum.notDone.filter((e) => !sum.skippedAccessories.includes(e)).length > 0 && (
          <div className="card">
            <p className="mb-2 font-bold">Sin hacer</p>
            <ul className="list-disc pl-5">
              {sum.notDone.filter((e) => !sum.skippedAccessories.includes(e)).map((e) => <li key={e.id}>{name(e.exerciseId)}</li>)}
            </ul>
          </div>
        )}
        {partial.length > 0 && (
          <div className="card">
            <p className="mb-2 font-bold">Incompletos o con fallo</p>
            <ul className="list-disc pl-5">
              {partial.map((e) => <li key={e.id}>{name(e.exerciseId)} ({doneBy[e.id] ?? 0}/{e.plan.sets})</li>)}
            </ul>
          </div>
        )}
        <div className="card">
          <p className="font-bold">Hecho</p>
          <p className="text-slate-500">{sum.done.length} de {exs.length} ejercicios · {Object.values(doneBy).reduce((a, b) => a + b, 0)} series</p>
        </div>
        {sum.notDone.length === 0 && partial.length === 0 && <p className="text-center text-xl">🎉 Sesión completa</p>}

        <div>
          <span className="label">Observaciones de la sesión</span>
          <textarea
            key={session.id + session.notes}
            defaultValue={session.notes}
            onBlur={(e) => e.target.value !== session.notes && setSessionNotes(id, e.target.value)}
            className="input py-3" rows={3} placeholder="Cómo ha ido, sensaciones, molestias…"
          />
        </div>

        {!readOnly ? (
          <div className="grid gap-2">
            <button className="btn btn-primary text-xl" onClick={async () => { await closeSession(id); nav('/') }}>Cerrar y guardar sesión</button>
            <Link to={`/sesion/${id}`} className="btn btn-soft">Volver a la sesión</Link>
            <button className="btn btn-danger" onClick={async () => { if (confirm('¿Descartar esta sesión y todo lo registrado?')) { await deleteSession(id); nav('/') } }}>Descartar sesión</button>
          </div>
        ) : (
          <Link to="/progreso" className="btn btn-soft w-full">Volver al historial</Link>
        )}
      </div>
    </>
  )
}
