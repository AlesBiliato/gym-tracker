import { describe, expect, it } from 'vitest'
import { suggestProgression, type LastSet, type ProgressionInput, type ProgressionSettings } from './progression'
import type { PlanSnapshot, SetTarget } from '../db/types'

const settings: ProgressionSettings = {
  incrementsKg: { barra: 2.5, mancuernas: 2, máquina: 2.5, polea: 2.5, 'peso corporal': 0 },
  minRirToProgress: 2,
  barbellBigStepKg: 5,
}
const w = (...xs: number[]): SetTarget[] => xs.map((x) => ({ w: x }))
const lr = (...ps: [number, number][]): SetTarget[] => ps.map(([l, r]) => ({ l, r }))
const plan = (targets: SetTarget[], repMin: number, repMax: number): PlanSnapshot => ({
  sets: targets.length, repMin, repMax, targets, restSecMin: 90, restSecMax: 120, targetRir: 2, notes: '', perSide: false,
})
/** Series hechas y medidas (reps y RIR reales). */
const sets = (loads: number[], reps: number, rir: number, extra: Partial<LastSet> = {}): LastSet[] =>
  loads.map((x, index) => ({ index, w: x, reps, rir, failed: false, done: true, estimated: false, ...extra }))

const barbell = { unilateral: false, loadType: 'barra', role: 'principal', excluded: false } as const

function run(over: Partial<ProgressionInput> & Pick<ProgressionInput, 'last'>) {
  const lastPlan = over.last?.plan
  return suggestProgression({
    exercise: barbell, settings,
    current: { sets: lastPlan?.sets ?? 3, repMin: lastPlan?.repMin ?? 6, repMax: lastPlan?.repMax ?? 6, targets: lastPlan?.targets ?? [] },
    ...over,
  })
}

describe('subir: todas las series al tope, sin fallo y con RIR ≥ 2', () => {
  const p = plan(w(60, 60, 60), 6, 6)
  it('barra: +2,5 kg con RIR 2', () => {
    const r = run({ last: { date: '2026-11-17', plan: p, sets: sets([60, 60, 60], 6, 2) } })
    expect(r.kind).toBe('subir')
    expect(r.targets).toEqual(w(62.5, 62.5, 62.5))
    expect(r.changes).toBe(true)
  })
  it('barra: salto grande (+5) si fue claramente fácil (RIR medio ≥ 3)', () => {
    const r = run({ last: { date: '2026-11-17', plan: p, sets: sets([60, 60, 60], 6, 3) } })
    expect(r.targets).toEqual(w(65, 65, 65))
  })
  it('mancuernas: el siguiente escalón configurado', () => {
    const r = run({
      exercise: { unilateral: false, loadType: 'mancuernas', role: 'principal', excluded: false },
      last: { date: 'x', plan: plan(w(16, 16, 16), 8, 8), sets: sets([16, 16, 16], 8, 2) },
    })
    expect(r.targets).toEqual(w(18, 18, 18))
  })
  it('el salto por ejercicio manda sobre el general', () => {
    const r = run({
      exercise: { unilateral: false, loadType: 'mancuernas', role: 'principal', excluded: false, incrementKg: 1 },
      last: { date: 'x', plan: plan(w(16, 16, 16), 8, 8), sets: sets([16, 16, 16], 8, 2) },
    })
    expect(r.targets).toEqual(w(17, 17, 17))
  })
  it('conserva la estructura de la rampa (sube todas las series el mismo salto)', () => {
    const r = run({ last: { date: 'x', plan: plan(w(80, 100, 115, 115), 6, 6), sets: sets([80, 100, 115, 115], 6, 2) } })
    expect(r.targets).toEqual(w(82.5, 102.5, 117.5, 117.5))
  })
  it('rango de repeticiones: hay que llegar al TOPE (8–10 → 10)', () => {
    const p2 = plan(w(40, 40, 40), 8, 10)
    expect(run({ last: { date: 'x', plan: p2, sets: sets([40, 40, 40], 9, 2) } }).kind).toBe('mantener')
    expect(run({ last: { date: 'x', plan: p2, sets: sets([40, 40, 40], 10, 2) } }).kind).toBe('subir')
  })
  it('unilateral: cada lado sube por separado, sin forzar simetría', () => {
    const r = run({
      exercise: { unilateral: true, loadType: 'mancuernas', role: 'principal', excluded: false },
      last: {
        date: 'x', plan: plan(lr([26, 20], [28, 20], [28, 20]), 8, 8),
        sets: [[26, 20], [28, 20], [28, 20]].map(([l, rr], index) => ({ index, l, r: rr, reps: 8, rir: 2, failed: false, done: true })),
      },
    })
    expect(r.targets).toEqual(lr([28, 22], [30, 22], [30, 22]))
  })
})

describe('mantener', () => {
  const p = plan(w(60, 60, 60), 6, 6)
  it('si hubo fallo', () => {
    const s = sets([60, 60, 60], 6, 2)
    s[2].failed = true
    const r = run({ last: { date: 'x', plan: p, sets: s } })
    expect(r.kind).toBe('mantener')
    expect(r.targets).toEqual(w(60, 60, 60))
  })
  it('si el RIR fue ≤ 1 en un ejercicio principal', () => {
    const r = run({ last: { date: 'x', plan: p, sets: sets([60, 60, 60], 6, 1) } })
    expect(r.kind).toBe('mantener')
    expect(r.reason).toMatch(/RIR ≤ 1/)
  })
  it('en un accesorio el RIR bajo no bloquea la subida (solo reps y fallo)', () => {
    const r = run({
      exercise: { unilateral: false, loadType: 'polea', role: 'accesorio', excluded: false },
      last: { date: 'x', plan: plan(w(15, 15, 15), 12, 12), sets: sets([15, 15, 15], 12, 1) },
    })
    expect(r.kind).toBe('subir')
    expect(r.targets).toEqual(w(17.5, 17.5, 17.5))
  })
  it('si la última sesión quedó incompleta', () => {
    const r = run({ last: { date: 'x', plan: p, sets: sets([60, 60], 6, 2) } })
    expect(r.kind).toBe('mantener')
    expect(r.reason).toMatch(/2\/3/)
  })
  it('mantiene la carga que se usó de verdad si fue menor a la planificada', () => {
    const r = run({ last: { date: 'x', plan: plan(w(60, 60, 60), 6, 6), sets: sets([57.5, 57.5, 57.5], 5, 2) } })
    expect(r.kind).toBe('mantener')
    expect(r.targets).toEqual(w(57.5, 57.5, 57.5))
  })
})

describe('series estimadas (~) no deciden subidas', () => {
  const p = plan(w(60, 60, 60), 6, 6)
  it('todas estimadas: sin datos, no sube aunque parezca que cumple', () => {
    const r = run({ last: { date: 'x', plan: p, sets: sets([60, 60, 60], 6, 3, { estimated: true }) } })
    expect(r.kind).toBe('sin_datos')
    expect(r.changes).toBe(false)
  })
  it('solo algunas medidas: no sube', () => {
    const s = sets([60, 60, 60], 6, 3)
    s[0].estimated = true
    expect(run({ last: { date: 'x', plan: p, sets: s } }).kind).toBe('sin_datos')
  })
  it('un RIR medido ≤ 1 sí frena aunque el resto sea estimado', () => {
    const s = sets([60, 60, 60], 6, 3, { estimated: true })
    s[2] = { ...s[2], estimated: false, rir: 1 }
    expect(run({ last: { date: 'x', plan: p, sets: s } }).kind).toBe('mantener')
  })
  it('sin historial', () => {
    expect(run({ last: null }).kind).toBe('sin_datos')
  })
})

describe('más peso del planificado: avisar y consolidar, nunca subir además', () => {
  // Plan que tocaba 70/90/100/100; se hizo 80/100/110/120, con 120×6 RIR 1 (única serie medida).
  const lastSets: LastSet[] = [
    { index: 0, w: 80, reps: 6, rir: null, failed: false, done: true, estimated: true },
    { index: 1, w: 100, reps: 6, rir: null, failed: false, done: true, estimated: true },
    { index: 2, w: 110, reps: 6, rir: null, failed: false, done: true, estimated: true },
    { index: 3, w: 120, reps: 6, rir: 1, failed: false, done: true, estimated: false },
  ]
  const last = { date: '2026-11-23', plan: plan(w(70, 90, 100, 100), 6, 6), sets: lastSets }

  it('ejemplo: 70/90/100/100 → hecho 80/100/110/120 ⇒ próxima A: 80/100/115/115', () => {
    const r = suggestProgression({
      exercise: barbell, settings, last,
      current: { sets: 4, repMin: 6, repMax: 6, targets: w(70, 90, 100, 100) },
    })
    expect(r.kind).toBe('consolidar')
    expect(r.targets).toEqual(w(80, 100, 115, 115))
    expect(r.changes).toBe(true)
    expect(r.warnings[0]).toMatch(/más peso del planificado/)
    expect(r.warnings[0]).toMatch(/serie 4: 120 kg \(plan 100\)/)
    expect(r.reason).toMatch(/antes de seguir subiendo/)
  })
  it('si la plantilla ya está en 80/100/115/115, la sugerencia coincide (sin cambios) pero avisa', () => {
    const r = suggestProgression({
      exercise: barbell, settings, last,
      current: { sets: 4, repMin: 6, repMax: 6, targets: w(80, 100, 115, 115) },
    })
    expect(r.changes).toBe(false)
    expect(r.warnings).toHaveLength(1)
  })
  it('no sube aunque todo fuera con RIR ≥ 2 y al tope', () => {
    const easy = lastSets.map((s) => ({ ...s, rir: 3, estimated: false }))
    const r = suggestProgression({
      exercise: barbell, settings, last: { ...last, sets: easy },
      current: { sets: 4, repMin: 6, repMax: 6, targets: w(70, 90, 100, 100) },
    })
    expect(r.kind).toBe('consolidar')
    expect(Math.max(...r.targets.map((t) => t.w ?? 0))).toBeLessThanOrEqual(120)
  })
  it('tras consolidar, si el plan ya es lo hecho y va fácil, entonces sí sube', () => {
    const consolidated = plan(w(80, 100, 115, 115), 6, 6)
    const r = suggestProgression({
      exercise: barbell, settings,
      last: { date: 'x', plan: consolidated, sets: sets([80, 100, 115, 115], 6, 2) },
      current: { sets: 4, repMin: 6, repMax: 6, targets: w(80, 100, 115, 115) },
    })
    expect(r.kind).toBe('subir')
    expect(r.targets).toEqual(w(82.5, 102.5, 117.5, 117.5))
  })
  it('una sola serie con más peso no empuja a subir: media 61,7 → se redondea hacia abajo (60)', () => {
    const r = run({
      last: { date: 'x', plan: plan(w(60, 60, 60), 6, 6), sets: sets([60, 65, 60], 6, 2) },
    })
    expect(r.kind).toBe('consolidar')
    expect(r.targets).toEqual(w(60, 60, 60))
  })
})
