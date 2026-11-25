import type { ExerciseStatus, PlanSnapshot, Session, SessionExercise, SetTarget, TemplateItem } from '../db/types'

type Code = 'A' | 'B' | 'C'
const ORDER: Code[] = ['A', 'B', 'C']

/**
 * Qué sesión toca: la siguiente en la rotación A→B→C tras la última cerrada con
 * plantilla conocida. NO acumula sesiones perdidas: si te saltas la B, la
 * siguiente es la C, no "B + C".
 */
export function nextTemplateCode(sessions: Pick<Session, 'status' | 'templateCode' | 'date'>[]): Code {
  const last = sessions
    .filter((s) => s.status === 'cerrada' && s.templateCode)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!last?.templateCode) return 'A'
  return ORDER[(ORDER.indexOf(last.templateCode) + 1) % ORDER.length]
}

export const planFromItem = (it: TemplateItem): PlanSnapshot => ({
  sets: it.sets, repMin: it.repMin, repMax: it.repMax, targets: it.targets.map((t) => ({ ...t })),
  restSecMin: it.restSecMin, restSecMax: it.restSecMax, targetRir: it.targetRir, notes: it.notes, perSide: it.perSide,
})

/** Objetivo de la serie i; si hay menos objetivos que series, repite el último. */
export function targetForSet(plan: PlanSnapshot, i: number): SetTarget {
  if (plan.targets.length === 0) return {}
  return plan.targets[Math.min(i, plan.targets.length - 1)]
}

/** Texto de reps: "6", "8–10" o "8 por lado". */
export function repsLabel(plan: Pick<PlanSnapshot, 'repMin' | 'repMax' | 'perSide'>): string {
  const r = plan.repMin === plan.repMax ? `${plan.repMin}` : `${plan.repMin}–${plan.repMax}`
  return plan.perSide ? `${r} por lado` : r
}

/** Ordena items de plantilla: cada principal seguido de sus emparejados. */
export function orderItems<T extends { id: string; order: number; pairedWithItemId: string | null }>(items: T[]): T[] {
  const mains = items.filter((i) => !i.pairedWithItemId).sort((a, b) => a.order - b.order)
  const out: T[] = []
  for (const m of mains) {
    out.push(m)
    out.push(...items.filter((i) => i.pairedWithItemId === m.id).sort((a, b) => a.order - b.order))
  }
  // huérfanos (principal borrado): al final
  for (const i of items) if (!out.includes(i)) out.push(i)
  return out
}

export interface SessionSummary {
  done: SessionExercise[]
  notDone: SessionExercise[]
  /** Accesorios sin hacer (los que tiendes a saltarte): se resaltan. */
  skippedAccessories: SessionExercise[]
}

export function summarize(
  exs: SessionExercise[],
  setsDoneBy: Record<string, number>,
  isAccessory: (exerciseId: string) => boolean,
): SessionSummary {
  const notDone = exs.filter((e) => e.status === 'no_hecho' || ((e.status === 'pendiente' || e.status === 'sustituido') && !(setsDoneBy[e.id] > 0)))
  return {
    done: exs.filter((e) => !notDone.includes(e)),
    notDone,
    skippedAccessories: notDone.filter((e) => isAccessory(e.exerciseId) || e.pairedWithId != null),
  }
}

/**
 * Estado de un ejercicio mientras la sesión está abierta. Con series pendientes es
 * "en_curso" (no "parcial"). "no_hecho" lo marca el usuario y no se pisa.
 */
export function deriveStatus(
  current: ExerciseStatus,
  doneSets: number,
  plannedSets: number,
  substituted: boolean,
): ExerciseStatus {
  if (current === 'no_hecho') return 'no_hecho'
  if (substituted) return 'sustituido'
  if (doneSets === 0) return 'pendiente'
  return doneSets < plannedSets ? 'en_curso' : 'hecho'
}

/** Al cerrar la sesión: sin series -> no hecho; con series sin completar -> parcial. */
export function statusOnClose(current: ExerciseStatus, doneSets: number, plannedSets: number): ExerciseStatus {
  if (current === 'sustituido' && doneSets === 0) return 'no_hecho'
  if (current === 'pendiente' || current === 'en_curso') {
    if (doneSets === 0) return 'no_hecho'
    return doneSets < plannedSets ? 'parcial' : 'hecho'
  }
  return current
}

// ---------- Serie rápida (✓) ----------

export interface LastSetRef {
  index: number
  w?: number | null
  l?: number | null
  r?: number | null
  reps: number | null
  done?: boolean
  /** Repeticiones previstas, no medidas (importadas): no cuentan como "lo que hice". */
  estimated?: boolean
}

export interface QuickValues {
  w: number | null
  l: number | null
  r: number | null
  reps: number
  /** "No indicado": solo cuenta como RIR medido si se elige con los botones o en el editor. */
  rir: null
  failed: false
}

/**
 * Repeticiones de la serie rápida: lo que hice la última vez en ESA serie (si se midió);
 * si no hay, el máximo del rango. Con un rango fijo (6–6) es simplemente ese valor.
 */
export function quickReps(plan: Pick<PlanSnapshot, 'repMin' | 'repMax'>, index: number, last: LastSetRef[] | null | undefined): number {
  const prev = last?.find((s) => s.index === index && s.done !== false)
  if (prev && prev.reps != null && prev.reps > 0 && !prev.estimated) return prev.reps
  return plan.repMax || plan.repMin || 1
}

/** Valores con los que se guarda una serie al pulsar ✓: carga del plan (o de la última vez si falta) y RIR sin indicar. */
export function quickSet(
  plan: PlanSnapshot, index: number, last: LastSetRef[] | null | undefined, unilateral: boolean,
): QuickValues {
  const t = targetForSet(plan, index)
  const prev = last ? (last.find((s) => s.index === index) ?? last[last.length - 1]) : undefined
  return {
    w: t.w ?? (unilateral ? null : prev?.w ?? null),
    l: t.l ?? (unilateral ? prev?.l ?? null : null),
    r: t.r ?? (unilateral ? prev?.r ?? null : null),
    reps: quickReps(plan, index, last),
    rir: null,
    failed: false,
  }
}

/** Botones de repeticiones para corregir: del mínimo del rango −2 al máximo +2 (siempre incluye el valor actual). */
export function repsOptions(plan: Pick<PlanSnapshot, 'repMin' | 'repMax'>, current?: number | null): number[] {
  const hi = (plan.repMax || plan.repMin || current || 8) + 2
  const lo = Math.max(1, (plan.repMin || plan.repMax || current || 8) - 2)
  const list = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  if (current != null && current > 0 && !list.includes(current)) list.push(current)
  return list.sort((a, b) => a - b)
}

/** Botones de RIR: 0, 1, 2, 3 y 4+ (el último guarda 4). */
export const RIR_OPTIONS = [0, 1, 2, 3, 4] as const
