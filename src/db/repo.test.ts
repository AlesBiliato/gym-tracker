import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from './db'
import { ensureSeed } from './seed'
import {
  applySuggestion, closeSession, computeSuggestions, duplicateTemplate, getSettings, lastPerformance, saveImport, saveSet, revertSuggestion, startSession, substituteExercise, undoSet,
} from './repo'
import { buildImport } from '../domain/importer'

beforeAll(async () => {
  await ensureSeed(db, '2026-01-01')
})

describe('flujo de sesión (IndexedDB)', () => {
  it('el seed solo se aplica una vez', async () => {
    expect(await ensureSeed(db, '2026-01-01')).toBe(false)
    expect(await db.templates.count()).toBe(3)
  })

  it('empieza la sesión A con todo precargado y accesorios anidados', async () => {
    const id = await startSession('A', '2026-01-05')
    const exs = await db.sessionExercises.where('sessionId').equals(id).sortBy('order')
    expect(exs).toHaveLength(7)
    const sent = exs[0]
    expect(sent.plan.targets.map((t) => t.w)).toEqual([80, 100, 115, 115])
    const gem = exs.find((e) => e.pairedWithId === sent.id)
    expect(gem).toBeDefined()
  })

  it('registra series, deriva el estado, cierra y marca lo no hecho', async () => {
    const id = await startSession('B', '2026-01-07')
    const exs = await db.sessionExercises.where('sessionId').equals(id).sortBy('order')
    const rdl = exs[0]
    for (let i = 0; i < rdl.plan.sets; i++) await saveSet(rdl.id, i, { w: 85, reps: 8, rir: 2, done: true })
    expect((await db.sessionExercises.get(rdl.id))!.status).toBe('hecho')
    await undoSet(rdl.id, 2)
    expect((await db.sessionExercises.get(rdl.id))!.status).toBe('en_curso') // sesión abierta: nunca 'parcial'
    await closeSession(id)
    expect((await db.sessionExercises.get(rdl.id))!.status).toBe('parcial') // al cerrar con series sin hacer
    const after = await db.sessionExercises.where('sessionId').equals(id).toArray()
    expect(after.filter((e) => e.status === 'no_hecho').length).toBe(exs.length - 1)
    expect((await db.sessions.get(id))!.status).toBe('cerrada')
    const last = await lastPerformance(rdl.exerciseId)
    expect(last?.date).toBe('2026-01-07')
    expect(last?.sets).toHaveLength(2)
  })

  it('un sustituto es otro ejercicio y no hereda el historial del original', async () => {
    const id = await startSession('A', '2026-01-12')
    const exs = await db.sessionExercises.where('sessionId').equals(id).sortBy('order')
    const curl = exs.find((e) => e.plan.targets.some((t) => t.l === 7.5))!
    const original = curl.exerciseId
    const sub = (await db.exercises.where('name').equals('Curl femoral con mancuernas').first())!
    await substituteExercise(curl.id, sub.id)
    const upd = (await db.sessionExercises.get(curl.id))!
    expect(upd.exerciseId).toBe(sub.id)
    expect(upd.substitutedForExerciseId).toBe(original)
    expect(upd.status).toBe('sustituido')
    expect(upd.plan.targets).toEqual([]) // no hereda las cargas del original
    expect(upd.suggestion).toBeUndefined()
    await saveSet(curl.id, 0, { l: 8, r: 8, reps: 10, rir: 2, done: true })
    await closeSession(id)
    expect(await lastPerformance(sub.id)).not.toBeNull()
  })

  it('duplicar una plantilla crea una versión nueva y conserva el anidado', async () => {
    const a = (await db.templates.where('code').equals('A').toArray()).find((t) => t.active)!
    const newId = await duplicateTemplate(a.id, '2026-02-01')
    const items = await db.templateItems.where('templateId').equals(newId).toArray()
    expect(items).toHaveLength(7)
    const paired = items.filter((i) => i.pairedWithItemId)
    expect(paired.every((p) => items.some((i) => i.id === p.pairedWithItemId))).toBe(true)
    expect((await db.templates.get(a.id))!.active).toBe(false)
  })

  it('importa un historial y no duplica peso corporal del mismo día', async () => {
    const catalog = await db.exercises.toArray()
    const raw = {
      sesiones: [{ fecha: '2025-12-01', dia: 'C', ejercicios: [{ n: 'Hack squat', esq: '2×10', s: '60', fallo: false, obs: '' }] }],
      peso_corporal: [{ fecha: '2025-12-01', kg: 79 }],
    }
    await saveImport(buildImport(raw, catalog))
    await saveImport(buildImport(raw, await db.exercises.toArray()))
    expect(await db.bodyWeights.where('date').equals('2025-12-01').count()).toBe(1)
  })
})

describe('progresión (IndexedDB)', () => {
  it('sugiere subir tras una sesión completa y medida, y se aplica/deshace sin imponerse', async () => {
    const id = await startSession('A', '2026-02-02')
    const exs = await db.sessionExercises.where('sessionId').equals(id).sortBy('order')
    const bench = exs.find((e) => e.plan.targets.length === 3 && e.plan.targets[0].w === 62.5)!
    for (let i = 0; i < 3; i++) await saveSet(bench.id, i, { w: 62.5, reps: 6, rir: 2, done: true })
    await closeSession(id)

    const sug = (await computeSuggestions('A')).find((x) => x.exercise.id === bench.exerciseId)!
    expect(sug.suggestion.kind).toBe('subir')
    expect(sug.suggestion.targets.map((t) => t.w)).toEqual([65, 65, 65])
    // lo que no se hizo no genera sugerencia
    expect((await computeSuggestions('A')).find((x) => x.exercise.name === 'Jalón en máquina')!.suggestion.kind).toBe('sin_datos')

    // Sin aplicar: el plan de la sesión sigue siendo el de la plantilla, y la sugerencia queda disponible.
    const s1 = await startSession('A', '2026-02-09')
    const se1 = (await db.sessionExercises.where('sessionId').equals(s1).toArray()).find((e) => e.exerciseId === bench.exerciseId)!
    expect(se1.plan.targets.map((t) => t.w)).toEqual([62.5, 62.5, 62.5])
    expect(se1.suggestion).toMatchObject({ kind: 'subir', applied: false })

    await applySuggestion(se1.id)
    expect((await db.sessionExercises.get(se1.id))!.plan.targets.map((t) => t.w)).toEqual([65, 65, 65])
    await revertSuggestion(se1.id)
    expect((await db.sessionExercises.get(se1.id))!.plan.targets.map((t) => t.w)).toEqual([62.5, 62.5, 62.5])
    expect((await db.templateItems.get(bench.templateItemId!))!.targets.map((t) => t.w)).toEqual([62.5, 62.5, 62.5]) // plantilla intacta

    // Aplicada al empezar
    const s2 = await startSession('A', '2026-02-16', [bench.templateItemId!])
    const se2 = (await db.sessionExercises.where('sessionId').equals(s2).toArray()).find((e) => e.exerciseId === bench.exerciseId)!
    expect(se2.plan.targets.map((t) => t.w)).toEqual([65, 65, 65])
    expect(se2.suggestion).toMatchObject({ applied: true })
    expect(se2.suggestion!.previousTargets.map((t) => t.w)).toEqual([62.5, 62.5, 62.5])
  })

  it('solo cuenta la última vez en el MISMO tipo de sesión (press banca de la A vs. de la C)', async () => {
    // Una sesión C posterior con press banca más ligero y medido no debe cambiar la sugerencia de la A.
    const c = await startSession('C', '2026-02-20')
    const cEx = (await db.sessionExercises.where('sessionId').equals(c).toArray()).find((e) => e.plan.targets.length === 2 && e.plan.targets[0].w === 55)!
    for (let i = 0; i < 2; i++) await saveSet(cEx.id, i, { w: 55, reps: 8, rir: 3, done: true })
    await closeSession(c)
    const a = (await computeSuggestions('A')).find((x) => x.exercise.id === cEx.exerciseId)!
    expect(a.suggestion.basisDate).toBe('2026-02-02') // la última A, no la C del 20/02
    expect(a.suggestion.targets.map((t) => t.w)).toEqual([65, 65, 65])
    const cs = (await computeSuggestions('C')).find((x) => x.exercise.id === cEx.exerciseId)!
    expect(cs.suggestion.basisDate).toBe('2026-02-20')
  })

  it('más peso del planificado: avisa y consolida en vez de subir', async () => {
    const id = await startSession('A', '2026-03-02')
    const exs = await db.sessionExercises.where('sessionId').equals(id).sortBy('order')
    const sq = exs.find((e) => e.plan.targets.length === 4)!
    // plan 80/100/115/115; hecho 90/110/125/125 con RIR 1 en la última
    for (const [i, kg] of [90, 110, 125, 125].entries()) await saveSet(sq.id, i, { w: kg, reps: 6, rir: i === 3 ? 1 : 2, done: true })
    await closeSession(id)
    const sug = (await computeSuggestions('A')).find((x) => x.exercise.id === sq.exerciseId)!.suggestion
    expect(sug.kind).toBe('consolidar')
    expect(sug.warnings[0]).toMatch(/más peso del planificado/)
    expect(sug.targets.map((t) => t.w)).toEqual([90, 110, 125, 125])
  })
})

describe('ajuste semanal (IndexedDB)', () => {
  it('con partido importante cerca quita las piernas principales y marca la sesión como ajustada', async () => {
    await db.matches.add({
      id: 'm1', date: '2026-04-11', time: '12:00', rival: 'X', home: true, importance: 'importante', notes: '',
      createdAt: '', updatedAt: '', deviceId: 'd',
    })
    const id = await startSession('A', '2026-04-09', [], true) // jueves: partido el sábado
    const exs = await db.sessionExercises.where('sessionId').equals(id).toArray()
    const names = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    expect(exs.some((e) => names.get(e.exerciseId)!.muscleGroup === 'Piernas' && names.get(e.exerciseId)!.role === 'principal')).toBe(false)
    expect(exs.length).toBeLessThan(7)
    const s = await db.sessions.get(id)
    expect(s!.mode).toBe('ajustada')
    expect(s!.notes).toContain('quitado')
  })

  it('sin pedir el ajuste la sesión sale igual que la plantilla', async () => {
    const id = await startSession('A', '2026-04-09')
    expect(await db.sessionExercises.where('sessionId').equals(id).count()).toBe(7)
    expect((await db.sessions.get(id))!.mode).toBe('normal')
  })

  it('semana sin partido confirmada: +1 serie en principales, y esa serie extra no penaliza la progresión', async () => {
    await db.matches.clear()
    await db.settings.put({ ...(await getSettings()), noMatchWeek: '2026-05-04' })
    const id = await startSession('A', '2026-05-06', [], true)
    const exs = await db.sessionExercises.where('sessionId').equals(id).toArray()
    const boosted = exs.filter((e) => e.extraSets === 1)
    expect(boosted.length).toBeGreaterThan(0)
    const e = boosted[0]
    const planned = e.plan.sets
    for (let i = 0; i < planned - 1; i++) await saveSet(e.id, i, { w: 50, reps: 8, rir: 2, done: true }) // sin la serie extra
    await closeSession(id)
    const last = await lastPerformance(e.exerciseId)
    expect(last!.plan.sets).toBe(planned - 1)
  })
})
