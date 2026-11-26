/**
 * Plan de la semana: qué decir hoy según el calendario de partidos y la carga de piernas ya
 * acumulada. Función PURA. De momento solo AVISA (no cambia series ni cargas): la modulación
 * llega en la siguiente parte.
 */
import type { Match, MatchImportance, MuscleGroup } from '../db/types'
import { daysBetween, formatDate, weekdayName } from './format'
import { addDays, weekStart } from './stats'

export type AdviceLevel = 'alto' | 'aviso' | 'info'
export interface Advice { level: AdviceLevel; text: string }

export interface WeekPlanInput {
  today: string
  matches: Pick<Match, 'date' | 'time' | 'rival' | 'importance' | 'deletedAt'>[]
  /** Series efectivas de piernas en la semana en curso (lunes a hoy). */
  legSetsThisWeek: number
  /** Objetivo semanal de series por grupo (ajuste de la app). */
  targetSetsPerGroup: number
  /** El usuario confirmó que esta semana no hay partido (así la semana admite más carga). */
  noMatchConfirmed?: boolean
}

export interface WeekPlan {
  nextMatch: { date: string; time: string; rival: string; importance: MatchImportance; daysTo: number } | null
  /** No hay ningún partido registrado de hoy al domingo: toca preguntar. */
  needsCheckIn: boolean
  /** Lunes de la semana en curso (clave para recordar que ya se respondió). */
  weekKey: string
  /** Hoy conviene evitar piernas pesadas. */
  avoidHeavyLegs: boolean
  /** Semana holgada (sin partido o partido fácil lejano): +1 serie en los principales. */
  volumeBoost: boolean
  /** Ya hay mucho volumen de piernas esta semana: no se suma más a piernas. */
  legsHigh: boolean
  advice: Advice[]
}

/** Días antes del partido en los que se evitan piernas pesadas, según su importancia. */
export const PROTECT_DAYS: Record<MatchImportance, number> = { facil: 1, normal: 2, importante: 3 }

const days = (n: number) => (n === 1 ? '1 día' : `${n} días`)

export function planWeek(input: WeekPlanInput): WeekPlan {
  const { today, legSetsThisWeek, targetSetsPerGroup } = input
  const weekKey = weekStart(today)
  const weekEnd = addDays(weekKey, 6)
  const upcoming = input.matches
    .filter((m) => !m.deletedAt && m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const first = upcoming[0]
  const next = first
    ? { date: first.date, time: first.time, rival: first.rival, importance: first.importance ?? 'normal', daysTo: daysBetween(today, first.date) }
    : null
  const needsCheckIn = !upcoming.some((m) => m.date <= weekEnd)

  const advice: Advice[] = []
  let avoidHeavyLegs = false
  let volumeBoost = false
  const legsHigh = legSetsThisWeek >= targetSetsPerGroup * 1.5

  if (next && next.daysTo <= 7) {
    const when = `${weekdayName(next.date)} ${formatDate(next.date)}${next.time ? ` a las ${next.time}` : ''}`
    const vs = next.rival ? ` vs ${next.rival}` : ''
    const window = PROTECT_DAYS[next.importance]
    const tag = next.importance === 'importante' ? ' importante' : next.importance === 'facil' ? ' fácil' : ''
    if (next.daysTo === 0) {
      avoidHeavyLegs = true
      advice.push({ level: 'alto', text: `Hoy hay partido${vs}${next.time ? ` (${next.time})` : ''}. No hagas fuerza de piernas hoy.` })
    } else if (next.daysTo <= window) {
      avoidHeavyLegs = true
      advice.push({
        level: 'alto',
        text: `Partido${tag}${vs} en ${days(next.daysTo)} (${when}). Hoy evita piernas pesadas: haz tren superior o descansa.`,
      })
    } else {
      const lastLegDay = addDays(next.date, -(window + 1))
      advice.push({
        level: 'info',
        text: `Partido${vs} en ${days(next.daysTo)} (${when}). Puedes cargar piernas hasta el ${weekdayName(lastLegDay)} ${formatDate(lastLegDay)}; después, tren superior.`,
      })
    }
    if (legsHigh) {
      advice.push({
        level: 'aviso',
        text: `Esta semana llevas ${legSetsThisWeek} series de piernas (objetivo ${targetSetsPerGroup}). Si juegas pronto, no sumes más piernas.`,
      })
    }
    if (next.importance === 'facil' && next.daysTo > window) {
      volumeBoost = true
      advice.push({ level: 'info', text: 'Partido fácil: la semana admite más volumen (+1 serie en los ejercicios principales).' })
    }
  } else if (next) {
    volumeBoost = true
    advice.push({ level: 'info', text: `Próximo partido en ${days(next.daysTo)}. Esta semana no hay partido: buena semana para cargar (+1 serie en los principales).` })
  } else if (input.noMatchConfirmed) {
    volumeBoost = true
    advice.push({ level: 'info', text: 'Sin partido esta semana: buena semana para cargar (+1 serie en los principales).' })
  } else {
    advice.push({ level: 'info', text: 'No hay partidos registrados. Añade el próximo en Semana para que ajuste el plan.' })
  }
  return { nextMatch: next, needsCheckIn, weekKey, avoidHeavyLegs, volumeBoost, legsHigh, advice }
}

// ---------- ajuste de la sesión ----------

export interface ItemInfo {
  id: string
  group: MuscleGroup
  role: 'principal' | 'accesorio'
  sets: number
  /** Se puede quitar cuando se llega cargado a un partido. */
  removableNearMatch: boolean
}

export interface Adjustment {
  itemId: string
  kind: 'quitar' | 'mas_series'
  /** Series nuevas (solo `mas_series`). */
  sets?: number
  reason: string
}

/** Tope de series de un ejercicio al sumar volumen. */
export const MAX_SETS = 5

/**
 * Qué cambiar en la sesión de hoy según la semana:
 *  - cerca de un partido: quita las piernas pesadas (principales y los accesorios marcados como quitables);
 *  - semana holgada: +1 serie en los principales (en piernas solo si aún no hay mucho volumen).
 * Nunca toca las cargas: eso lo decide la progresión.
 */
export function adjustSession(items: ItemInfo[], plan: Pick<WeekPlan, 'avoidHeavyLegs' | 'volumeBoost' | 'legsHigh'>): Adjustment[] {
  const out: Adjustment[] = []
  for (const it of items) {
    if (plan.avoidHeavyLegs) {
      if (it.group === 'Piernas' && (it.role === 'principal' || it.removableNearMatch)) {
        out.push({ itemId: it.id, kind: 'quitar', reason: 'Partido cerca: sin piernas pesadas' })
      }
    } else if (plan.volumeBoost && it.role === 'principal' && it.sets < MAX_SETS && !(it.group === 'Piernas' && plan.legsHigh)) {
      out.push({ itemId: it.id, kind: 'mas_series', sets: it.sets + 1, reason: 'Semana holgada: +1 serie' })
    }
  }
  return out
}
