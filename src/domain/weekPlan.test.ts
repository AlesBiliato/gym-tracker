import { describe, expect, it } from 'vitest'
import { planWeek, type WeekPlanInput } from './weekPlan'

const match = (date: string, importance?: 'facil' | 'normal' | 'importante') => ({ date, time: '12:00', rival: 'Sóller', importance })
// 2026-11-25 es miércoles; el sábado es el 28.
const base = (over: Partial<WeekPlanInput> = {}): WeekPlanInput => ({
  today: '2026-11-25', matches: [], legSetsThisWeek: 0, targetSetsPerGroup: 10, ...over,
})

describe('planWeek', () => {
  it('sin partidos pide registrarlo', () => {
    const p = planWeek(base())
    expect(p.needsCheckIn).toBe(true)
    expect(p.nextMatch).toBeNull()
    expect(p.avoidHeavyLegs).toBe(false)
  })

  it('un partido esta semana ya no pide check-in', () => {
    expect(planWeek(base({ matches: [match('2026-11-28')] })).needsCheckIn).toBe(false)
  })

  it('un partido de la semana que viene sí lo pide para esta', () => {
    expect(planWeek(base({ matches: [match('2026-12-05')] })).needsCheckIn).toBe(true)
  })

  it('normal: evita piernas a 2 días, no a 3', () => {
    expect(planWeek(base({ today: '2026-11-26', matches: [match('2026-11-28')] })).avoidHeavyLegs).toBe(true)
    const p = planWeek(base({ today: '2026-11-25', matches: [match('2026-11-28')] }))
    expect(p.avoidHeavyLegs).toBe(false)
    expect(p.advice[0].text).toContain('hasta el miércoles 25/11/26') // 28 − (2+1) = 25
  })

  it('importante: protege 3 días; fácil: solo 1', () => {
    expect(planWeek(base({ matches: [match('2026-11-28', 'importante')] })).avoidHeavyLegs).toBe(true)
    expect(planWeek(base({ today: '2026-11-26', matches: [match('2026-11-28', 'facil')] })).avoidHeavyLegs).toBe(false)
    expect(planWeek(base({ today: '2026-11-27', matches: [match('2026-11-28', 'facil')] })).avoidHeavyLegs).toBe(true)
  })

  it('el día del partido no se hace fuerza de piernas', () => {
    const p = planWeek(base({ today: '2026-11-28', matches: [match('2026-11-28')] }))
    expect(p.avoidHeavyLegs).toBe(true)
    expect(p.advice[0].level).toBe('alto')
  })

  it('avisa si ya hay mucho volumen de piernas', () => {
    const p = planWeek(base({ matches: [match('2026-11-28')], legSetsThisWeek: 19 }))
    expect(p.advice.some((a) => a.text.includes('19 series de piernas'))).toBe(true)
  })

  it('ignora partidos borrados y pasados', () => {
    const p = planWeek(base({ matches: [{ ...match('2026-11-28'), deletedAt: 'x' }, match('2026-11-20')] }))
    expect(p.nextMatch).toBeNull()
  })
})

import { adjustSession, MAX_SETS, type ItemInfo } from './weekPlan'

describe('adjustSession', () => {
  const it_ = (id: string, group: ItemInfo['group'], role: ItemInfo['role'], sets = 3, removableNearMatch = false): ItemInfo =>
    ({ id, group, role, sets, removableNearMatch })
  const items = [
    it_('sent', 'Piernas', 'principal'), it_('hack', 'Piernas', 'accesorio', 3, true), it_('gem', 'Piernas', 'accesorio'),
    it_('press', 'Pecho', 'principal'), it_('curl', 'Brazos', 'accesorio'),
  ]
  const none = { avoidHeavyLegs: false, volumeBoost: false, legsHigh: false }

  it('sin condiciones no cambia nada', () => {
    expect(adjustSession(items, none)).toEqual([])
  })

  it('cerca del partido quita piernas principales y quitables, y deja el resto', () => {
    const r = adjustSession(items, { ...none, avoidHeavyLegs: true })
    expect(r.map((a) => [a.itemId, a.kind])).toEqual([['sent', 'quitar'], ['hack', 'quitar']])
  })

  it('semana holgada: +1 serie solo en principales', () => {
    const r = adjustSession(items, { ...none, volumeBoost: true })
    expect(r.map((a) => [a.itemId, a.sets])).toEqual([['sent', 4], ['press', 4]])
  })

  it('no suma piernas si ya hay mucho volumen, ni pasa del tope de series', () => {
    const r = adjustSession([...items, it_('max', 'Espalda', 'principal', MAX_SETS)], { ...none, volumeBoost: true, legsHigh: true })
    expect(r.map((a) => a.itemId)).toEqual(['press'])
  })
})
