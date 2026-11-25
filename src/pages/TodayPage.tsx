import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { activeTemplate, getSettings, startSession } from '../db/repo'
import { daysBetween, formatDate, todayISO, weekdayName } from '../domain/format'
import { nextTemplateCode, orderItems, repsLabel } from '../domain/sessionPlan'
import { PageHeader } from '../components/ui'

const CODES = ['A', 'B', 'C'] as const

export default function TodayPage() {
  const nav = useNavigate()
  const today = todayISO()
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const [pick, setPick] = useState<'A' | 'B' | 'C' | null>(null)
  const [busy, setBusy] = useState(false)

  const suggested = sessions ? nextTemplateCode(sessions.filter((s) => !s.deletedAt)) : 'A'
  const code = pick ?? suggested
  const tpl = useLiveQuery(() => activeTemplate(code), [code])
  const items = useLiveQuery(
    async () => (tpl ? orderItems(await db.templateItems.where('templateId').equals(tpl.id).toArray()) : []),
    [tpl?.id],
  )

  if (!sessions || !exercises) return <PageHeader title="Hoy" />
  const live = sessions.find((s) => s.status === 'en_curso' && !s.deletedAt)
  const closed = sessions.filter((s) => s.status === 'cerrada' && !s.deletedAt).sort((a, b) => b.date.localeCompare(a.date))
  const last = closed[0]
  const gap = last ? daysBetween(last.date, today) : null
  const exName = (id: string) => exercises.find((e) => e.id === id)?.name ?? '?'

  const begin = async () => {
    setBusy(true)
    const id = await startSession(code, today)
    nav(`/sesion/${id}`)
  }

  return (
    <>
      <PageHeader title="Hoy" sub={`${weekdayName(today)}, ${formatDate(today)}`} />
      <div className="space-y-4 px-4">
        {live && (
          <div className="card border-l-4 border-sky-500">
            <p className="text-sm font-semibold uppercase text-sky-500">Sesión en curso</p>
            <p className="mb-3 text-xl font-bold">Sesión {live.templateCode} · {formatDate(live.date)}</p>
            <Link to={`/sesion/${live.id}`} className="btn btn-primary w-full">Continuar</Link>
          </div>
        )}

        {gap != null && gap > (settings?.readaptationAfterDays ?? 10) && (
          <div className="card bg-amber-50 ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-700">
            <p className="font-semibold">Llevas {gap} días sin entrenar</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Empieza con cargas algo más bajas. La sesión de readaptación automática llegará en la fase 4.</p>
          </div>
        )}

        {!live && (
          <div className="card space-y-4">
            <div>
              <p className="text-sm font-semibold uppercase text-slate-500">Te toca</p>
              <p className="text-2xl font-extrabold">Sesión {code}{tpl ? ` · ${tpl.name}` : ''}</p>
              {last && (
                <p className="text-sm text-slate-500">
                  Última: {last.templateCode ?? '–'} el {formatDate(last.date)} ({gap === 0 ? 'hoy' : `hace ${gap} d`})
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {CODES.map((c) => (
                <button key={c} onClick={() => setPick(c)} className={`chip flex-1 justify-center ${c === code ? 'chip-on' : ''}`}>
                  {c}{c === suggested ? ' ·  toca' : ''}
                </button>
              ))}
            </div>
            <button className="btn btn-primary w-full text-xl" onClick={begin} disabled={busy || !tpl}>
              Empezar sesión {code}
            </button>
          </div>
        )}

        {items && items.length > 0 && !live && (
          <div className="card">
            <p className="mb-2 font-semibold">Qué incluye</p>
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li key={it.id} className={`flex justify-between gap-2 ${it.pairedWithItemId ? 'pl-5 text-slate-500' : ''}`}>
                  <span>{it.pairedWithItemId ? '↳ ' : ''}{exName(it.exerciseId)}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">{it.sets}×{repsLabel(it)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {sessions.length === 0 && (
          <p className="text-center text-slate-500">Aún no hay sesiones. Importa tu historial desde <Link to="/mas" className="text-sky-500 underline">Más</Link>.</p>
        )}
      </div>
    </>
  )
}
