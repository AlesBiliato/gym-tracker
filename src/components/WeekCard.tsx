import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { confirmNoMatch, getSettings, weekPlanNow } from '../db/repo'
import type { Advice, WeekPlan } from '../domain/weekPlan'

/** Plan de la semana calculado con los datos locales (partidos, sesiones y series). Se actualiza solo. */
export function useWeekPlan(): WeekPlan | undefined {
  return useLiveQuery(() => weekPlanNow(), [])
}

const STYLE: Record<Advice['level'], string> = {
  alto: 'border-l-4 border-red-500',
  aviso: 'border-l-4 border-amber-500',
  info: 'border-l-4 border-sky-500',
}

/** Qué decir hoy: pregunta por el partido a principio de semana y avisa de la carga de piernas. */
export default function WeekCard() {
  const plan = useWeekPlan()
  const answered = useLiveQuery(async () => (await getSettings()).noMatchWeek, [])
  if (!plan) return null

  if (plan.needsCheckIn && answered !== plan.weekKey) {
    return (
      <div className="card space-y-3 border-l-4 border-violet-500">
        <div>
          <p className="font-bold">¿Tienes partido esta semana?</p>
          <p className="text-sm text-slate-500">Dime cuándo es y qué importancia tiene, y ajusto cuándo cargar piernas.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link to="/semana?nuevo=1" className="btn btn-primary">Añadir partido</Link>
          <button className="btn btn-soft" onClick={() => confirmNoMatch(plan.weekKey)}>Sin partido</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {plan.advice.map((a, i) => (
        <div key={i} className={`card ${STYLE[a.level]}`}>
          <p className="text-sm">{a.text}</p>
        </div>
      ))}
    </div>
  )
}
