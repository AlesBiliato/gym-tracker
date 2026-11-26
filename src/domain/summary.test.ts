import { describe, expect, it } from 'vitest'
import { buildClaudeSummary, type SummaryInput } from './summary'
import type { Exercise, PlanSnapshot, Session, SessionExercise, SetLog } from '../db/types'

const base = { createdAt: '', updatedAt: '', deviceId: 'd' }
const plan: PlanSnapshot = { sets: 2, repMin: 6, repMax: 8, targets: [], restSecMin: 90, restSecMax: 120, targetRir: 2, notes: '', perSide: false }
const ex = { ...base, id: 'sq', name: 'Sentadilla', muscleGroup: 'Piernas', loadType: 'barra', unilateral: false, role: 'principal' } as Exercise
const session = (id: string, date: string, extra: Partial<Session> = {}) =>
  ({ ...base, id, date, templateId: null, templateCode: 'A', mode: 'normal', status: 'cerrada', notes: '', startedAt: `${date}T10:00:00Z`, endedAt: `${date}T11:05:00Z`, ...extra }) as Session
const sx = (id: string, sessionId: string, extra: Partial<SessionExercise> = {}) =>
  ({ ...base, id, sessionId, exerciseId: 'sq', templateItemId: null, order: 0, pairedWithId: null, status: 'hecho', obs: '', plan, ...extra }) as SessionExercise
const set = (id: string, sessionExerciseId: string, index: number, w: number, reps: number, rir: number) =>
  ({ ...base, id, sessionExerciseId, index, w, reps, rir, failed: false, done: true }) as SetLog

const empty: SummaryInput = { exercises: [], sessions: [], sessionExercises: [], sets: [], bodyWeights: [], matches: [] }

describe('buildClaudeSummary', () => {
  it('sin sesiones lo dice', () => {
    expect(buildClaudeSummary(empty, '2026-11-26')).toContain('Todavía no hay sesiones')
  })

  it('última sesión con la vez anterior y contexto', () => {
    const text = buildClaudeSummary({
      ...empty,
      exercises: [ex],
      sessions: [session('s1', '2026-11-23'), session('s2', '2026-11-25')],
      sessionExercises: [sx('e1', 's1'), sx('e2', 's2', { obs: 'molestia leve' })],
      sets: [set('a', 'e1', 0, 77.5, 8, 2), set('b', 'e2', 0, 80, 8, 2), set('c', 'e2', 1, 80, 7, 1)],
      bodyWeights: [{ ...base, id: 'b1', date: '2026-11-25', kg: 74.2 }],
    }, '2026-11-26')
    expect(text).toContain('Última sesión: miércoles 25/11/26')
    expect(text).toContain('duración 65 min')
    expect(text).toContain('Hecho (2/2 series): 80×8 RIR2, 80×7 RIR1')
    expect(text).toContain('Vez anterior: 23/11/26: 77,5×8 RIR2')
    expect(text).toContain('Obs.: molestia leve')
    expect(text).toContain('Piernas: 0 · 0 · 0 · 3')
    expect(text).toContain('74,2 kg')
  })

  it('avisa si la sesión sigue en curso', () => {
    const text = buildClaudeSummary({
      ...empty, exercises: [ex], sessions: [session('s1', '2026-11-25', { status: 'en_curso', endedAt: null })],
      sessionExercises: [sx('e1', 's1')], sets: [],
    }, '2026-11-26')
    expect(text).toContain('SIN CERRAR')
  })
})
