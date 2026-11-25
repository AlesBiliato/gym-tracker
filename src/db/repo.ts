import { db } from './db'
import { newBase, now } from './base'
import { DEFAULT_SETTINGS } from './seed'
import { deriveStatus, orderItems, planFromItem, statusOnClose } from '../domain/sessionPlan'
import { suggestProgression, type Suggestion } from '../domain/progression'
import type { ImportResult } from '../domain/importer'
import type {
  Exercise, ExerciseStatus, PlanSnapshot, Session, SessionExercise, SetLog, Settings, Template, TemplateItem,
} from './types'

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  if (s) return { ...DEFAULT_SETTINGS, ...s, incrementsKg: { ...DEFAULT_SETTINGS.incrementsKg, ...s.incrementsKg } }
  return { ...newBase(), id: 'settings', ...DEFAULT_SETTINGS }
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = await getSettings()
  await db.settings.put({ ...cur, ...patch, id: 'settings', updatedAt: now() })
}

export async function activeTemplate(code: 'A' | 'B' | 'C'): Promise<Template | undefined> {
  const all = await db.templates.where('code').equals(code).toArray()
  return all.filter((t) => t.active && !t.deletedAt).sort((a, b) => b.version - a.version)[0]
}

/** Crea la sesión de hoy con todo precargado desde la plantilla activa. */
/** `applyItemIds`: ids de TemplateItem cuya sugerencia se aplica ya. El resto queda disponible para aplicar desde el ejercicio. */
export async function startSession(code: 'A' | 'B' | 'C', date: string, applyItemIds: string[] = []): Promise<string> {
  const tpl = await activeTemplate(code)
  if (!tpl) throw new Error(`No hay plantilla ${code}`)
  const items = orderItems((await db.templateItems.where('templateId').equals(tpl.id).toArray()).filter((i) => !i.deletedAt))
  const session: Session = {
    ...newBase(), date, templateId: tpl.id, templateCode: code, mode: 'normal', status: 'en_curso',
    notes: '', startedAt: now(),
  }
  const suggestions = new Map((await computeSuggestions(code)).map((x) => [x.item.id, x.suggestion]))
  const apply = new Set(applyItemIds)
  const idByItem = new Map<string, string>()
  const exs: SessionExercise[] = items.map((it, order) => {
    const se: SessionExercise = {
      ...newBase(), sessionId: session.id, exerciseId: it.exerciseId, templateItemId: it.id, order,
      pairedWithId: null, status: 'pendiente', obs: '', plan: planFromItem(it),
    }
    const sug = suggestions.get(it.id)
    if (sug && sug.kind !== 'sin_datos') {
      const applied = apply.has(it.id) && sug.changes
      se.suggestion = {
        kind: sug.kind, targets: sug.targets, previousTargets: se.plan.targets.map((t) => ({ ...t })),
        reason: sug.reason, warnings: sug.warnings, basisDate: sug.basisDate, applied,
      }
      if (applied) se.plan = { ...se.plan, targets: sug.targets.map((t) => ({ ...t })) }
    }
    idByItem.set(it.id, se.id)
    return se
  })
  items.forEach((it, i) => {
    if (it.pairedWithItemId) exs[i].pairedWithId = idByItem.get(it.pairedWithItemId) ?? null
  })
  await db.transaction('rw', [db.sessions, db.sessionExercises], async () => {
    await db.sessions.add(session)
    await db.sessionExercises.bulkAdd(exs)
  })
  return session.id
}

export interface LastPerformance {
  date: string
  sets: SetLog[]
  obs: string
  /** Plan vigente cuando se hizo (cargas y rango previstos). */
  plan: PlanSnapshot
}

/**
 * Lo que hice la última vez en ese ejercicio (solo ese ejercicio: las variantes no se comparan).
 * Con `templateCode`, solo cuenta sesiones de ese tipo (A/B/C): el press banca de la A y el de la C
 * tienen cargas y rangos distintos y no deben mezclarse al sugerir.
 */
export async function lastPerformance(
  exerciseId: string, excludeSessionId?: string, templateCode?: 'A' | 'B' | 'C',
): Promise<LastPerformance | null> {
  const ses = await db.sessionExercises.where('exerciseId').equals(exerciseId).toArray()
  let best: { se: SessionExercise; date: string } | null = null
  for (const se of ses) {
    if (se.sessionId === excludeSessionId || se.deletedAt || se.status === 'no_hecho') continue
    const s = await db.sessions.get(se.sessionId)
    if (!s || s.status !== 'cerrada' || s.deletedAt) continue
    if (templateCode && s.templateCode !== templateCode) continue
    if (!best || s.date > best.date) best = { se, date: s.date }
  }
  if (!best) return null
  const sets = (await db.sets.where('sessionExerciseId').equals(best.se.id).toArray())
    .filter((s) => s.done && !s.deletedAt)
    .sort((a, b) => a.index - b.index)
  if (!sets.length) return null
  return { date: best.date, sets, obs: best.se.obs, plan: best.se.plan }
}

export async function saveSet(seId: string, index: number, patch: Partial<SetLog>): Promise<void> {
  const existing = (await db.sets.where('sessionExerciseId').equals(seId).toArray()).find((s) => s.index === index && !s.deletedAt)
  if (existing) {
    await db.sets.update(existing.id, { ...patch, updatedAt: now() })
  } else {
    await db.sets.add({
      ...newBase(), sessionExerciseId: seId, index, reps: null, rir: null, failed: false, done: false, ...patch,
    })
  }
  if (patch.done) await recomputeStatus(seId)
}

export async function undoSet(seId: string, index: number) {
  const existing = (await db.sets.where('sessionExerciseId').equals(seId).toArray()).find((s) => s.index === index)
  if (existing) await db.sets.update(existing.id, { done: false, completedAt: null, updatedAt: now() })
  await recomputeStatus(seId)
}

/** Estado derivado mientras la sesión está abierta (ver `deriveStatus`). */
async function recomputeStatus(seId: string) {
  const se = await db.sessionExercises.get(seId)
  if (!se) return
  const done = (await db.sets.where('sessionExerciseId').equals(seId).toArray()).filter((s) => s.done).length
  const status = deriveStatus(se.status, done, se.plan.sets, !!se.substitutedForExerciseId)
  await db.sessionExercises.update(seId, { status, updatedAt: now() })
}

export async function setExerciseStatus(seId: string, status: ExerciseStatus) {
  await db.sessionExercises.update(seId, { status, updatedAt: now() })
}

export async function setObs(seId: string, obs: string) {
  await db.sessionExercises.update(seId, { obs, updatedAt: now() })
}

export async function setPlanSets(seId: string, plan: PlanSnapshot) {
  await db.sessionExercises.update(seId, { plan, updatedAt: now() })
}

/** Sustituye por otro ejercicio (se registra como ejercicio distinto, sin comparar con el original). */
export async function substituteExercise(seId: string, newExerciseId: string) {
  const se = await db.sessionExercises.get(seId)
  if (!se) return
  await db.sessionExercises.update(seId, {
    exerciseId: newExerciseId,
    substitutedForExerciseId: se.substitutedForExerciseId ?? se.exerciseId,
    status: 'sustituido',
    // Las cargas del original (p. ej. 40 kg bilateral) no valen para el sustituto (p. ej. unilateral):
    // se parte de lo que hiciste la última vez con ÉL.
    plan: { ...se.plan, targets: [] },
    suggestion: undefined,
    updatedAt: now(),
  })
}

export async function setSessionNotes(id: string, notes: string) {
  await db.sessions.update(id, { notes, updatedAt: now() })
}

export async function closeSession(id: string) {
  const exs = await db.sessionExercises.where('sessionId').equals(id).toArray()
  for (const se of exs) {
    const n = (await db.sets.where('sessionExerciseId').equals(se.id).toArray()).filter((s) => s.done).length
    const status = statusOnClose(se.status, n, se.plan.sets)
    if (status !== se.status) await db.sessionExercises.update(se.id, { status, updatedAt: now() })
  }
  await db.sessions.update(id, { status: 'cerrada', endedAt: now(), updatedAt: now() })
}

export async function deleteSession(id: string) {
  const exs = await db.sessionExercises.where('sessionId').equals(id).toArray()
  await db.transaction('rw', [db.sessions, db.sessionExercises, db.sets], async () => {
    for (const se of exs) await db.sets.where('sessionExerciseId').equals(se.id).delete()
    await db.sessionExercises.where('sessionId').equals(id).delete()
    await db.sessions.delete(id)
  })
}

// ---- Catálogo y plantillas ----

export async function saveExercise(e: Exercise) {
  await db.exercises.put({ ...e, updatedAt: now() })
}

export async function saveTemplateItem(it: TemplateItem) {
  await db.templateItems.put({ ...it, updatedAt: now() })
}

export async function deleteTemplateItem(id: string) {
  const dependents = await db.templateItems.filter((i) => i.pairedWithItemId === id).toArray()
  await db.transaction('rw', db.templateItems, async () => {
    for (const d of dependents) await db.templateItems.update(d.id, { pairedWithItemId: null, updatedAt: now() })
    await db.templateItems.delete(id)
  })
}

/** Duplica una plantilla como nueva versión activa (la anterior se conserva, inactiva). */
export async function duplicateTemplate(templateId: string, validFrom: string): Promise<string> {
  const t = await db.templates.get(templateId)
  if (!t) throw new Error('Plantilla no encontrada')
  const items = await db.templateItems.where('templateId').equals(templateId).toArray()
  const nt: Template = { ...newBase(), code: t.code, name: t.name, version: t.version + 1, validFrom, active: true }
  const idMap = new Map<string, string>()
  const copies = items.map((i) => {
    const c: TemplateItem = { ...i, ...newBase(), templateId: nt.id, targets: i.targets.map((x) => ({ ...x })) }
    idMap.set(i.id, c.id)
    return c
  })
  copies.forEach((c) => { if (c.pairedWithItemId) c.pairedWithItemId = idMap.get(c.pairedWithItemId) ?? null })
  await db.transaction('rw', [db.templates, db.templateItems], async () => {
    await db.templates.update(t.id, { active: false, updatedAt: now() })
    await db.templates.add(nt)
    await db.templateItems.bulkAdd(copies)
  })
  return nt.id
}

// ---- Importar / exportar ----

export async function saveImport(r: ImportResult) {
  await db.transaction('rw', [db.exercises, db.sessions, db.sessionExercises, db.sets, db.bodyWeights], async () => {
    // Evita duplicar si se importa dos veces el mismo archivo: se omiten fechas ya importadas.
    const importedDates = new Set((await db.sessions.toArray()).filter((s) => s.imported).map((s) => s.date))
    const sessions = r.sessions.filter((s) => !importedDates.has(s.date))
    const keep = new Set(sessions.map((s) => s.id))
    const sess = r.sessionExercises.filter((e) => keep.has(e.sessionId))
    const keepSe = new Set(sess.map((e) => e.id))
    const have0 = new Set((await db.exercises.toArray()).map((e) => e.id))
    await db.exercises.bulkAdd(r.newExercises.filter((e) => !have0.has(e.id)))
    await db.sessions.bulkAdd(sessions)
    await db.sessionExercises.bulkAdd(sess)
    await db.sets.bulkAdd(r.sets.filter((s) => keepSe.has(s.sessionExerciseId)))
    // Peso corporal: si ya hay uno ese día, no se duplica.
    const have = new Set((await db.bodyWeights.toArray()).map((b) => b.date))
    await db.bodyWeights.bulkAdd(r.bodyWeights.filter((b) => !have.has(b.date)))
  })
}

export async function exportAll() {
  const [exercises, templates, templateItems, sessions, sessionExercises, sets, matches, bodyWeights, settings] =
    await Promise.all([
      db.exercises.toArray(), db.templates.toArray(), db.templateItems.toArray(), db.sessions.toArray(),
      db.sessionExercises.toArray(), db.sets.toArray(), db.matches.toArray(), db.bodyWeights.toArray(),
      db.settings.toArray(),
    ])
  return {
    app: 'gym-tracker', version: 1, exportedAt: now(),
    exercises, templates, templateItems, sessions, sessionExercises, sets, matches, bodyWeights, settings,
  }
}

// ---- Peso corporal ----

/** Una medida por día: si ya existe, se actualiza. */
export async function saveBodyWeight(date: string, kg: number) {
  const existing = (await db.bodyWeights.where('date').equals(date).toArray()).find((b) => !b.deletedAt)
  if (existing) await db.bodyWeights.update(existing.id, { kg, updatedAt: now() })
  else await db.bodyWeights.add({ ...newBase(), date, kg })
}

export async function deleteBodyWeight(id: string) {
  await db.bodyWeights.update(id, { deletedAt: now(), updatedAt: now() })
}

// ---- Progresión: sugerencias de carga ----

export interface ItemSuggestion {
  item: TemplateItem
  exercise: Exercise
  suggestion: Suggestion
}

/** Sugerencias para la próxima sesión de esa plantilla (una por ejercicio, según su última vez). */
export async function computeSuggestions(code: 'A' | 'B' | 'C'): Promise<ItemSuggestion[]> {
  const tpl = await activeTemplate(code)
  if (!tpl) return []
  const items = orderItems((await db.templateItems.where('templateId').equals(tpl.id).toArray()).filter((i) => !i.deletedAt))
  const settings = await getSettings()
  const out: ItemSuggestion[] = []
  for (const item of items) {
    const exercise = await db.exercises.get(item.exerciseId)
    if (!exercise || exercise.excluded) continue
    const last = await lastPerformance(item.exerciseId, undefined, code) // mismo tipo de sesión
    const suggestion = suggestProgression({
      exercise, settings, current: item,
      last: last ? { date: last.date, plan: last.plan, sets: last.sets } : null,
    })
    out.push({ item, exercise, suggestion })
  }
  return out
}

/** Aplica la sugerencia al plan de ESTA sesión (no toca la plantilla ni las series ya registradas). */
export async function applySuggestion(seId: string) {
  const se = await db.sessionExercises.get(seId)
  if (!se?.suggestion) return
  await db.sessionExercises.update(seId, {
    plan: { ...se.plan, targets: se.suggestion.targets.map((t) => ({ ...t })) },
    suggestion: { ...se.suggestion, applied: true },
    updatedAt: now(),
  })
}

export async function revertSuggestion(seId: string) {
  const se = await db.sessionExercises.get(seId)
  if (!se?.suggestion) return
  await db.sessionExercises.update(seId, {
    plan: { ...se.plan, targets: se.suggestion.previousTargets.map((t) => ({ ...t })) },
    suggestion: { ...se.suggestion, applied: false },
    updatedAt: now(),
  })
}
