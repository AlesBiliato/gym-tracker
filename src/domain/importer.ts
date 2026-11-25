/**
 * Importador de `historial-gimnasio-alessandro.json`. Funciones puras: reciben el
 * JSON y el catálogo y devuelven entidades listas para guardar + avisos.
 *
 * Formato real: `s` es una lista con el peso de cada serie ("A/B" = izquierda/derecha),
 * `esq` el esquema previsto ("4×6-8", "3×8/pierna", "3 series", "—"), `dia` el día de
 * la semana (NO A/B/C) y `obs` texto libre con reps/RIR reales cuando se conocen.
 */
import { newBase } from '../db/base'
import type {
  BodyWeight, Exercise, PlanSnapshot, Session, SessionExercise, SetLog, SetTarget,
} from '../db/types'

export interface RawExercise {
  n: string
  esq?: string
  s?: string | string[]
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
  peso_corporal?: { fecha: string; kg: number; origen?: string }[]
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

export interface Scheme { sets: number; repMin: number; repMax: number; perSide: boolean }

/** "4×6-8", "3×8/pierna", "2×12-15/lado", "2-3×15" (usa el mínimo de series), "3 series". "—" -> null */
export function parseScheme(esq: string | undefined): Scheme | null {
  if (!esq) return null
  const perSide = /\b(lado|pierna)\b/i.test(esq)
  let m = /(\d+)(?:\s*-\s*\d+)?\s*[x×*]\s*(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(esq)
  if (m) {
    const repMin = +m[2]
    return { sets: +m[1], repMin, repMax: m[3] ? +m[3] : repMin, perSide }
  }
  m = /(\d+)\s*series/i.exec(esq)
  return m ? { sets: +m[1], repMin: 0, repMax: 0, perSide } : null
}

const NUM = /\d+(?:[.,]\d{1,2})?/g
const toNum = (s: string) => Number(s.replace(',', '.'))
const nz = (t: SetTarget): SetTarget => ({
  ...(t.w !== undefined ? { w: t.w || null } : {}),
  ...(t.l !== undefined ? { l: t.l || null } : {}),
  ...(t.r !== undefined ? { r: t.r || null } : {}),
})

/** Una serie ("16/16", "7,5", "0"). Con un solo número en unilateral, mismo peso en ambos lados. */
function parseSeries(el: string, unilateral: boolean): SetTarget {
  const n = (el.match(NUM) ?? []).map(toNum)
  if (n.length === 0) return {}
  if (n.length === 1) return nz(unilateral ? { l: n[0], r: n[0] } : { w: n[0] })
  if (unilateral) return nz({ l: n[0], r: n[1] })
  // Bilateral con "A/B": iguales = peso por mancuerna/lado; distintos = se conserva izq./der.
  return nz(n[0] === n[1] ? { w: n[0] } : { l: n[0], r: n[1] })
}

/**
 * Pesos por serie. Con lista (formato real) cada elemento es una serie.
 * Con texto: unilateral separa series por "→", ";", "|" o ", "; bilateral: un número por serie.
 * "0" = sin peso (gemelos con peso corporal): no es una carga. Devuelve null si no se puede leer.
 */
export function parseWeights(s: string | string[] | undefined, unilateral: boolean, sets: number): SetTarget[] | null {
  if (Array.isArray(s)) return s.length ? s.map((el) => parseSeries(String(el), unilateral)) : null
  if (!s) return null
  const nums = s.match(NUM)
  if (!nums || nums.length === 0) return null
  if (unilateral) {
    const groups = s.split(/\s*(?:→|->|;|\||,\s+|\s+y\s+)\s*/).filter((g) => g.match(NUM))
    let pairs: SetTarget[]
    if (groups.length > 1 || (groups.length === 1 && (groups[0].match(NUM) ?? []).length === 2)) {
      pairs = groups.map((g) => parseSeries(g, true))
    } else {
      const n = nums.map(toNum)
      pairs = []
      if (n.length === 1) pairs.push(nz({ l: n[0], r: n[0] }))
      else for (let i = 0; i + 1 < n.length; i += 2) pairs.push(nz({ l: n[i], r: n[i + 1] }))
    }
    if (pairs.length === 1 && sets > 1) return Array.from({ length: sets }, () => ({ ...pairs[0] }))
    return pairs
  }
  const vals = nums.map(toNum)
  if (vals.length === 1 && sets > 1) return Array.from({ length: sets }, () => nz({ w: vals[0] }))
  return vals.map((x) => nz({ w: x }))
}

/** Extrae repeticiones reales (peso×reps) y RIR del texto libre de observaciones. */
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
  /** Información no problemática (p. ej. plantilla inferida). */
  notes: string[]
  stats: { sessions: number; exercises: number; matched: number; created: number; withReps: number }
}

/** A/B/C solo si el día es literalmente A, B o C (el historial real trae el día de la semana). */
export function templateCodeFrom(dia: string | undefined): 'A' | 'B' | 'C' | null {
  if (!dia) return null
  const m = /(?:^|[^a-záéíóúñ])([abc])(?:[^a-záéíóúñ]|$)/i.exec(dia.trim())
  return m ? (m[1].toUpperCase() as 'A' | 'B' | 'C') : null
}

/**
 * Plantilla de una sesión: 1) día literal A/B/C, 2) "Sesión X" en las notas,
 * 3) heurística: sentadilla con barra + press banca = A. Si no, null (no se adivina).
 */
export function inferTemplateCode(
  dia: string | undefined, notas: string | undefined, exerciseNames: string[],
): { code: 'A' | 'B' | 'C' | null; inferred: boolean } {
  const direct = templateCodeFrom(dia)
  if (direct) return { code: direct, inferred: false }
  const m = /sesi[oó]n\s+([abc])\b/i.exec(notas ?? '')
  if (m) return { code: m[1].toUpperCase() as 'A' | 'B' | 'C', inferred: false }
  const names = new Set(exerciseNames.map(norm))
  if (names.has('sentadilla') && names.has('press banca')) return { code: 'A', inferred: true }
  return { code: null, inferred: false }
}

const MISSING_WEIGHT = /falta|no qued[oó] anotad/i

export function buildImport(raw: RawHistory, catalog: Exercise[]): ImportResult {
  const res: ImportResult = {
    newExercises: [], sessions: [], sessionExercises: [], sets: [], bodyWeights: [], warnings: [], notes: [],
    stats: { sessions: 0, exercises: 0, matched: 0, created: 0, withReps: 0 },
  }
  const pool = [...catalog]

  for (const rs of raw.sesiones ?? []) {
    const date = parseDate(rs.fecha ?? '')
    if (!date) { res.warnings.push(`Sesión con fecha no válida: "${rs.fecha}"`); continue }
    const { code, inferred } = inferTemplateCode(rs.dia, rs.notas, (rs.ejercicios ?? []).map((e) => e.n))
    if (inferred) res.notes.push(`${date}: plantilla ${code} inferida por los ejercicios`)
    const session: Session = {
      ...newBase(), date, templateId: null, templateCode: code, mode: 'normal', status: 'cerrada',
      notes: rs.notas ?? '',
      startedAt: `${date}T08:00:00.000Z`, endedAt: `${date}T09:00:00.000Z`, imported: true,
    }
    res.sessions.push(session)
    res.stats.sessions++

    ;(rs.ejercicios ?? []).forEach((re, order) => {
      let ex = matchExercise(re.n, pool)
      if (ex) res.stats.matched++
      else {
        const sArr = Array.isArray(re.s) ? re.s : re.s ? [re.s] : []
        ex = {
          ...newBase(), name: re.n.trim(), muscleGroup: 'Piernas', loadType: 'máquina',
          unilateral: /izq/i.test(re.u ?? '') || sArr.some((x) => /^\s*\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\s*$/.test(String(x))),
          excluded: false, role: 'principal', soreness: false, aliases: [], substituteIds: [],
        }
        pool.push(ex)
        res.newExercises.push(ex)
        res.stats.created++
        res.warnings.push(`Ejercicio nuevo (revisa grupo y tipo de carga): "${re.n}"`)
      }
      res.stats.exercises++

      const scheme = parseScheme(re.esq)
      const hasS = Array.isArray(re.s) ? re.s.length > 0 : !!re.s?.trim()
      let targets = hasS ? parseWeights(re.s, ex.unilateral, scheme?.sets ?? 3) : null
      const unreadable = hasS && (!targets || targets.every((t) => Object.keys(t).length === 0))
      if (unreadable) res.warnings.push(`${date} · ${re.n}: no se pudo leer ${JSON.stringify(re.s)} (guardado como observación)`)
      if (!ex.unilateral && targets?.some((t) => t.l != null && t.w == null)) {
        res.warnings.push(`${date} · ${re.n}: ejercicio bilateral con pesos distintos por lado (${JSON.stringify(re.s)}); se conservan izq./der.`)
      }

      const obs = re.obs ?? ''
      const hadWeights = !!targets && !unreadable
      if (!targets || unreadable) {
        // Sin peso (s vacío, "peso no anotado" o ilegible): se crean las series previstas sin peso.
        targets = Array.from({ length: scheme?.sets ?? 1 }, () => ({}))
      } else if (scheme && scheme.sets > targets.length && MISSING_WEIGHT.test(obs)) {
        // Hubo más series que pesos anotados ("falta el peso de la cuarta serie"): se añaden sin peso.
        while (targets.length < scheme.sets) targets.push({})
      }

      const obsInfo = parseObs(obs)
      const plan: PlanSnapshot = {
        sets: targets.length, repMin: scheme?.repMin ?? 0, repMax: scheme?.repMax ?? 0, targets,
        restSecMin: 90, restSecMax: 120, targetRir: 2, notes: '', perSide: !!scheme?.perSide,
      }
      const se: SessionExercise = {
        ...newBase(), sessionId: session.id, exerciseId: ex.id, templateItemId: null, order, pairedWithId: null,
        status: re.fallo ? 'parcial' : 'hecho',
        obs: [obs, unreadable ? `Pesos (importado): ${JSON.stringify(re.s)}` : ''].filter(Boolean).join(' · '),
        plan, importRaw: JSON.stringify({ esq: re.esq, s: re.s, u: re.u, fallo: re.fallo }),
      }
      res.sessionExercises.push(se)

      let real = false
      targets.forEach((t, i) => {
        const load = t.w ?? t.l ?? t.r
        // Las reps/RIR de la observación solo se atribuyen a la serie con ese peso.
        const pair = hadWeights && load != null ? obsInfo.pairs.find((p) => p.w === load) : undefined
        const isLast = i === targets.length - 1
        const reps = pair?.reps ?? (scheme && scheme.repMin ? scheme.repMin : null)
        const rir = pair ? obsInfo.rir : null
        if (pair) real = true
        res.sets.push({
          ...newBase(), sessionExerciseId: se.id, index: i, w: t.w ?? null, l: t.l ?? null, r: t.r ?? null,
          reps, rir, failed: !!re.fallo && isLast, done: true, completedAt: session.endedAt,
          estimated: !pair,
        })
      })
      if (real) res.stats.withReps++
    })
  }

  for (const bw of raw.peso_corporal ?? []) {
    const date = parseDate(bw.fecha ?? '')
    if (!date || typeof bw.kg !== 'number') { res.warnings.push(`Peso corporal no válido: ${JSON.stringify(bw)}`); continue }
    res.bodyWeights.push({ ...newBase(), date, kg: bw.kg, ...(bw.origen ? { note: bw.origen } : {}) })
  }
  return res
}
