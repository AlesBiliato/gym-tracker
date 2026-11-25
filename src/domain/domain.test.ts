import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatKg, parseNumber, daysBetween, formatClock } from './format'
import {
  buildImport, matchExercise, parseDate, parseObs, parseScheme, parseWeights, templateCodeFrom,
} from './importer'
import { deriveStatus, nextTemplateCode, orderItems, quickReps, quickSet, repsOptions, RIR_OPTIONS, statusOnClose, summarize, targetForSet } from './sessionPlan'
import { buildSeed } from '../db/seed'

describe('formato es-ES', () => {
  it('kg con coma decimal', () => {
    expect(formatKg(62.5)).toBe('62,5')
    expect(formatKg(18.25)).toBe('18,25')
    expect(formatKg(80)).toBe('80')
    expect(formatKg(null)).toBe('–')
  })
  it('parsea coma y punto', () => {
    expect(parseNumber('62,5')).toBe(62.5)
    expect(parseNumber('62.5')).toBe(62.5)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
  })
  it('fechas dd/mm/aa y diferencia de días', () => {
    expect(formatDate('2026-11-25')).toBe('25/11/26')
    expect(daysBetween('2026-11-01', '2026-11-25')).toBe(24)
    expect(formatClock(125)).toBe('2:05')
    expect(formatDateTime(new Date(2026, 10, 25, 9, 5).toISOString())).toBe('25/11/26 09:05')
    expect(formatDateTime('no-es-fecha')).toBe('no-es-fecha')
  })
})

describe('importador', () => {
  const catalog = buildSeed('2026-01-01').exercises

  it('normaliza nombres al catálogo (alias, tildes, mayúsculas)', () => {
    expect(matchExercise('Jalon en maquina', catalog)?.name).toBe('Jalón en máquina')
    expect(matchExercise('Curl femoral unilateral en máquina', catalog)?.name).toBe('Curl femoral unilateral')
    expect(matchExercise('Ejercicio raro', catalog)).toBeNull()
  })
  it('curl femoral con mancuernas NO se funde con el de máquina', () => {
    expect(matchExercise('Curl femoral con mancuernas', catalog)?.name).toBe('Curl femoral con mancuernas')
  })
  it('fechas y esquemas', () => {
    expect(parseDate('12/01/26')).toBe('2026-01-12')
    expect(parseDate('2026-1-5')).toBe('2026-01-05')
    expect(parseScheme('3×8-10')).toMatchObject({ sets: 3, repMin: 8, repMax: 10, perSide: false })
    expect(parseScheme('4x6')).toMatchObject({ sets: 4, repMin: 6, repMax: 6 })
    expect(templateCodeFrom('Sesión A')).toBe('A')
    expect(templateCodeFrom('martes')).toBeNull()
  })
  it('pesos bilaterales: un número por serie', () => {
    expect(parseWeights('80 / 100 / 115 / 115', false, 4)).toEqual([{ w: 80 }, { w: 100 }, { w: 115 }, { w: 115 }])
    expect(parseWeights('62,5', false, 3)).toHaveLength(3)
  })
  it('pesos unilaterales: A/B = izq./der., izquierda primero', () => {
    expect(parseWeights('26/20 → 28/20 → 28/20', true, 3)).toEqual([
      { l: 26, r: 20 }, { l: 28, r: 20 }, { l: 28, r: 20 },
    ])
    expect(parseWeights('30/20', true, 2)).toEqual([{ l: 30, r: 20 }, { l: 30, r: 20 }])
  })
  it('extrae repeticiones y RIR de las observaciones', () => {
    expect(parseObs('120×6 con 1-2 repeticiones en reserva')).toEqual({ pairs: [{ w: 120, reps: 6 }], rir: 1 })
    expect(parseObs('RIR 2')).toEqual({ pairs: [], rir: 2 })
    expect(parseObs('me sentí bien')).toEqual({ pairs: [], rir: null })
  })
  it('importa sesiones, conserva ejercicios desconocidos y peso corporal', () => {
    const r = buildImport(
      {
        sesiones: [{
          fecha: '2026-01-12', dia: 'A', notas: 'ok',
          ejercicios: [
            { n: 'Sentadilla', esq: '4×6', s: '80 / 100 / 115 / 115', u: 'kg', fallo: false, obs: '115×6 con 1-2 repeticiones en reserva' },
            { n: 'Remo con mancuerna en banco', esq: '3×8', s: '26/20 → 28/20 → 28/20', u: 'kg', fallo: true, obs: '' },
            { n: 'Zancadas con barra', esq: '3×10', s: '40', u: 'kg', fallo: false, obs: '' },
          ],
        }],
        peso_corporal: [{ fecha: '2026-01-12', kg: 78.4 }],
      },
      catalog,
    )
    expect(r.sessions).toHaveLength(1)
    expect(r.sessions[0].templateCode).toBe('A')
    expect(r.sessionExercises).toHaveLength(3)
    expect(r.newExercises.map((e) => e.name)).toEqual(['Zancadas con barra'])
    const sq = r.sets.filter((s) => s.sessionExerciseId === r.sessionExercises[0].id)
    expect(sq).toHaveLength(4)
    expect(sq[3].reps).toBe(6)
    expect(sq[3].rir).toBe(1)
    const remo = r.sets.filter((s) => s.sessionExerciseId === r.sessionExercises[1].id)
    expect(remo[0]).toMatchObject({ l: 26, r: 20 })
    expect(remo[2].failed).toBe(true)
    expect(r.bodyWeights[0].kg).toBe(78.4)
  })
})

describe('seed de plantillas', () => {
  const s = buildSeed('2026-01-01')
  it('crea las 3 plantillas con sus ejercicios y anidados', () => {
    expect(s.templates.map((t) => t.code)).toEqual(['A', 'B', 'C'])
    const exId = (n: string) => s.exercises.find((e) => e.name === n)!.id
    const a = s.templateItems.filter((i) => i.templateId === s.templates[0].id)
    const sent = a.find((i) => i.exerciseId === exId('Sentadilla'))!
    expect(sent.targets).toEqual([{ w: 80 }, { w: 100 }, { w: 115 }, { w: 115 }])
    const gem = a.find((i) => i.exerciseId === exId('Gemelos de pie'))!
    expect(gem.pairedWithItemId).toBe(sent.id)
  })
  it('marca agujetas altas y quitables en C', () => {
    expect(s.exercises.filter((e) => e.soreness).map((e) => e.name).sort()).toEqual(['Peso muerto rumano', 'Peso muerto rumano con mancuernas', 'Sentadilla búlgara'])
    const c = s.templateItems.filter((i) => i.templateId === s.templates[2].id && i.removableNearMatch)
    expect(c.map((i) => s.exercises.find((e) => e.id === i.exerciseId)!.name).sort()).toEqual(['Curl femoral unilateral', 'Hack squat'])
  })
})

describe('qué sesión toca', () => {
  const ses = (code: 'A' | 'B' | 'C' | null, date: string, status: 'cerrada' | 'en_curso' = 'cerrada') =>
    ({ templateCode: code, date, status })
  it('rota A→B→C→A y empieza por A', () => {
    expect(nextTemplateCode([])).toBe('A')
    expect(nextTemplateCode([ses('A', '2026-01-05')])).toBe('B')
    expect(nextTemplateCode([ses('A', '2026-01-05'), ses('B', '2026-01-07')])).toBe('C')
    expect(nextTemplateCode([ses('C', '2026-01-09')])).toBe('A')
  })
  it('no acumula sesiones perdidas: tras A salteando B, toca B igualmente (no B+C)', () => {
    expect(nextTemplateCode([ses('A', '2026-01-05')])).toBe('B')
  })
  it('ignora sesiones en curso', () => {
    expect(nextTemplateCode([ses('A', '2026-01-05'), ses('B', '2026-01-07', 'en_curso')])).toBe('B')
  })
})

describe('plan de sesión', () => {
  it('repite el último objetivo si hay menos que series', () => {
    const plan = { sets: 3, repMin: 8, repMax: 8, targets: [{ w: 10 }, { w: 12 }], restSecMin: 60, restSecMax: 90, targetRir: 2, notes: '', perSide: false }
    expect(targetForSet(plan, 2)).toEqual({ w: 12 })
  })
  it('anida accesorios bajo su principal', () => {
    const items = [
      { id: 'g', order: 1, pairedWithItemId: 's' },
      { id: 's', order: 0, pairedWithItemId: null },
      { id: 'p', order: 2, pairedWithItemId: null },
    ]
    expect(orderItems(items).map((i) => i.id)).toEqual(['s', 'g', 'p'])
  })
  it('el resumen destaca los accesorios sin hacer', () => {
    const mk = (id: string, status: 'pendiente' | 'hecho', paired: string | null) =>
      ({ id, exerciseId: id, status, pairedWithId: paired }) as never
    const exs = [mk('sent', 'hecho', null), mk('gem', 'pendiente', 'sent'), mk('banca', 'pendiente', null)]
    const r = summarize(exs, { sent: 4, banca: 0, gem: 0 }, () => false)
    expect(r.notDone.map((e) => e.id)).toEqual(['gem', 'banca'])
    expect(r.skippedAccessories.map((e) => e.id)).toEqual(['gem'])
  })
})

describe('estado del ejercicio: En curso vs Parcial', () => {
  it('con la sesión abierta, series pendientes = en curso (nunca parcial)', () => {
    expect(deriveStatus('pendiente', 0, 4, false)).toBe('pendiente')
    expect(deriveStatus('pendiente', 1, 4, false)).toBe('en_curso')
    expect(deriveStatus('en_curso', 3, 4, false)).toBe('en_curso')
    expect(deriveStatus('en_curso', 4, 4, false)).toBe('hecho')
  })
  it('no pisa no_hecho y respeta la sustitución', () => {
    expect(deriveStatus('no_hecho', 2, 4, false)).toBe('no_hecho')
    expect(deriveStatus('pendiente', 1, 3, true)).toBe('sustituido')
  })
  it('al cerrar: parcial solo si quedaron series sin hacer', () => {
    expect(statusOnClose('en_curso', 2, 4)).toBe('parcial')
    expect(statusOnClose('en_curso', 4, 4)).toBe('hecho')
    expect(statusOnClose('pendiente', 0, 3)).toBe('no_hecho')
    expect(statusOnClose('no_hecho', 0, 3)).toBe('no_hecho')
    expect(statusOnClose('sustituido', 2, 3)).toBe('sustituido')
    expect(statusOnClose('sustituido', 0, 3)).toBe('no_hecho') // sustituido pero sin ninguna serie
  })
})

describe('serie rápida (✓)', () => {
  const plan = (repMin: number, repMax: number, ws: number[]) => ({
    sets: ws.length, repMin, repMax, targets: ws.map((w) => ({ w })), restSecMin: 90, restSecMax: 120, targetRir: 2, notes: '', perSide: false,
  })
  const last = (reps: (number | null)[], estimated = false) => reps.map((r, index) => ({ index, w: 40, reps: r, done: true, estimated }))

  it('sin historial: las reps son el MÁXIMO del rango; con rango fijo, ese valor', () => {
    expect(quickReps(plan(8, 10, [40, 40, 40]), 0, null)).toBe(10)
    expect(quickReps(plan(6, 6, [80]), 0, undefined)).toBe(6)
  })
  it('con historial: lo hecho la última vez en ESA serie', () => {
    const l = last([10, 9, 8])
    expect(quickReps(plan(8, 10, [40, 40, 40]), 0, l)).toBe(10)
    expect(quickReps(plan(8, 10, [40, 40, 40]), 1, l)).toBe(9)
    expect(quickReps(plan(8, 10, [40, 40, 40]), 2, l)).toBe(8)
  })
  it('si esa serie no existió la última vez, o eran reps estimadas (~), vuelve al máximo del rango', () => {
    expect(quickReps(plan(8, 10, [40, 40, 40, 40]), 3, last([10, 9, 8]))).toBe(10)
    expect(quickReps(plan(8, 10, [40, 40]), 0, last([8, 8], true))).toBe(10)
    expect(quickReps(plan(8, 10, [40, 40]), 0, last([null, null]))).toBe(10)
  })
  it('el ✓ guarda el RIR como "no indicado" (null) y conserva la carga del plan', () => {
    const q = quickSet(plan(8, 10, [40, 42.5]), 1, last([10, 9]), false)
    expect(q).toEqual({ w: 42.5, l: null, r: null, reps: 9, rir: null, failed: false })
  })
  it('si el plan no trae carga, usa la de la última vez', () => {
    const q = quickSet({ ...plan(8, 10, [40]), targets: [] }, 0, last([10]), false)
    expect(q.w).toBe(40)
  })
  it('unilateral: la carga se toma por lado', () => {
    const q = quickSet({ ...plan(8, 8, [0]), targets: [{ l: 26, r: 20 }] }, 0, null, true)
    expect(q).toMatchObject({ l: 26, r: 20, w: null, reps: 8, rir: null })
  })
  it('botones de reps: del mínimo −2 al máximo +2', () => {
    expect(repsOptions(plan(8, 10, []))).toEqual([6, 7, 8, 9, 10, 11, 12])
    expect(repsOptions(plan(6, 6, []))).toEqual([4, 5, 6, 7, 8])
    expect(repsOptions(plan(1, 2, []))).toEqual([1, 2, 3, 4]) // nunca por debajo de 1
  })
  it('los botones siempre incluyen el valor guardado, aunque esté fuera del rango', () => {
    expect(repsOptions(plan(8, 10, []), 14)).toEqual([6, 7, 8, 9, 10, 11, 12, 14])
    expect(repsOptions(plan(8, 10, []), 9)).toEqual([6, 7, 8, 9, 10, 11, 12])
  })
  it('botones de RIR: 0, 1, 2, 3 y 4+', () => {
    expect([...RIR_OPTIONS]).toEqual([0, 1, 2, 3, 4])
  })
})

describe('resumen: ejercicios sustituidos', () => {
  it('un sustituido sin series cuenta como sin hacer; con series, como hecho', () => {
    const mk = (id: string, status: 'sustituido' | 'hecho', paired: string | null) => ({ id, exerciseId: id, status, pairedWithId: paired }) as never
    const r = summarize([mk('a', 'sustituido', null), mk('b', 'sustituido', null), mk('c', 'hecho', null)], { a: 0, b: 2, c: 3 }, () => false)
    expect(r.notDone.map((e) => e.id)).toEqual(['a'])
    expect(r.done.map((e) => e.id)).toEqual(['b', 'c'])
  })
})
