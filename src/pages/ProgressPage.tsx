import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { deleteBodyWeight, getSettings, saveBodyWeight } from '../db/repo'
import { formatDate, formatKg, todayISO, weekdayName } from '../domain/format'
import {
  bodyWeightTrend, exerciseHistory, flattenSets, personalBests, shortGroups, weeklyFrequency, weeklyVolume,
  type FlatSet, type Mark,
} from '../domain/stats'
import { MUSCLE_GROUPS, type Exercise, type SetLog } from '../db/types'
import { NumField, PageHeader } from '../components/ui'

const MaxWeightChart = lazy(() => import('../components/charts').then((m) => ({ default: m.MaxWeightChart })))
const VolumeChart = lazy(() => import('../components/charts').then((m) => ({ default: m.VolumeChart })))
const FrequencyChart = lazy(() => import('../components/charts').then((m) => ({ default: m.FrequencyChart })))
const WeightChart = lazy(() => import('../components/charts').then((m) => ({ default: m.WeightChart })))

const TABS = ['Sesiones', 'Ejercicios', 'Semana', 'Peso'] as const
type Tab = (typeof TABS)[number]

const Loading = () => <div className="flex h-48 items-center justify-center text-slate-500">Cargando gráfica…</div>
const Chart = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>

export default function ProgressPage() {
  const [tab, setTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('progressTab') as Tab) || 'Sesiones' } catch { return 'Sesiones' }
  })
  const choose = (t: Tab) => {
    setTab(t)
    try { localStorage.setItem('progressTab', t) } catch { /* ignore */ }
  }
  return (
    <>
      <PageHeader title="Progreso" />
      <div className="px-4">
        <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-slate-200 p-1 dark:bg-slate-800" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => choose(t)}
              className={`min-h-11 rounded-xl text-sm font-semibold ${tab === t ? 'bg-white shadow dark:bg-slate-700' : 'text-slate-500 dark:text-slate-400'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'Sesiones' && <SessionsTab />}
        {tab === 'Ejercicios' && <ExercisesTab />}
        {tab === 'Semana' && <WeekTab />}
        {tab === 'Peso' && <WeightTab />}
      </div>
    </>
  )
}

function useData() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const exs = useLiveQuery(() => db.sessionExercises.toArray(), [])
  const sets = useLiveQuery(() => db.sets.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const flat = useMemo(() => (sessions && exs && sets ? flattenSets(sessions, exs, sets) : null), [sessions, exs, sets])
  return { sessions, exs, sets, exercises, flat }
}

// ---------------- Sesiones (listado cronológico) ----------------

function SessionsTab() {
  const { sessions, exs, sets, exercises } = useData()
  const [open, setOpen] = useState<string | null>(null)
  if (!sessions || !exs || !sets || !exercises) return null
  const list = sessions.filter((s) => !s.deletedAt).sort((a, b) => b.date.localeCompare(a.date))
  const fmt = (s: SetLog, uni: boolean) =>
    `${uni ? `${formatKg(s.l)}/${formatKg(s.r)}` : formatKg(s.w)}×${s.reps ?? '–'}${s.rir != null ? ` (${s.rir})` : ''}${s.failed ? '✗' : ''}`

  if (list.length === 0) {
    return <p className="text-center text-slate-500">Sin sesiones todavía. Importa tu historial desde <Link to="/mas" className="text-sky-500 underline">Más</Link>.</p>
  }
  return (
    <div className="space-y-3">
      {list.map((s) => {
        const rows = exs.filter((e) => e.sessionId === s.id).sort((a, b) => a.order - b.order)
        const isOpen = open === s.id
        return (
          <div key={s.id} className="card !p-0 overflow-hidden">
            <button className="flex min-h-16 w-full items-center justify-between p-4 text-left" onClick={() => setOpen(isOpen ? null : s.id)}>
              <span>
                <span className="block text-lg font-bold">{formatDate(s.date)} · {weekdayName(s.date)}</span>
                <span className="text-sm text-slate-500">{s.templateCode ? `Sesión ${s.templateCode} · ` : ''}{rows.length} ejercicios{s.status === 'en_curso' ? ' · en curso' : ''}</span>
              </span>
              <span className="text-slate-400">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
                {s.notes && <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">{s.notes}</p>}
                {rows.map((e) => {
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
  )
}

// ---------------- Ejercicios ----------------

function ExercisesTab() {
  const { flat, exercises } = useData()
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const summary = useMemo(() => {
    if (!flat || !exercises) return []
    return exercises
      .map((e) => {
        const dates = [...new Set(flat.filter((s) => s.exerciseId === e.id).map((s) => s.sessionId + s.date))]
        const last = flat.filter((s) => s.exerciseId === e.id).map((s) => s.date).sort().at(-1)
        return { e, n: dates.length, last }
      })
      .filter((x) => x.n > 0)
      .sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''))
  }, [flat, exercises])
  if (!flat || !exercises) return null

  const sel = exercises.find((e) => e.id === selId)
  if (sel) return <ExerciseDetail ex={sel} flat={flat} onBack={() => setSelId(null)} />

  const shown = summary.filter((x) => x.e.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="space-y-3">
      <input className="input" placeholder="Buscar ejercicio…" value={q} onChange={(e) => setQ(e.target.value)} />
      {summary.length === 0 && <p className="text-center text-slate-500">Todavía no hay series registradas.</p>}
      {shown.map(({ e, n, last }) => (
        <button key={e.id} onClick={() => setSelId(e.id)} className="card flex w-full items-center justify-between text-left">
          <span>
            <span className="block font-semibold">{e.name}</span>
            <span className="text-sm text-slate-500">{n} {n === 1 ? 'sesión' : 'sesiones'} · última {last ? formatDate(last) : '–'}</span>
          </span>
          <span className="text-slate-400">›</span>
        </button>
      ))}
    </div>
  )
}

const repsText = (s: { reps: number | null; estimated: boolean }) => (s.reps == null ? '–' : `${s.estimated ? '~' : ''}${s.reps}`)
const markText = (m: Mark | null) => (m ? `${formatKg(m.kg)} kg${m.reps != null ? ` × ${m.estimated ? '~' : ''}${m.reps}` : ''}` : '–')

function ExerciseDetail({ ex, flat, onBack }: { ex: Exercise; flat: FlatSet[]; onBack: () => void }) {
  const history = useMemo(() => exerciseHistory(flat, ex.id), [flat, ex.id])
  const pb = useMemo(() => personalBests(history), [history])
  const hasWeight = history.some((h) => h.maxW != null || h.maxL != null || h.maxR != null)
  const rows = [...history].reverse()
  return (
    <div className="space-y-4">
      <button className="btn btn-soft btn-sm" onClick={onBack}>← Ejercicios</button>
      <div>
        <h2 className="text-2xl font-extrabold">{ex.name}</h2>
        <p className="text-sm text-slate-500">{ex.loadType}{ex.unilateral ? ' · unilateral' : ''} · {history.length} {history.length === 1 ? 'sesión' : 'sesiones'}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ex.unilateral ? (
          <>
            <Stat label="Mejor izquierda" value={markText(pb.l)} sub={pb.l ? formatDate(pb.l.date) : ''} />
            <Stat label="Mejor derecha" value={markText(pb.r)} sub={pb.r ? formatDate(pb.r.date) : ''} />
          </>
        ) : (
          <Stat label="Mejor marca" value={markText(pb.w)} sub={pb.w ? formatDate(pb.w.date) : ''} />
        )}
        <Stat label="Mayor volumen" value={pb.volume ? `${formatKg(pb.volume.value)} kg` : '–'} sub={pb.volume ? formatDate(pb.volume.date) : ''} />
      </div>

      {hasWeight && history.length > 1 ? (
        <>
          <Section title="Peso máximo por sesión (kg)"><Chart><MaxWeightChart data={history} unilateral={ex.unilateral} /></Chart></Section>
          <Section title="Volumen por sesión (kg × repeticiones)"><Chart><VolumeChart data={history} /></Chart></Section>
        </>
      ) : (
        <p className="card text-sm text-slate-500">
          {hasWeight ? 'Hacen falta al menos dos sesiones para dibujar la evolución.' : 'Este ejercicio no tiene peso registrado, así que no hay gráfica de carga.'}
        </p>
      )}

      <Section title="Historial">
        <div className="space-y-2">
          {rows.map((h) => (
            <div key={h.sessionId} className="card !p-3">
              <p className="font-semibold">{formatDate(h.date)}</p>
              <p className="text-sm tabular-nums text-slate-500">
                {h.sets.map((s) => `${ex.unilateral ? `${formatKg(s.l)}/${formatKg(s.r)}` : formatKg(s.w)}×${repsText(s)}${s.rir != null ? ` (${s.rir})` : ''}${s.failed ? '✗' : ''}`).join('  ')}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Formato: peso × repeticiones (RIR). « ~ » = repeticiones previstas, no medidas. « ✗ » = fallo.</p>
      </Section>
    </div>
  )
}

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="card !p-3">
    <p className="text-sm text-slate-500">{label}</p>
    <p className="text-xl font-extrabold tabular-nums">{value}</p>
    {sub && <p className="text-xs text-slate-500">{sub}</p>}
  </div>
)
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section><h3 className="mb-2 font-bold">{title}</h3>{children}</section>
)

// ---------------- Semana: frecuencia y volumen ----------------

function WeekTab() {
  const { sessions, flat, exercises } = useData()
  const settings = useLiveQuery(() => getSettings(), [])
  const today = todayISO()
  const target = 3
  const goal = settings?.targetSetsPerGroup ?? 10
  const freq = useMemo(() => (sessions ? weeklyFrequency(sessions, today, 8, target) : null), [sessions, today])
  const vol = useMemo(() => (flat && exercises ? weeklyVolume(flat, exercises, today, 4) : null), [flat, exercises, today])
  if (!freq || !vol) return null

  const current = vol[vol.length - 1].counts
  const prev = vol.slice(0, -1)
  const short = shortGroups(current, goal)
  return (
    <div className="space-y-5">
      <Section title="Frecuencia: sesiones por semana">
        <div className="mb-2 grid grid-cols-3 gap-3">
          <Stat label="Media 8 sem." value={freq.avgPerWeek.toLocaleString('es-ES', { maximumFractionDigits: 1 })} sub={`objetivo ${target}`} />
          <Stat label="Racha" value={`${freq.streak}`} sub={freq.streak === 1 ? 'semana ≥ ' + target : 'semanas ≥ ' + target} />
          <Stat label="Cumplidas" value={`${freq.weeksOnTarget}/8`} sub="semanas" />
        </div>
        <Chart><FrequencyChart freq={freq} target={target} /></Chart>
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-medium">Ver datos</summary>
          <table className="mt-2 w-full tabular-nums">
            <tbody>{freq.weeks.map((w) => (
              <tr key={w.weekStart}><td className="py-1">Semana del {formatDate(w.weekStart)}{w.current ? ' (en curso)' : ''}</td><td className="text-right font-semibold">{w.count}</td></tr>
            ))}</tbody>
          </table>
        </details>
      </Section>

      <Section title={`Series efectivas esta semana (objetivo ${goal} por grupo)`}>
        <div className="card space-y-3">
          {MUSCLE_GROUPS.map((g) => {
            const n = current[g]
            const avg = prev.reduce((a, w) => a + w.counts[g], 0) / prev.length
            const missing = goal - n
            return (
              <div key={g}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="font-medium">{g}</span>
                  <span className="text-sm tabular-nums">
                    <b>{n}</b>/{goal}
                    <span className="ml-2 text-slate-500">{missing > 0 ? `faltan ${missing}` : '✓ objetivo'}</span>
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="img" aria-label={`${g}: ${n} de ${goal} series`}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (100 * n) / goal)}%`, background: 'var(--series-1)', minWidth: n > 0 ? 6 : 0 }} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">Media de las 3 semanas anteriores: {avg.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</p>
              </div>
            )
          })}
        </div>
        {short.length > 0 && (
          <p className="mt-2 text-sm text-slate-500">
            Más cortos esta semana: {short.slice(0, 3).map((s) => `${s.group} (−${s.missing})`).join(', ')}.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">Serie efectiva = hecha con RIR ≤ 4 (o sin RIR). Una serie unilateral cuenta una vez. Semanas de lunes a domingo.</p>
      </Section>
    </div>
  )
}

// ---------------- Peso corporal ----------------

function WeightTab() {
  const entries = useLiveQuery(() => db.bodyWeights.toArray(), [])
  const [date, setDate] = useState(todayISO())
  const [kg, setKg] = useState<number | null>(null)
  const points = useMemo(() => (entries ? bodyWeightTrend(entries) : []), [entries])
  if (!entries) return null
  const last = points.at(-1)
  const shownKg = kg ?? last?.kg ?? null

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="font-bold">Registrar peso</p>
        <div>
          <span className="label">Fecha</span>
          <input type="date" className="input" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <NumField label="Peso (kg)" value={shownKg} onChange={setKg} step={0.1} unit="kg" />
        <button className="btn btn-primary w-full" disabled={shownKg == null || shownKg <= 0}
          onClick={async () => { await saveBodyWeight(date, shownKg!); setKg(null) }}>
          Guardar
        </button>
      </div>

      {last && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Última medida" value={`${formatKg(last.kg)} kg`} sub={formatDate(last.date)} />
          <Stat label="Media 7 días" value={`${formatKg(Math.round(last.avg7 * 100) / 100)} kg`} sub="hasta la última medida" />
        </div>
      )}

      {points.length > 1 ? (
        <Section title="Tendencia"><Chart><WeightChart points={points} /></Chart></Section>
      ) : (
        <p className="card text-sm text-slate-500">Con dos o más medidas aparece la gráfica de tendencia.</p>
      )}

      {points.length > 0 && (
        <Section title="Medidas">
          <div className="space-y-2">
            {[...entries].filter((e) => !e.deletedAt).sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
              <div key={e.id} className="card flex items-center justify-between !p-3">
                <span>
                  <span className="block font-semibold tabular-nums">{formatKg(e.kg)} kg</span>
                  <span className="text-sm text-slate-500">{formatDate(e.date)}{e.note ? ` · ${e.note}` : ''}</span>
                </span>
                <button className="btn btn-soft btn-sm" aria-label={`Borrar medida del ${formatDate(e.date)}`}
                  onClick={async () => { if (confirm(`¿Borrar la medida del ${formatDate(e.date)}?`)) await deleteBodyWeight(e.id) }}>
                  Borrar
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
