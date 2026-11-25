import type { PlanSnapshot, Session, SessionExercise, SetTarget, TemplateItem } from '../db/types'

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
  const notDone = exs.filter((e) => e.status === 'no_hecho' || (e.status === 'pendiente' && !(setsDoneBy[e.id] > 0)))
  return {
    done: exs.filter((e) => !notDone.includes(e)),
    notDone,
    skippedAccessories: notDone.filter((e) => isAccessory(e.exerciseId) || e.pairedWithId != null),
  }
}
