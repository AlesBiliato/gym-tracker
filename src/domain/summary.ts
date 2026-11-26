/**
 * Resumen en texto (Markdown) para pegar en una conversación con Claude: la última sesión
 * con su comparación contra la vez anterior y el contexto reciente (frecuencia, volumen,
 * peso corporal, partidos). Función PURA: recibe los datos ya cargados.
 */
import type {
  BodyWeight, Exercise, Match, Session, SessionExercise, SetLog,
} from '../db/types'
import { MUSCLE_GROUPS } from '../db/types'
import { formatDate, formatKg, formatRest, weekdayName } from './format'
import {
  addDays, bodyWeightTrend, exerciseHistory, flattenSets, weeklyFrequency, weeklyVolume,
  type ExercisePoint, type FlatSet,
} from './stats'

export interface SummaryInput {
  exercises: Exercise[]
  sessions: Session[]
  sessionExercises: SessionExercise[]
  sets: SetLog[]
  bodyWeights: BodyWeight[]
  matches: Match[]
}

const live = <T extends { deletedAt?: string | null }>(xs: T[]): T[] => xs.filter((x) => !x.deletedAt)

/** Una serie: "80×8 RIR2", "30/25×8 RIR1 (fallo)". Con "~" si reps/RIR son estimados al importar. */
function fmtSet(s: Pick<SetLog, 'w' | 'l' | 'r' | 'reps' | 'repsL' | 'repsR' | 'rir' | 'failed' | 'estimated'>, unilateral: boolean): string {
  const load = unilateral ? `${formatKg(s.l)}/${formatKg(s.r)}` : formatKg(s.w)
  const reps = unilateral && (s.repsL != null || s.repsR != null) && s.repsL !== s.repsR
    ? `${s.repsL ?? '–'}/${s.repsR ?? '–'}` : s.reps != null ? String(s.reps) : '–'
  const est = s.estimated ? '~' : ''
  return `${load}×${reps}${s.rir != null ? ` RIR${s.rir}` : ''}${est}${s.failed ? ' (fallo)' : ''}`
}

function fmtPoint(p: ExercisePoint, unilateral: boolean): string {
  return `${formatDate(p.date)}: ${p.sets.map((s) => fmtSet(s, unilateral)).join(', ')}`
}

const planText = (p: SessionExercise['plan']): string => {
  const reps = p.repMin === p.repMax ? `${p.repMin}` : `${p.repMin}-${p.repMax}`
  const rest = p.restSecMax ? ` · descanso ${p.restSecMin === p.restSecMax ? formatRest(p.restSecMax) : `${formatRest(p.restSecMin)}-${formatRest(p.restSecMax)}`}` : ''
  return `${p.sets}×${reps} RIR objetivo ${p.targetRir}${rest}`
}

const minutes = (a: string, b?: string | null): number | null => {
  if (!b) return null
  const m = Math.round((Date.parse(b) - Date.parse(a)) / 60000)
  return Number.isFinite(m) && m > 0 ? m : null
}

export function buildClaudeSummary(data: SummaryInput, today: string, target = 3): string {
  const exercises = live(data.exercises)
  const exById = new Map(exercises.map((e) => [e.id, e]))
  const name = (id: string | null | undefined) => (id ? exById.get(id)?.name ?? '(ejercicio borrado)' : '–')
  const sessions = live(data.sessions).sort((a, b) => a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt))
  const out: string[] = []

  out.push(`# Resumen de entrenamiento (${formatDate(today)})`)
  out.push('Generado por la app gym-tracker. Series: `peso×reps RIRn`; unilateral: `izq/der`; `~` = dato estimado al importar. Pesos en kg.')

  const last = sessions.at(-1)
  if (!last) {
    out.push('\nTodavía no hay sesiones registradas.')
    return out.join('\n')
  }

  const flat: FlatSet[] = flattenSets(sessions, live(data.sessionExercises), live(data.sets))

  // ---- Última sesión ----
  const mins = minutes(last.startedAt, last.endedAt)
  out.push(`\n## Última sesión: ${weekdayName(last.date)} ${formatDate(last.date)}`)
  out.push(
    `- Plantilla ${last.templateCode ?? 'libre'} · modo ${last.mode} · ${last.status === 'cerrada' ? 'cerrada' : 'SIN CERRAR (en curso)'}` +
    `${mins ? ` · duración ${mins} min` : ''}${last.imported ? ' · importada' : ''}`,
  )
  if (last.notes.trim()) out.push(`- Notas de la sesión: ${last.notes.trim()}`)

  const lastExs = live(data.sessionExercises).filter((e) => e.sessionId === last.id).sort((a, b) => a.order - b.order)
  const setsByEx = new Map<string, SetLog[]>()
  for (const s of live(data.sets)) setsByEx.set(s.sessionExerciseId, [...(setsByEx.get(s.sessionExerciseId) ?? []), s])

  for (const se of lastExs) {
    const ex = exById.get(se.exerciseId)
    const uni = !!ex?.unilateral
    const sets = (setsByEx.get(se.id) ?? []).sort((a, b) => a.index - b.index)
    const done = sets.filter((s) => s.done)
    out.push(`\n### ${name(se.exerciseId)} — ${se.status}${ex ? ` (${ex.muscleGroup}, ${ex.role})` : ''}`)
    if (se.substitutedForExerciseId) out.push(`- Sustituye a: ${name(se.substitutedForExerciseId)} (no es comparable con el original)`)
    out.push(`- Plan: ${planText(se.plan)}${se.plan.notes ? ` · ${se.plan.notes}` : ''}`)
    if (se.suggestion) {
      const sg = se.suggestion
      out.push(`- Sugerencia de la app: ${sg.kind} (${sg.applied ? 'aplicada' : 'no aplicada'}) — ${sg.reason}${sg.warnings.length ? ` ⚠ ${sg.warnings.join('; ')}` : ''}`)
    }
    if (se.status === 'no_hecho') { if (se.obs.trim()) out.push(`- Obs.: ${se.obs.trim()}`); continue }
    out.push(`- Hecho (${done.length}/${sets.length} series): ${done.length ? done.map((s) => fmtSet(s, uni)).join(', ') : 'ninguna'}`)
    const prev = exerciseHistory(flat, se.exerciseId).filter((p) => p.sessionId !== last.id).at(-1)
    out.push(`- Vez anterior: ${prev ? fmtPoint(prev, uni) : 'sin historial previo de este ejercicio'}`)
    if (se.obs.trim()) out.push(`- Obs.: ${se.obs.trim()}`)
  }

  // ---- Sesiones recientes ----
  const recent = sessions.slice(-6, -1).reverse()
  if (recent.length) {
    out.push('\n## Sesiones anteriores')
    for (const s of recent) {
      const n = flat.filter((f) => f.sessionId === s.id).length
      out.push(`- ${weekdayName(s.date)} ${formatDate(s.date)} · plantilla ${s.templateCode ?? 'libre'} · modo ${s.mode} · ${n} series${s.notes.trim() ? ` · ${s.notes.trim()}` : ''}`)
    }
  }

  // ---- Frecuencia y volumen ----
  const freq = weeklyFrequency(sessions, today, 8, target)
  out.push(`\n## Frecuencia (objetivo ${target}/semana)`)
  out.push(`- Últimas 8 semanas (de antigua a actual): ${freq.weeks.map((w) => w.count).join(', ')} · media ${freq.avgPerWeek.toFixed(1)} · racha ${freq.streak} semanas`)

  const vol = weeklyVolume(flat, exercises, today, 4)
  out.push('\n## Series efectivas por grupo (RIR ≤ 4), últimas 4 semanas, de antigua a actual')
  for (const g of MUSCLE_GROUPS) out.push(`- ${g}: ${vol.map((w) => w.counts[g]).join(' · ')}`)

  // ---- Peso corporal ----
  const bw = bodyWeightTrend(data.bodyWeights)
  if (bw.length) {
    const l = bw.at(-1)!
    const ref = bw.filter((b) => b.date <= l.date).find((b) => b.date >= addDays(l.date, -28)) ?? bw[0]
    out.push(`\n## Peso corporal\n- Último: ${formatKg(l.kg)} kg (${formatDate(l.date)}) · media 7 días ${formatKg(Math.round(l.avg7 * 10) / 10)} kg · hace ~4 semanas: ${formatKg(ref.kg)} kg (${formatDate(ref.date)})`)
  }

  // ---- Partidos próximos ----
  const upcoming = live(data.matches).filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3)
  if (upcoming.length) {
    out.push('\n## Próximos partidos')
    for (const m of upcoming) out.push(`- ${weekdayName(m.date)} ${formatDate(m.date)} ${m.time} vs ${m.rival}${m.notes.trim() ? ` · ${m.notes.trim()}` : ''}`)
  }

  out.push('\n---\nAnaliza esta sesión: progresión frente a la vez anterior, calidad del esfuerzo (RIR real vs objetivo), volumen por grupo y qué ajustar en la próxima.')
  return out.join('\n')
}
