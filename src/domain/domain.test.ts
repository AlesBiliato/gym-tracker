import { describe, expect, it } from 'vitest'
import { formatDate, formatKg, parseNumber, daysBetween, formatClock } from './format'
import {
  buildImport, matchExercise, parseDate, parseObs, parseScheme, parseWeights, templateCodeFrom,
} from './importer'
import { nextTemplateCode, orderItems, summarize, targetForSet } from './sessionPlan'
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
    expect(parseScheme('3×8-10')).toEqual({ sets: 3, repMin: 8, repMax: 10 })
    expect(parseScheme('4x6')).toEqual({ sets: 4, repMin: 6, repMax: 6 })
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
    expect(s.exercises.filter((e) => e.soreness).map((e) => e.name).sort()).toEqual(['Peso muerto rumano', 'Sentadilla búlgara'])
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
