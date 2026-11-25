/**
 * Progresión doble automática. Funciones PURAS: reciben lo hecho la última vez y
 * devuelven una SUGERENCIA de cargas para la próxima sesión. Nunca impone nada:
 * la interfaz la muestra y el usuario decide aplicarla o editarla.
 *
 * Reglas:
 *  - Sube solo si TODAS las series se hicieron (con repeticiones y RIR medidos), llegaron al tope
 *    del rango de repeticiones, sin fallo y con RIR ≥ mínimo (2). Las series estimadas (~) no cuentan.
 *  - Mantiene si hubo fallo, o RIR ≤ 1 en un ejercicio principal, o aún no se llega al tope.
 *  - Si se hizo MÁS peso del planificado: avisa y propone consolidar esa carga en más series
 *    antes de seguir subiendo (nunca sube además).
 */
import type { Exercise, LoadType, PlanSnapshot, SetTarget } from '../db/types'
import { targetForSet } from './sessionPlan'
import { formatKg } from './format'

export interface ProgressionSettings {
  incrementsKg: Record<LoadType, number>
  /** RIR mínimo en todas las series para poder subir. */
  minRirToProgress: number
  /** Salto de barra cuando fue claramente fácil (RIR medio ≥ 3). */
  barbellBigStepKg: number
}

export interface LastSet {
  index: number
  w?: number | null
  l?: number | null
  r?: number | null
  reps: number | null
  rir: number | null
  failed: boolean
  done: boolean
  /** Repeticiones/RIR no medidos (importados con las previstas). */
  estimated?: boolean
}

export interface ProgressionInput {
  exercise: Pick<Exercise, 'unilateral' | 'loadType' | 'role' | 'incrementKg' | 'excluded'>
  settings: ProgressionSettings
  /** El plan vigente en la plantilla (estructura de la próxima sesión). */
  current: Pick<PlanSnapshot, 'sets' | 'repMin' | 'repMax' | 'targets'>
  /** Última vez que se hizo ESE ejercicio (las variantes no se mezclan). */
  last: { date: string; plan: PlanSnapshot; sets: LastSet[] } | null
}

export type SuggestionKind = 'subir' | 'mantener' | 'consolidar' | 'sin_datos'

export interface Suggestion {
  kind: SuggestionKind
  /** Cargas propuestas, una por serie de la próxima sesión. */
  targets: SetTarget[]
  reason: string
  /** Avisos (p. ej. "hiciste más peso del planificado"). */
  warnings: string[]
  basisDate: string | null
  /** false si la propuesta coincide con lo que ya hay en la plantilla. */
  changes: boolean
}

type Side = 'w' | 'l' | 'r'

/** Redondea HACIA ABAJO al salto: al consolidar nunca se propone más que la media conseguida. */
const floorTo = (n: number, step: number) => (step > 0 ? Math.floor(n / step + 1e-9) * step : n)
const clean = (n: number) => Math.round(n * 100) / 100

export function baseIncrement(ex: Pick<Exercise, 'loadType' | 'incrementKg'>, s: ProgressionSettings): number {
  return ex.incrementKg ?? s.incrementsKg[ex.loadType] ?? 0
}

function stepFor(ex: ProgressionInput['exercise'], s: ProgressionSettings, avgRir: number | null): number {
  // El salto configurado en el ejercicio manda siempre.
  if (ex.incrementKg != null) return ex.incrementKg
  const base = s.incrementsKg[ex.loadType] ?? 0
  if (ex.loadType === 'barra' && avgRir != null && avgRir >= 3) return Math.max(base, s.barbellBigStepKg)
  return base
}

const sameTargets = (a: SetTarget[], b: SetTarget[], sides: Side[]) =>
  a.length === b.length && a.every((t, i) => sides.every((k) => (t[k] ?? null) === (b[i][k] ?? null)))

/** Etiqueta "serie 4" o "serie 2 izq." para los avisos. */
const where = (index: number, side: Side) => `serie ${index + 1}${side === 'l' ? ' izq.' : side === 'r' ? ' der.' : ''}`

export function suggestProgression(input: ProgressionInput): Suggestion {
  const { exercise, settings, current, last } = input
  const sides: Side[] = exercise.unilateral ? ['l', 'r'] : ['w']
  const basisDate = last?.date ?? null
  const result = (kind: SuggestionKind, targets: SetTarget[], reason: string, warnings: string[] = []): Suggestion => ({
    kind, targets, reason, warnings, basisDate, changes: !sameTargets(targets, current.targets, sides),
  })
  const none = (reason: string) => result('sin_datos', current.targets, reason)

  if (exercise.excluded) return none('Ejercicio excluido.')
  const done = (last?.sets ?? []).filter((s) => s.done).sort((a, b) => a.index - b.index)
  if (!last || done.length === 0) return none('Sin historial de este ejercicio.')

  const planAt = (i: number, side: Side) => targetForSet(last.plan, i)[side] ?? null
  const doneAt = (s: LastSet, side: Side) => s[side] ?? null

  // Cargas de la última vez por serie (lo hecho; si falta, lo planificado).
  const nLast = Math.max(last.plan.sets, ...done.map((s) => s.index + 1))
  const lastLoads: SetTarget[] = Array.from({ length: nLast }, (_, i) => {
    const s = done.find((x) => x.index === i)
    return Object.fromEntries(sides.map((k) => [k, (s ? doneAt(s, k) : null) ?? planAt(i, k)])) as SetTarget
  })
  const hasLoad = lastLoads.some((t) => sides.some((k) => t[k] != null))
  if (!hasLoad) return none('Sin peso registrado: no hay carga que ajustar.')

  /** Las cargas de la última vez adaptadas al nº de series de la próxima sesión. */
  const mapped = (loads: SetTarget[]): SetTarget[] =>
    Array.from({ length: current.sets }, (_, i) => ({ ...loads[Math.min(i, loads.length - 1)] }))

  // ---- 1) Más peso del planificado: avisar y consolidar (nunca subir además) ----
  const over: { index: number; side: Side; planned: number; done: number }[] = []
  for (const s of done) {
    for (const side of sides) {
      const planned = planAt(s.index, side)
      const d = doneAt(s, side)
      if (planned != null && d != null && d > planned) over.push({ index: s.index, side, planned, done: d })
    }
  }
  if (over.length > 0) {
    const step = baseIncrement(exercise, settings)
    const consolidated: SetTarget[] = lastLoads.map((t) => ({ ...t }))
    const heavyLoads: string[] = []
    for (const side of sides) {
      const planned = Array.from({ length: last.plan.sets }, (_, i) => planAt(i, side))
      const top = Math.max(...planned.filter((p): p is number => p != null))
      const heavy = planned.map((p, i) => (p === top ? i : -1)).filter((i) => i >= 0)
      const loads = heavy.map((i) => lastLoads[i]?.[side]).filter((x): x is number => x != null)
      // Las series pesadas se igualan en la media de lo hecho (redondeada hacia abajo al salto): la misma
      // carga repartida en todas las series pesadas, en vez de una sola serie más alta.
      const c = loads.length ? clean(floorTo(loads.reduce((a, b) => a + b, 0) / loads.length, step)) : top
      for (const i of heavy) if (consolidated[i]) consolidated[i][side] = c
      heavyLoads.push(`${side === 'l' ? 'izq. ' : side === 'r' ? 'der. ' : ''}${formatKg(c)} kg`)
    }
    const warnings = [
      `Hiciste más peso del planificado: ${over.map((o) => `${where(o.index, o.side)}: ${formatKg(o.done)} kg (plan ${formatKg(o.planned)})`).join('; ')}.`,
    ]
    return result(
      'consolidar', mapped(consolidated),
      `Consolida ${heavyLoads.join(' · ')} en las series pesadas antes de seguir subiendo.`, warnings,
    )
  }

  // ---- 2) Mantener o subir según lo MEDIDO ----
  const measured = done.filter((s) => !s.estimated && s.reps != null && s.rir != null)
  const isMain = exercise.role === 'principal'
  const hold = (reason: string) => result('mantener', mapped(lastLoads), reason)

  if (done.some((s) => s.failed)) return hold('Hubo fallo: mantén la carga.')
  if (isMain && measured.some((s) => (s.rir as number) < settings.minRirToProgress)) {
    return hold(`RIR ≤ ${settings.minRirToProgress - 1} en una serie: mantén la carga.`)
  }
  if (done.length < last.plan.sets) return hold(`La última vez quedó incompleta (${done.length}/${last.plan.sets} series).`)
  if (measured.length < done.length) {
    return none(`Solo ${measured.length} de ${done.length} series tienen repeticiones y RIR medidos: no decido la subida.`)
  }
  const repMax = last.plan.repMax || current.repMax
  if (!repMax) return none('Rango de repeticiones desconocido.')
  if (measured.some((s) => (s.reps as number) < repMax)) {
    return hold(`Aún no llegas a ${repMax} repeticiones en todas las series: mantén la carga y busca más repeticiones.`)
  }

  const avgRir = measured.reduce((a, s) => a + (s.rir as number), 0) / measured.length
  const step = stepFor(exercise, settings, avgRir)
  if (step <= 0) return none('Sin salto de carga configurado para este ejercicio.')
  const up = lastLoads.map((t) => Object.fromEntries(sides.map((k) => [k, t[k] == null ? null : clean((t[k] as number) + step)])) as SetTarget)
  const rirTxt = isMain ? ` con RIR ≥ ${settings.minRirToProgress}` : ''
  return result('subir', mapped(up), `Todas las series al tope (${repMax} reps)${rirTxt}: sube +${formatKg(step)} kg.`)
}
