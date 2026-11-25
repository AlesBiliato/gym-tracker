import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildImport, type RawHistory } from './importer'
import { buildSeed } from '../db/seed'

const FILE = 'data/historial-gimnasio-alessandro.json'
const catalog = buildSeed('2026-01-01').exercises

describe('casos conocidos del historial (fragmentos sintéticos)', () => {
  const run = (ejercicios: object[]) =>
    buildImport({ sesiones: [{ fecha: '2026-01-05', dia: 'A', ejercicios }] } as RawHistory, catalog)

  it('peso "0" = sin peso (no es una carga)', () => {
    const r = run([{ n: 'Gemelos de pie', esq: '3×12', s: '0/0, 0/0, 0/0', fallo: false, obs: '' }])
    expect(r.sets).toHaveLength(3)
    expect(r.sets.every((s) => s.l == null && s.r == null)).toBe(true)
  })
  it('s vacío con "peso no anotado": crea las series previstas sin peso y sin avisos', () => {
    const r = run([{ n: 'Press banca', esq: '3×6', s: '', fallo: false, obs: 'peso no anotado' }])
    expect(r.sets).toHaveLength(3)
    expect(r.sets.every((s) => s.w == null && s.done)).toBe(true)
    expect(r.sessionExercises[0].obs).toBe('peso no anotado')
    expect(r.warnings).toEqual([])
  })
  it('curl femoral con mancuernas 16/16 queda como variante, no como la máquina', () => {
    const r = run([{ n: 'Curl femoral con mancuernas', esq: '3×10', s: '16/16', fallo: false, obs: '' }])
    const ex = catalog.find((e) => e.id === r.sessionExercises[0].exerciseId)!
    expect(ex.name).toBe('Curl femoral con mancuernas')
    expect(r.newExercises).toHaveLength(0)
  })
  it('rumano con mancuernas es distinto del rumano con barra', () => {
    const r = run([
      { n: 'Peso muerto rumano con mancuernas', esq: '3×8', s: '20', fallo: false, obs: '' },
      { n: 'Peso muerto rumano', esq: '3×8', s: '70', fallo: false, obs: '' },
    ])
    const names = r.sessionExercises.map((e) => catalog.find((c) => c.id === e.exerciseId)!.name)
    expect(names).toEqual(['Peso muerto rumano con mancuernas', 'Peso muerto rumano'])
  })
})

describe.skipIf(!existsSync(FILE))('historial real (data/, no versionado)', () => {
  const raw = JSON.parse(existsSync(FILE) ? readFileSync(FILE, 'utf8') : '{}') as RawHistory
  const r = buildImport(raw, catalog)

  it('informe de importación', () => {
    const sinPeso = r.sets.filter((s) => s.w == null && s.l == null && s.r == null).length
    console.log(
      [
        `Sesiones: ${r.stats.sessions}`,
        `Ejercicios: ${r.stats.exercises} (${r.stats.matched} reconocidos, ${r.stats.created} nuevos)`,
        `Series: ${r.sets.length} (sin peso: ${sinPeso}, con reps/RIR reales: ${r.sets.filter((s) => !s.estimated).length})`,
        `Peso corporal: ${r.bodyWeights.length}`,
        `Ejercicios nuevos: ${r.newExercises.map((e) => e.name).join(' | ') || '—'}`,
        `Avisos (${r.warnings.length}):`,
        ...r.warnings.map((w) => ` - ${w}`),
      ].join('\n'),
    )
    expect(r.stats.sessions).toBeGreaterThan(0)
  })
})
