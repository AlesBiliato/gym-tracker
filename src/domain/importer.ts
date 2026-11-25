/**
 * Importador de `historial-gimnasio-alessandro.json`. Funciones puras: reciben el
 * JSON y el catálogo y devuelven entidades listas para guardar + avisos.
 */
import { newBase } from '../db/base'
import type {
  BodyWeight, Exercise, PlanSnapshot, Session, SessionExercise, SetLog, SetTarget,
} from '../db/types'

export interface RawExercise {
  n: string
  esq?: string
  s?: string
  u?: string
  fallo?: boolean
  obs?: string
}
export interface RawSession {
  fecha: string
  dia?: string
  notas?: string
  ejercicios?: RawExercise[]
}
export interface RawHistory {
  sesiones?: RawSession[]
  peso_corporal?: { fecha: string; kg: number }[]
}

export const norm = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Fecha a yyyy-mm-dd. Acepta yyyy-mm-dd, dd/mm/aaaa y dd/mm/aa. */
export function parseDate(s: string): string | null {
  const t = s.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

export function parseScheme(esq: string | undefined): { sets: number; repMin: number; repMax: number } | null {
  if (!esq) return null
  const m = /(\d+)\s*[x×*]\s*(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(esq)
  if (!m) return null
  const repMin = +m[2]
  return { sets: +m[1], repMin, repMax: m[3] ? +m[3] : repMin }
}

const NUM = /\d+(?:[.,]\d{1,2})?/g
const toNum = (s: string) => Number(s.replace(',', '.'))

/**
 * Pesos por serie. "A/B" = izquierda/derecha en unilaterales.
 * - Unilateral: series separadas por "→", ";", "|" o ", "; cada serie "A/B".
 * - Bilateral: cada número es una serie.
 * Devuelve null si no se puede interpretar (se conservará el texto original).
 */
export function parseWeights(s: string | undefined, unilateral: boolean, sets: number): SetTarget[] | null {
  if (!s) return null
  const nums = s.match(NUM)
  if (!nums || nums.length === 0) return null
  if (unilateral) {
    const groups = s.split(/\s*(?:→|->|;|\||,\s+|\s+y\s+)\s*/).filter((g) => g.match(NUM))
    const pairs: SetTarget[] = []
    if (groups.length > 1 || (groups.length === 1 && (groups[0].match(NUM) ?? []).length === 2)) {
      for (const g of groups) {
        const n = (g.match(NUM) ?? []).map(toNum)
        if (n.length === 1) pairs.push({ l: n[0], r: n[0] })
        else pairs.push({ l: n[0], r: n[1] })
      }
    } else {
      const n = nums.map(toNum)
      if (n.length === 1) pairs.push({ l: n[0], r: n[0] })
      else for (let i = 0; i + 1 < n.length; i += 2) pairs.push({ l: n[i], r: n[i + 1] })
    }
    if (pairs.length === 1 && sets > 1) return Array.from({ length: sets }, () => ({ ...pairs[0] }))
    return pairs
  }
  const vals = nums.map(toNum)
  if (vals.length === 1 && sets > 1) return Array.from({ length: sets }, () => ({ w: vals[0] }))
  return vals.map((x) => ({ w: x }))
}

/** Extrae repeticiones reales y RIR del texto libre de observaciones. */
export function parseObs(obs: string | undefined): { pairs: { w: number; reps: number }[]; rir: number | null } {
  const out: { pairs: { w: number; reps: number }[]; rir: number | null } = { pairs: [], rir: null }
  if (!obs) return out
  for (const m of obs.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*[x×]\s*(\d{1,2})\b/gi)) {
    out.pairs.push({ w: toNum(m[1]), reps: +m[2] })
  }
  // "1-2 repeticiones en reserva", "1 RIR", "RIR 2", "RIR 1-2"
  const r1 = /(\d)(?:\s*[-–/]\s*(\d))?\s*(?:rep(?:etici[oó]n(?:es)?|s)?\.?\s*)?(?:en\s+reserva|rir)/i.exec(obs)
  const r2 = /rir\s*[:=]?\s*(\d)(?:\s*[-–/]\s*(\d))?/i.exec(obs)
  const m = r1 ?? r2
  if (m) out.rir = m[2] ? Math.min(+m[1], +m[2]) : +m[1] // con rango, el valor conservador (menor)
  return out
}

export function matchExercise(name: string, catalog: Exercise[]): Exercise | null {
  const n = norm(name)
  for (const e of catalog) if (norm(e.name) === n) return e
  for (const e of catalog) if (e.aliases.some((a) => norm(a) === n)) return e
  return null
}

export interface ImportResult {
  newExercises: Exercise[]
  sessions: Session[]
  sessionExercises: SessionExercise[]
  sets: SetLog[]
  bodyWeights: BodyWeight[]
  warnings: string[]
  stats: { sessions: number; exercises: number; matched: number; created: number; withReps: number }
}

export function templateCodeFrom(dia: string | undefined): 'A' | 'B' | 'C' | null {
  if (!dia) return null
  const m = /(?:^|[^a-záéíóúñ])([abc])(?:[^a-záéíóúñ]|$)/i.exec(dia.trim())
  return m ? (m[1].toUpperCase() as 'A' | 'B' | 'C') : null
}

export function buildImport(raw: RawHistory, catalog: Exercise[]): ImportResult {
  const res: ImportResult = {
    newExercises: [], sessions: [], sessionExercises: [], sets: [], bodyWeights: [], warnings: [],
    stats: { sessions: 0, exercises: 0, matched: 0, created: 0, withReps: 0 },
  }
  const pool = [...catalog]

  for (const rs of raw.sesiones ?? []) {
    const date = parseDate(rs.fecha ?? '')
    if (!date) { res.warnings.push(`Sesión con fecha no válida: "${rs.fecha}"`); continue }
    const code = templateCodeFrom(rs.dia)
    const session: Session = {
      ...newBase(), date, templateId: null, templateCode: code, mode: 'normal', status: 'cerrada',
      notes: [rs.dia && !code ? `Día: ${rs.dia}` : '', rs.notas ?? ''].filter(Boolean).join(' · '),
      startedAt: `${date}T08:00:00.000Z`, endedAt: `${date}T09:00:00.000Z`, imported: true,
    }
    res.sessions.push(session)
    res.stats.sessions++

    ;(rs.ejercicios ?? []).forEach((re, order) => {
      let ex = matchExercise(re.n, pool)
      if (ex) res.stats.matched++
      else {
        ex = {
          ...newBase(), name: re.n.trim(), muscleGroup: 'Piernas', loadType: 'máquina',
          unilateral: /\d\s*\/\s*\d/.test(re.s ?? '') && !/^\s*\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\s*\/\s*\d/.test(re.s ?? ''),
          excluded: false, role: 'principal', soreness: false, aliases: [], substituteIds: [],
        }
        pool.push(ex)
        res.newExercises.push(ex)
        res.stats.created++
        res.warnings.push(`Ejercicio nuevo (revisa grupo y tipo de carga): "${re.n}"`)
      }
      res.stats.exercises++

      const scheme = parseScheme(re.esq)
      const sets = scheme?.sets ?? 3
      let targets = parseWeights(re.s, ex.unilateral, sets)
      if (re.s && !targets) res.warnings.push(`${date} · ${re.n}: no se pudo leer "${re.s}" (guardado como observación)`)
      targets = targets ?? []
      const nSets = Math.max(targets.length, scheme?.sets ?? 0, targets.length ? 0 : 1)
      const obsInfo = parseObs(re.obs)

      const plan: PlanSnapshot = {
        sets: nSets, repMin: scheme?.repMin ?? 0, repMax: scheme?.repMax ?? 0, targets,
        restSecMin: 90, restSecMax: 120, targetRir: 2, notes: '', perSide: false,
      }
      const se: SessionExercise = {
        ...newBase(), sessionId: session.id, exerciseId: ex.id, templateItemId: null, order, pairedWithId: null,
        status: re.fallo ? 'parcial' : 'hecho',
        obs: [re.obs ?? '', re.s && !targets.length ? `Pesos (importado): ${re.s}` : ''].filter(Boolean).join(' · '),
        plan, importRaw: JSON.stringify({ esq: re.esq, s: re.s, u: re.u, fallo: re.fallo }),
      }
      res.sessionExercises.push(se)

      let realReps = false
      targets.forEach((t, i) => {
        const pair = obsInfo.pairs.find((p) => p.w === (t.w ?? t.l ?? t.r))
        const isLast = i === targets.length - 1
        const reps = pair?.reps ?? (scheme ? scheme.repMin : null)
        if (pair) realReps = true
        res.sets.push({
          ...newBase(), sessionExerciseId: se.id, index: i, w: t.w ?? null, l: t.l ?? null, r: t.r ?? null,
          reps, rir: obsInfo.rir ?? null, failed: !!re.fallo && isLast, done: true,
          completedAt: session.endedAt, estimated: !pair || obsInfo.rir == null,
        })
      })
      if (realReps || obsInfo.rir != null) res.stats.withReps++
    })
  }

  for (const bw of raw.peso_corporal ?? []) {
    const date = parseDate(bw.fecha ?? '')
    if (!date || typeof bw.kg !== 'number') { res.warnings.push(`Peso corporal no válido: ${JSON.stringify(bw)}`); continue }
    res.bodyWeights.push({ ...newBase(), date, kg: bw.kg })
  }
  return res
}
