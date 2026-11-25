import { describe, expect, it } from 'vitest'
import { buildImport, type RawHistory } from './importer'
import { buildSeed } from '../db/seed'

/**
 * Fragmento de historial-gimnasio-alessandro.json: entradas reales, recortadas y
 * agrupadas en pocas sesiones (algunas fechas se han reasignado). Cubre los casos
 * difíciles del formato: `s` como lista, "N" y "N/N" mezclados, pesos "0", series sin
 * peso, variantes y observaciones con reps/RIR. El archivo completo vive en data/ (ignorado).
 */
const FRAGMENT: RawHistory = {
  sesiones: [
    {
      fecha: '2026-09-11', dia: 'Viernes', notas: '',
      ejercicios: [
        { n: 'Sentadilla', esq: '4×6-8', s: ['90', '110', '120'], u: 'kg', fallo: false, obs: 'Falta el peso de la cuarta serie.' },
        { n: 'Extensión de cuádriceps', esq: '3×12-15', s: ['5,5', '5,5', '7,5/7,5'], u: 'kg', fallo: false, obs: 'Anotación original ambigua.' },
      ],
    },
    {
      fecha: '2026-09-18', dia: 'Viernes', notas: '',
      ejercicios: [
        { n: 'Rotaciones externas', esq: '2×12-15/lado', s: [], u: 'kg', fallo: false, obs: 'Realizadas; peso no anotado.' },
        { n: 'Face pulls', esq: '2-3×15', s: ['2,5'], u: 'kg', fallo: false, obs: 'Número de series no anotado.' },
      ],
    },
    {
      fecha: '2026-11-04', dia: 'Miércoles', notas: '',
      ejercicios: [
        { n: 'Sentadilla búlgara', esq: '2×8/pierna', s: ['8/8', '8/8'], u: 'kg izq./der.', fallo: false, obs: '8 kg por mancuerna.' },
        { n: 'Curl femoral con mancuernas', esq: '2×10', s: ['16/16', '16/16'], u: 'kg izq./der.', fallo: false, obs: 'Máquina no disponible: dos mancuernas de 8 kg por pierna. No comparable con la máquina.' },
      ],
    },
    {
      fecha: '2026-11-23', dia: 'Lunes', notas: 'Sesión A.',
      ejercicios: [
        { n: 'Sentadilla', esq: '4×6', s: ['80', '100', '110', '120'], u: 'kg', fallo: false, obs: 'Plan: 70/90/100/100. 120×6 con 1-2 repeticiones en reserva. Se asume 6 repeticiones en el resto.' },
        { n: 'Gemelos de pie', esq: '3×12-15', s: ['0', '0', '0'], u: 'kg', fallo: false, obs: 'Sin peso, durante los descansos de la sentadilla.' },
        { n: 'Press banca', esq: '4×6', s: ['60', '60', '70', '65'], u: 'kg', fallo: true, obs: 'No completó las repeticiones de la última serie.' },
        { n: 'Remo pecho apoyado unilateral', esq: '3×10', s: ['30/20', '35/25', '35/25'], u: 'kg izq./der.', fallo: false, obs: '' },
        { n: 'Press inclinado con mancuernas', esq: '3×8', s: ['16/16', '16/16', '16/16'], u: 'kg izq./der.', fallo: false, obs: '' },
        { n: 'Peso muerto rumano con mancuernas', esq: '3×8', s: ['10/10', '10/10', '10/10'], u: 'kg izq./der.', fallo: false, obs: '' },
      ],
    },
  ],
  // Valor inventado: el peso corporal real no se versiona.
  peso_corporal: [{ fecha: '2026-11-04', kg: 80.5, origen: 'Báscula' }],
}

describe('importador con fragmento real', () => {
  const catalog = buildSeed('2026-01-01').exercises
  const r = buildImport(FRAGMENT, catalog)
  const name = (id: string) => catalog.find((c) => c.id === id)?.name
  const sets = (sesDate: string, ex: string) => {
    const s = r.sessions.find((x) => x.date === sesDate)!
    const se = r.sessionExercises.find((e) => e.sessionId === s.id && name(e.exerciseId) === ex)!
    return r.sets.filter((x) => x.sessionExerciseId === se.id).sort((a, b) => a.index - b.index)
  }

  it('reconoce todo el catálogo y no crea ejercicios nuevos ni avisos', () => {
    expect(r.newExercises).toEqual([])
    expect(r.warnings).toEqual([])
  })
  it('no usa el día de la semana ni adivina por ejercicios; solo "Sesión X" de las notas', () => {
    expect(r.sessions.map((s) => s.templateCode)).toEqual([null, null, null, 'A'])
  })
  it('serie sin peso anotado: se crea con peso vacío (falta la 4.ª serie de sentadilla)', () => {
    const s = sets('2026-09-11', 'Sentadilla')
    expect(s.map((x) => x.w)).toEqual([90, 110, 120, null])
  })
  it('mezcla de "N" y "N/N" en bilateral: 7,5/7,5 = 7,5', () => {
    expect(sets('2026-09-11', 'Extensión de cuádriceps').map((x) => x.w)).toEqual([5.5, 5.5, 7.5])
  })
  it('s vacío crea las series previstas sin peso', () => {
    expect(sets('2026-09-18', 'Rotaciones externas')).toHaveLength(2)
    expect(sets('2026-09-18', 'Rotaciones externas').every((x) => x.l == null && x.r == null)).toBe(true)
  })
  it('unilateral conserva izquierda primero', () => {
    expect(sets('2026-11-04', 'Sentadilla búlgara').map((x) => [x.l, x.r])).toEqual([[8, 8], [8, 8]])
    expect(sets('2026-11-23', 'Remo con pecho apoyado unilateral').map((x) => [x.l, x.r])).toEqual([[30, 20], [35, 25], [35, 25]])
  })
  it('variantes: curl con mancuernas y rumano con mancuernas son ejercicios distintos', () => {
    expect(sets('2026-11-04', 'Curl femoral con mancuernas')).toHaveLength(2)
    expect(sets('2026-11-23', 'Peso muerto rumano con mancuernas').map((x) => x.w)).toEqual([10, 10, 10])
    expect(sets('2026-11-23', 'Press inclinado con mancuernas').map((x) => x.w)).toEqual([16, 16, 16])
  })
  it('gemelos con "0" = sin peso', () => {
    expect(sets('2026-11-23', 'Gemelos de pie').every((x) => x.l == null && x.r == null && x.w == null)).toBe(true)
  })
  it('extrae reps y RIR de la observación solo en la serie con ese peso', () => {
    const s = sets('2026-11-23', 'Sentadilla')
    expect(s.map((x) => x.rir)).toEqual([null, null, null, 1])
    expect(s[3]).toMatchObject({ w: 120, reps: 6, estimated: false })
    expect(s[0]).toMatchObject({ w: 80, reps: 6, estimated: true })
  })
  it('fallo marca solo la última serie', () => {
    expect(sets('2026-11-23', 'Press banca').map((x) => x.failed)).toEqual([false, false, false, true])
  })
  it('peso corporal conserva el origen', () => {
    expect(r.bodyWeights[0]).toMatchObject({ date: '2026-11-04', kg: 80.5, note: 'Báscula' })
  })
})
