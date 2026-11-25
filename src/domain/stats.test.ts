import { describe, expect, it } from 'vitest'
import {
  addDays, bodyWeightTrend, exerciseHistory, flattenSets, personalBests, shortGroups, weekStart,
  weeklyFrequency, weeklyVolume, type FlatSet,
} from './stats'
import type { Session, SessionExercise, SetLog } from '../db/types'

const fs = (p: Partial<FlatSet> & { date: string; exerciseId: string }): FlatSet => ({
  sessionId: p.date, index: 0, w: null, l: null, r: null, reps: 6, rir: 2, failed: false, estimated: false, ...p,
})

describe('semanas (lunes)', () => {
  it('weekStart devuelve el lunes', () => {
    expect(weekStart('2026-11-25')).toBe('2026-11-23') // miércoles
    expect(weekStart('2026-11-23')).toBe('2026-11-23') // lunes
    expect(weekStart('2026-11-29')).toBe('2026-11-23') // domingo
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
  })
})

describe('flattenSets', () => {
  const sess = (id: string, date: string, status: Session['status'] = 'cerrada') => ({ id, date, status }) as Session
  const se = (id: string, sessionId: string, exerciseId: string, status: SessionExercise['status'] = 'hecho') =>
    ({ id, sessionId, exerciseId, status }) as SessionExercise
  const st = (id: string, seId: string, p: Partial<SetLog> = {}) =>
    ({ id, sessionExerciseId: seId, index: 0, done: true, reps: 6, rir: 2, failed: false, ...p }) as SetLog

  it('solo series hechas de sesiones cerradas y ejercicios no omitidos', () => {
    const r = flattenSets(
      [sess('a', '2026-11-02'), sess('b', '2026-11-03', 'en_curso')],
      [se('e1', 'a', 'sq'), se('e2', 'a', 'x', 'no_hecho'), se('e3', 'b', 'sq')],
      [st('1', 'e1', { w: 100 }), st('2', 'e1', { index: 1, done: false }), st('3', 'e2'), st('4', 'e3')],
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ exerciseId: 'sq', w: 100, date: '2026-11-02' })
  })
})

describe('historial y mejores marcas por ejercicio', () => {
  const flat = [
    fs({ date: '2026-11-02', exerciseId: 'sq', w: 100, reps: 6, index: 0 }),
    fs({ date: '2026-11-02', exerciseId: 'sq', w: 110, reps: 5, index: 1 }),
    fs({ date: '2026-11-09', exerciseId: 'sq', w: 110, reps: 6, index: 0 }),
    fs({ date: '2026-11-09', exerciseId: 'otro', w: 999, reps: 1 }),
  ]
  const h = exerciseHistory(flat, 'sq')
  it('agrupa por sesión, solo ese ejercicio, con máximo y volumen', () => {
    expect(h.map((p) => p.date)).toEqual(['2026-11-02', '2026-11-09'])
    expect(h[0]).toMatchObject({ maxW: 110, volume: 100 * 6 + 110 * 5, totalReps: 11 })
    expect(h[1].volume).toBe(660)
  })
  it('mejor marca: más peso, y a igual peso más repeticiones', () => {
    const pb = personalBests(h)
    expect(pb.w).toMatchObject({ kg: 110, reps: 6, date: '2026-11-09' })
    expect(pb.volume).toEqual({ value: 1150, date: '2026-11-02' })
  })
  it('a igual peso y repeticiones, la marca medida gana a la estimada', () => {
    const pb = personalBests(exerciseHistory([
      fs({ date: '2026-09-11', exerciseId: 'sq', w: 120, reps: 6, estimated: true }),
      fs({ date: '2026-11-23', exerciseId: 'sq', w: 120, reps: 6, estimated: false, sessionId: 'b' }),
    ], 'sq'))
    expect(pb.w).toMatchObject({ kg: 120, date: '2026-11-23', estimated: false })
  })
  it('unilateral: máximo por lado, izquierda y derecha por separado', () => {
    const u = exerciseHistory(
      [fs({ date: '2026-11-02', exerciseId: 'r', l: 26, r: 20, reps: 8 }), fs({ date: '2026-11-02', exerciseId: 'r', l: 28, r: 20, reps: 8, index: 1 })],
      'r',
    )
    expect(u[0]).toMatchObject({ maxL: 28, maxR: 20, maxW: null, volume: (26 + 20) * 8 + (28 + 20) * 8 })
    const pb = personalBests(u)
    expect(pb.l?.kg).toBe(28)
    expect(pb.r?.kg).toBe(20)
    expect(pb.w).toBeNull()
  })
  it('series sin peso cuentan repeticiones pero no volumen', () => {
    const g = exerciseHistory([fs({ date: '2026-11-02', exerciseId: 'g', reps: 12 })], 'g')
    expect(g[0]).toMatchObject({ maxW: null, volume: 0, totalReps: 12 })
  })
})

describe('volumen semanal por grupo', () => {
  const ex = [{ id: 'sq', muscleGroup: 'Piernas' as const }, { id: 'pb', muscleGroup: 'Pecho' as const }]
  const flat = [
    fs({ date: '2026-11-23', exerciseId: 'sq' }),
    fs({ date: '2026-11-24', exerciseId: 'sq', index: 1 }),
    fs({ date: '2026-11-24', exerciseId: 'sq', index: 2, rir: 5 }), // RIR 5: no efectiva
    fs({ date: '2026-11-24', exerciseId: 'pb', rir: null }), // sin RIR: cuenta
    fs({ date: '2026-11-16', exerciseId: 'pb' }), // semana anterior
    fs({ date: '2026-09-01', exerciseId: 'pb' }), // fuera de ventana
  ]
  const v = weeklyVolume(flat, ex, '2026-11-25', 2)
  it('cuenta series efectivas por semana y grupo', () => {
    expect(v.map((w) => w.weekStart)).toEqual(['2026-11-16', '2026-11-23'])
    expect(v[1].counts).toMatchObject({ Piernas: 2, Pecho: 1, Espalda: 0 })
    expect(v[0].counts.Pecho).toBe(1)
  })
  it('lista los grupos que se quedan cortos frente al objetivo', () => {
    const s = shortGroups(v[1].counts, 10)
    expect(s[0]).toMatchObject({ missing: 10 }) // grupos a 0
    expect(s.find((g) => g.group === 'Piernas')?.missing).toBe(8)
    expect(shortGroups({ ...v[1].counts, Piernas: 12 }, 10).find((g) => g.group === 'Piernas')).toBeUndefined()
  })
})

describe('frecuencia y racha', () => {
  const ses = (date: string, status: Session['status'] = 'cerrada') => ({ date, status, deletedAt: null })
  // semanas (lunes): 09-28: 3, 10-05: 3, 10-12: 2, 10-19: 3, 10-26: 3, 11-02: 3, 11-09: 0, 11-16: 3, 11-23: 1
  const week = (monday: string, n: number) => Array.from({ length: n }, (_, i) => ses(addDays(monday, i)))
  const all = [
    ...week('2026-09-28', 3), ...week('2026-10-05', 3), ...week('2026-10-12', 2), ...week('2026-10-19', 3),
    ...week('2026-10-26', 3), ...week('2026-11-02', 3), ...week('2026-11-16', 3), ...week('2026-11-23', 1),
    ses('2026-11-26', 'en_curso'),
  ]
  it('sesiones por semana en las últimas 8 semanas', () => {
    const f = weeklyFrequency(all, '2026-11-25', 8, 3)
    expect(f.weeks.map((w) => w.count)).toEqual([3, 2, 3, 3, 3, 0, 3, 1])
    expect(f.weeks.at(-1)?.current).toBe(true)
    expect(f.avgPerWeek).toBeCloseTo(18 / 8)
    expect(f.weeksOnTarget).toBe(5)
  })
  it('racha: semana en curso sin completar no la rompe', () => {
    expect(weeklyFrequency(all, '2026-11-25', 8, 3).streak).toBe(1) // 11-16 sí; 11-09 no
  })
  it('racha: la semana en curso suma si ya alcanzó el objetivo', () => {
    expect(weeklyFrequency([...all, ...week('2026-11-23', 3).slice(1)], '2026-11-25', 8, 3).streak).toBe(2)
  })
  it('sin sesiones: todo a cero', () => {
    const f = weeklyFrequency([], '2026-11-25')
    expect(f).toMatchObject({ avgPerWeek: 0, streak: 0, weeksOnTarget: 0 })
    expect(f.weeks).toHaveLength(8)
  })
})

describe('peso corporal: media móvil de 7 días', () => {
  it('promedia las medidas de los 7 días naturales', () => {
    const t = bodyWeightTrend([
      { date: '2026-11-01', kg: 80 }, { date: '2026-11-03', kg: 81 }, { date: '2026-11-07', kg: 82 }, { date: '2026-11-20', kg: 79 },
    ])
    expect(t[0].avg7).toBe(80)
    expect(t[1].avg7).toBe(80.5)
    expect(t[2].avg7).toBe(81) // 11-01..11-07 → 80, 81, 82
    expect(t[3].avg7).toBe(79) // ventana sin otras medidas
  })
  it('ordena, ignora borrados y no calcula IMC', () => {
    const t = bodyWeightTrend([{ date: '2026-11-03', kg: 81 }, { date: '2026-11-01', kg: 80, deletedAt: 'x' }])
    expect(t).toHaveLength(1)
    expect(Object.keys(t[0]).sort()).toEqual(['avg7', 'date', 'kg'])
  })
})
