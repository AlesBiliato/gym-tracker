/**
 * Estadísticas de progreso. Funciones PURAS: reciben datos ya cargados y devuelven
 * estructuras listas para pintar. Las semanas empiezan el lunes.
 */
import type {
  BodyWeight, Exercise, MuscleGroup, Session, SessionExercise, SetLog,
} from '../db/types'
import { MUSCLE_GROUPS } from '../db/types'

export interface FlatSet {
  date: string
  sessionId: string
  exerciseId: string
  index: number
  w: number | null
  l: number | null
  r: number | null
  reps: number | null
  rir: number | null
  failed: boolean
  /** Repeticiones/RIR no medidos (importados con las previstas). */
  estimated: boolean
}

/** Series hechas de sesiones cerradas, ejercicios no omitidos. Cada serie lleva su ejercicio REAL (el sustituto, si lo hubo). */
export function flattenSets(sessions: Session[], exs: SessionExercise[], sets: SetLog[]): FlatSet[] {
  const sessionById = new Map(sessions.filter((s) => s.status === 'cerrada' && !s.deletedAt).map((s) => [s.id, s]))
  const seById = new Map(exs.filter((e) => !e.deletedAt && e.status !== 'no_hecho').map((e) => [e.id, e]))
  const out: FlatSet[] = []
  for (const st of sets) {
    if (!st.done || st.deletedAt) continue
    const se = seById.get(st.sessionExerciseId)
    const s = se && sessionById.get(se.sessionId)
    if (!se || !s) continue
    out.push({
      date: s.date, sessionId: s.id, exerciseId: se.exerciseId, index: st.index,
      w: st.w ?? null, l: st.l ?? null, r: st.r ?? null, reps: st.reps, rir: st.rir,
      failed: st.failed, estimated: !!st.estimated,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)
}

// ---------- fechas ----------

const toUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number): string => fromUTC(toUTC(iso) + n * 86400000)

/** Lunes de la semana de `iso`. */
export function weekStart(iso: string): string {
  const dow = new Date(toUTC(iso)).getUTCDay() // 0 domingo
  return addDays(iso, -((dow + 6) % 7))
}

// ---------- historial por ejercicio ----------

export interface ExercisePoint {
  date: string
  sessionId: string
  sets: FlatSet[]
  /** Peso máximo (bilateral). */
  maxW: number | null
  /** Peso máximo por lado (unilateral). */
  maxL: number | null
  maxR: number | null
  /** Volumen en kg (peso × repeticiones; en unilateral suma ambos lados). */
  volume: number
  totalReps: number
}

const maxOf = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? Math.max(...v) : null
}

/** Historial de UN ejercicio. Las variantes son ejercicios distintos y no se mezclan. */
export function exerciseHistory(flat: FlatSet[], exerciseId: string): ExercisePoint[] {
  const bySession = new Map<string, FlatSet[]>()
  for (const s of flat) if (s.exerciseId === exerciseId) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s])
  return [...bySession.values()]
    .map((sets) => ({
      date: sets[0].date,
      sessionId: sets[0].sessionId,
      sets,
      maxW: maxOf(sets.map((s) => s.w)),
      maxL: maxOf(sets.map((s) => s.l)),
      maxR: maxOf(sets.map((s) => s.r)),
      volume: sets.reduce((n, s) => n + ((s.w ?? 0) + (s.l ?? 0) + (s.r ?? 0)) * (s.reps ?? 0), 0),
      totalReps: sets.reduce((n, s) => n + (s.reps ?? 0), 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface Mark { kg: number; reps: number | null; date: string; estimated: boolean }
export interface PersonalBests {
  w: Mark | null
  l: Mark | null
  r: Mark | null
  volume: { value: number; date: string } | null
}

function bestBy(sets: FlatSet[], pick: (s: FlatSet) => number | null): Mark | null {
  let best: Mark | null = null
  for (const s of sets) {
    const kg = pick(s)
    if (kg == null) continue
    const cand: Mark = { kg, reps: s.reps, date: s.date, estimated: s.estimated }
    // más peso; a igual peso, más repeticiones; a igualdad, la medida antes que la estimada, y después la más antigua
    const better = !best || kg > best.kg
      || (kg === best.kg && (s.reps ?? 0) > (best.reps ?? 0))
      || (kg === best.kg && (s.reps ?? 0) === (best.reps ?? 0) && best.estimated && !s.estimated)
    if (better) best = cand
  }
  return best
}

export function personalBests(history: ExercisePoint[]): PersonalBests {
  const sets = history.flatMap((h) => h.sets)
  const vol = history.reduce<{ value: number; date: string } | null>(
    (b, h) => (h.volume > 0 && (!b || h.volume > b.value) ? { value: h.volume, date: h.date } : b), null)
  return { w: bestBy(sets, (s) => s.w), l: bestBy(sets, (s) => s.l), r: bestBy(sets, (s) => s.r), volume: vol }
}

// ---------- volumen semanal por grupo muscular ----------

/** Serie efectiva: hecha y con RIR conocido ≤ 4 (o sin RIR). Una serie unilateral cuenta una vez. */
export const isEffective = (s: FlatSet): boolean => s.rir == null || s.rir <= 4

export type GroupCounts = Record<MuscleGroup, number>
const emptyCounts = (): GroupCounts => Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as GroupCounts

export interface WeekVolume { weekStart: string; counts: GroupCounts }

/** Series efectivas por grupo en las últimas `weeks` semanas (la actual incluida), de la más antigua a la actual. */
export function weeklyVolume(flat: FlatSet[], exercises: Pick<Exercise, 'id' | 'muscleGroup'>[], today: string, weeks = 4): WeekVolume[] {
  const group = new Map(exercises.map((e) => [e.id, e.muscleGroup]))
  const current = weekStart(today)
  const result: WeekVolume[] = Array.from({ length: weeks }, (_, i) => ({ weekStart: addDays(current, -7 * (weeks - 1 - i)), counts: emptyCounts() }))
  const index = new Map(result.map((w) => [w.weekStart, w]))
  for (const s of flat) {
    if (!isEffective(s)) continue
    const g = group.get(s.exerciseId)
    const w = index.get(weekStart(s.date))
    if (g && w) w.counts[g]++
  }
  return result
}

/** Grupos por debajo del objetivo, del más corto al menos corto. */
export function shortGroups(counts: GroupCounts, target: number): { group: MuscleGroup; missing: number }[] {
  return MUSCLE_GROUPS.map((group) => ({ group, missing: target - counts[group] }))
    .filter((g) => g.missing > 0)
    .sort((a, b) => b.missing - a.missing)
}

// ---------- frecuencia y racha ----------

export interface Frequency {
  weeks: { weekStart: string; count: number; current: boolean }[]
  avgPerWeek: number
  /** Semanas seguidas alcanzando el objetivo (la semana en curso cuenta solo si ya lo alcanzó). */
  streak: number
  weeksOnTarget: number
}

export function weeklyFrequency(sessions: Pick<Session, 'date' | 'status' | 'deletedAt'>[], today: string, weeks = 8, target = 3): Frequency {
  const counts = new Map<string, number>()
  for (const s of sessions) {
    if (s.status !== 'cerrada' || s.deletedAt) continue
    const w = weekStart(s.date)
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  const current = weekStart(today)
  const list = Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(current, -7 * (weeks - 1 - i))
    return { weekStart: ws, count: counts.get(ws) ?? 0, current: ws === current }
  })
  let streak = 0
  if ((counts.get(current) ?? 0) >= target) streak++
  for (let i = 1; i < 520; i++) {
    if ((counts.get(addDays(current, -7 * i)) ?? 0) >= target) streak++
    else break
  }
  return {
    weeks: list,
    avgPerWeek: list.reduce((n, w) => n + w.count, 0) / weeks,
    streak,
    weeksOnTarget: list.filter((w) => w.count >= target).length,
  }
}

// ---------- peso corporal ----------

export interface WeightPoint { date: string; kg: number; avg7: number }

/** Media móvil de 7 días naturales (ventana [d−6, d]). Sin IMC ni "peso ideal". */
export function bodyWeightTrend(entries: Pick<BodyWeight, 'date' | 'kg' | 'deletedAt'>[]): WeightPoint[] {
  const sorted = entries.filter((e) => !e.deletedAt).sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((e) => {
    const from = addDays(e.date, -6)
    const win = sorted.filter((x) => x.date >= from && x.date <= e.date)
    return { date: e.date, kg: e.kg, avg7: win.reduce((n, x) => n + x.kg, 0) / win.length }
  })
}
