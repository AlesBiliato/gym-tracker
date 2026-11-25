import { newBase } from './base'
import type { GymDB } from './db'
import type {
  Exercise, LoadType, MuscleGroup, Settings, SetTarget, Template, TemplateItem,
} from './types'

type ExDef = {
  name: string
  g: MuscleGroup
  load: LoadType
  uni?: boolean
  role?: 'principal' | 'accesorio'
  soreness?: boolean
  excluded?: boolean
  aliases?: string[]
  increment?: number
}

const EX_DEFS: ExDef[] = [
  { name: 'Sentadilla', g: 'Piernas', load: 'barra', aliases: ['sentadilla trasera', 'squat', 'sentadilla con barra'] },
  { name: 'Sentadilla búlgara', g: 'Piernas', load: 'mancuernas', uni: true, soreness: true, aliases: ['bulgara', 'búlgara', 'sentadilla bulgara'] },
  { name: 'Peso muerto rumano', g: 'Piernas', load: 'barra', soreness: true, aliases: ['rumano', 'pmr', 'peso muerto rumano con barra'] },
  { name: 'Hack squat', g: 'Piernas', load: 'máquina', aliases: ['hack', 'sentadilla hack'] },
  { name: 'Curl femoral unilateral', g: 'Piernas', load: 'máquina', uni: true, aliases: ['curl femoral unilateral en máquina', 'curl femoral unilateral (máquina)', 'curl femoral', 'femoral'] },
  { name: 'Curl femoral con mancuernas', g: 'Piernas', load: 'mancuernas', uni: true, aliases: ['curl femoral con mancuerna'] },
  { name: 'Extensión de cuádriceps', g: 'Piernas', load: 'máquina', aliases: ['extension de cuadriceps', 'extensiones de cuádriceps', 'cuádriceps'] },
  { name: 'Gemelos de pie', g: 'Piernas', load: 'mancuernas', uni: true, role: 'accesorio', aliases: ['gemelos', 'gemelo de pie', 'elevación de gemelos'] },
  { name: 'Sóleo sentado', g: 'Piernas', load: 'máquina', role: 'accesorio', aliases: ['soleo', 'sóleo', 'soleo sentado'] },
  { name: 'Press banca', g: 'Pecho', load: 'barra', aliases: ['banca', 'press de banca', 'bench press'] },
  { name: 'Press inclinado con mancuernas', g: 'Pecho', load: 'mancuernas', aliases: ['press inclinado', 'inclinado con mancuernas', 'press inclinado mancuernas'] },
  { name: 'Jalón en máquina', g: 'Espalda', load: 'máquina', aliases: ['jalon en maquina', 'jalón', 'jalon', 'jalón al pecho'] },
  { name: 'Jalón unilateral', g: 'Espalda', load: 'polea', uni: true, aliases: ['jalon unilateral'] },
  { name: 'Remo con mancuerna en banco', g: 'Espalda', load: 'mancuernas', uni: true, aliases: ['remo con mancuerna', 'remo mancuerna', 'remo unilateral con mancuerna'] },
  { name: 'Remo unilateral en polea', g: 'Espalda', load: 'polea', uni: true, aliases: ['remo en polea', 'remo polea unilateral'] },
  { name: 'Remo con pecho apoyado unilateral', g: 'Espalda', load: 'máquina', uni: true, aliases: ['remo pecho apoyado', 'remo con pecho apoyado', 'remo apoyado unilateral'] },
  { name: 'Elevaciones laterales en polea', g: 'Hombro y prevención', load: 'polea', uni: true, role: 'accesorio', aliases: ['elevaciones laterales', 'laterales en polea', 'elevación lateral en polea'] },
  { name: 'Reverse fly en polea', g: 'Hombro y prevención', load: 'polea', uni: true, role: 'accesorio', aliases: ['reverse fly', 'pájaros en polea', 'pajaros en polea'] },
  { name: 'Rotaciones externas', g: 'Hombro y prevención', load: 'polea', uni: true, role: 'accesorio', aliases: ['rotación externa', 'rotaciones externas en polea', 'rotacion externa'] },
  { name: 'Tríceps en polea', g: 'Brazos', load: 'polea', role: 'accesorio', aliases: ['triceps en polea', 'tríceps polea', 'triceps', 'extensión de tríceps en polea'] },
  { name: 'Pallof press', g: 'Core', load: 'polea', uni: true, role: 'accesorio', aliases: ['pallof'] },
  { name: 'Dead bug', g: 'Core', load: 'peso corporal', role: 'accesorio', aliases: ['deadbug'] },
  // Excluidos (nunca se proponen; se conservan por si aparecen al importar).
  { name: 'Face pull', g: 'Hombro y prevención', load: 'polea', role: 'accesorio', excluded: true, aliases: ['face pulls'] },
  { name: 'Press militar', g: 'Hombro y prevención', load: 'barra', excluded: true, aliases: ['press de hombro', 'press vertical'] },
  { name: 'Serratus punch', g: 'Hombro y prevención', load: 'polea', role: 'accesorio', excluded: true, aliases: ['serratus'] },
]

const SUBSTITUTES: Record<string, string[]> = {
  'Curl femoral unilateral': ['Curl femoral con mancuernas'],
  'Curl femoral con mancuernas': ['Curl femoral unilateral'],
  'Jalón en máquina': ['Jalón unilateral'],
  'Jalón unilateral': ['Jalón en máquina'],
  'Remo con mancuerna en banco': ['Remo unilateral en polea', 'Remo con pecho apoyado unilateral'],
  'Remo unilateral en polea': ['Remo con mancuerna en banco', 'Remo con pecho apoyado unilateral'],
  'Remo con pecho apoyado unilateral': ['Remo unilateral en polea', 'Remo con mancuerna en banco'],
}

export const DEFAULT_SETTINGS = {
  theme: 'auto' as const,
  incrementsKg: { barra: 2.5, mancuernas: 2, máquina: 2.5, polea: 2.5, 'peso corporal': 0 } as Record<LoadType, number>,
  targetSetsPerGroup: 10,
  readaptationAfterDays: 10,
  readaptationPct: 0.875,
  volleyDays: [1, 2, 4],
  gymWeekdays: [] as number[],
}

const w = (...ws: number[]): SetTarget[] => ws.map((x) => ({ w: x }))
const lr = (...ps: [number, number][]): SetTarget[] => ps.map(([l, r]) => ({ l, r }))
const none = (n: number): SetTarget[] => Array.from({ length: n }, () => ({}))

interface ItemDef {
  ex: string
  sets: number
  reps: [number, number]
  targets: SetTarget[]
  rest: [number, number]
  rir: number
  notes?: string
  perSide?: boolean
  parent?: string // nombre del ejercicio principal bajo el que se anida
  removable?: boolean
}

const TEMPLATES: { code: 'A' | 'B' | 'C'; name: string; items: ItemDef[] }[] = [
  {
    code: 'A',
    name: 'Sentadilla y empuje horizontal',
    items: [
      { ex: 'Sentadilla', sets: 4, reps: [6, 6], targets: w(80, 100, 115, 115), rest: [120, 180], rir: 2 },
      { ex: 'Gemelos de pie', sets: 3, reps: [12, 15], targets: lr([8, 8], [8, 8], [8, 8]), rest: [60, 90], rir: 2, parent: 'Sentadilla' },
      { ex: 'Press banca', sets: 3, reps: [6, 6], targets: w(62.5, 62.5, 62.5), rest: [120, 180], rir: 2 },
      { ex: 'Rotaciones externas', sets: 2, reps: [12, 12], targets: lr([2.5, 2.5], [2.5, 2.5]), rest: [60, 90], rir: 2, perSide: true, notes: 'Ligeras', parent: 'Press banca' },
      { ex: 'Jalón en máquina', sets: 3, reps: [8, 10], targets: w(40, 40, 40), rest: [120, 120], rir: 2 },
      { ex: 'Curl femoral unilateral', sets: 3, reps: [10, 10], targets: lr([7.5, 7.5], [10, 10], [10, 10]), rest: [60, 90], rir: 2 },
      { ex: 'Elevaciones laterales en polea', sets: 3, reps: [12, 15], targets: lr([2.5, 2.5], [2.5, 2.5], [2.5, 2.5]), rest: [60, 90], rir: 2 },
    ],
  },
  {
    code: 'B',
    name: 'Rumano y unilateral',
    items: [
      { ex: 'Peso muerto rumano', sets: 3, reps: [8, 8], targets: w(70, 85, 85), rest: [120, 180], rir: 2 },
      { ex: 'Pallof press', sets: 2, reps: [10, 10], targets: none(2), rest: [60, 90], rir: 2, perSide: true, parent: 'Peso muerto rumano' },
      { ex: 'Press inclinado con mancuernas', sets: 3, reps: [8, 8], targets: w(18, 18, 18), rest: [120, 120], rir: 2 },
      { ex: 'Sentadilla búlgara', sets: 3, reps: [8, 8], targets: lr([8, 8], [8, 8], [8, 8]), rest: [90, 120], rir: 2, perSide: true },
      { ex: 'Remo con mancuerna en banco', sets: 3, reps: [8, 8], targets: lr([26, 20], [28, 20], [28, 20]), rest: [90, 120], rir: 2 },
      { ex: 'Tríceps en polea', sets: 3, reps: [10, 12], targets: w(18.25, 18.25, 18.25), rest: [60, 90], rir: 2 },
      { ex: 'Gemelos de pie', sets: 3, reps: [12, 15], targets: lr([8, 8], [8, 8], [8, 8]), rest: [60, 90], rir: 2, parent: 'Tríceps en polea' },
    ],
  },
  {
    code: 'C',
    name: 'Ligera (cerca del partido)',
    items: [
      { ex: 'Hack squat', sets: 2, reps: [10, 10], targets: w(60, 60), rest: [120, 120], rir: 3, removable: true },
      { ex: 'Jalón unilateral', sets: 3, reps: [10, 10], targets: lr([30, 20], [35, 25], [35, 25]), rest: [90, 90], rir: 3 },
      { ex: 'Press banca', sets: 2, reps: [8, 8], targets: w(55, 55), rest: [120, 120], rir: 3 },
      { ex: 'Remo con pecho apoyado unilateral', sets: 3, reps: [10, 10], targets: lr([30, 20], [35, 25], [35, 25]), rest: [90, 90], rir: 3 },
      { ex: 'Curl femoral unilateral', sets: 2, reps: [12, 12], targets: lr([7.5, 7.5], [7.5, 7.5]), rest: [60, 90], rir: 3, removable: true },
      { ex: 'Sóleo sentado', sets: 3, reps: [15, 15], targets: none(3), rest: [60, 90], rir: 3, notes: 'Sin referencia todavía: anota el peso la primera vez', parent: 'Curl femoral unilateral' },
      { ex: 'Elevaciones laterales en polea', sets: 2, reps: [15, 15], targets: lr([2.5, 2.5], [2.5, 2.5]), rest: [60, 90], rir: 3, notes: 'Alternar series con Reverse fly' },
      { ex: 'Reverse fly en polea', sets: 2, reps: [15, 15], targets: lr([2.5, 2.5], [2.5, 2.5]), rest: [60, 90], rir: 3, notes: 'Alternar series con Elevaciones laterales' },
      { ex: 'Dead bug', sets: 2, reps: [8, 8], targets: none(2), rest: [45, 60], rir: 3, perSide: true },
    ],
  },
]

export interface SeedData {
  exercises: Exercise[]
  templates: Template[]
  templateItems: TemplateItem[]
  settings: Settings
}

export function buildSeed(today: string): SeedData {
  const exercises: Exercise[] = EX_DEFS.map((d) => ({
    ...newBase(),
    name: d.name,
    muscleGroup: d.g,
    loadType: d.load,
    unilateral: !!d.uni,
    excluded: !!d.excluded,
    role: d.role ?? 'principal',
    incrementKg: d.increment,
    soreness: !!d.soreness,
    aliases: d.aliases ?? [],
    substituteIds: [],
  }))
  const byName = new Map(exercises.map((e) => [e.name, e]))
  for (const [name, subs] of Object.entries(SUBSTITUTES)) {
    byName.get(name)!.substituteIds = subs.map((s) => byName.get(s)!.id)
  }

  const templates: Template[] = []
  const templateItems: TemplateItem[] = []
  for (const t of TEMPLATES) {
    const tpl: Template = { ...newBase(), code: t.code, name: t.name, version: 1, validFrom: today, active: true }
    templates.push(tpl)
    const idByEx = new Map<string, string>()
    const items = t.items.map((d, i) => {
      const it: TemplateItem = {
        ...newBase(),
        templateId: tpl.id,
        exerciseId: byName.get(d.ex)!.id,
        order: i,
        sets: d.sets,
        repMin: d.reps[0],
        repMax: d.reps[1],
        targets: d.targets,
        restSecMin: d.rest[0],
        restSecMax: d.rest[1],
        targetRir: d.rir,
        notes: d.notes ?? '',
        perSide: !!d.perSide,
        pairedWithItemId: null,
        removableNearMatch: !!d.removable,
      }
      idByEx.set(d.ex, it.id)
      return it
    })
    t.items.forEach((d, i) => {
      if (d.parent) items[i].pairedWithItemId = idByEx.get(d.parent)!
    })
    templateItems.push(...items)
  }

  const settings: Settings = { ...newBase(), id: 'settings', ...DEFAULT_SETTINGS }
  return { exercises, templates, templateItems, settings }
}

export async function ensureSeed(db: GymDB, today: string): Promise<boolean> {
  if ((await db.exercises.count()) > 0) return false
  const s = buildSeed(today)
  await db.transaction('rw', [db.exercises, db.templates, db.templateItems, db.settings], async () => {
    await db.exercises.bulkAdd(s.exercises)
    await db.templates.bulkAdd(s.templates)
    await db.templateItems.bulkAdd(s.templateItems)
    await db.settings.put(s.settings)
  })
  return true
}
