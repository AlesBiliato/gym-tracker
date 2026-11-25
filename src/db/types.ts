/**
 * Modelo de datos. Todas las entidades son "sync-ready": id UUID generado en
 * cliente, marcas de tiempo, borrado lógico y deviceId, para poder añadir
 * sincronización con Supabase sin rehacer el esquema.
 */
export interface Base {
  id: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  deviceId: string
}

export const MUSCLE_GROUPS = ['Piernas', 'Pecho', 'Espalda', 'Hombro y prevención', 'Brazos', 'Core'] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const LOAD_TYPES = ['barra', 'mancuernas', 'máquina', 'polea', 'peso corporal'] as const
export type LoadType = (typeof LOAD_TYPES)[number]

export interface Exercise extends Base {
  name: string
  muscleGroup: MuscleGroup
  loadType: LoadType
  /** Unilateral: el peso se registra como izquierda/derecha (izquierda primero). */
  unilateral: boolean
  excluded: boolean
  role: 'principal' | 'accesorio'
  /** Incremento al progresar (kg). Si falta, se usa el de Settings según el tipo de carga. */
  incrementKg?: number
  /** Deja muchas agujetas (peso muerto rumano, búlgara). */
  soreness: boolean
  /** Nombres alternativos para normalizar al importar. */
  aliases: string[]
  /** Sustitutos sugeridos. Un sustituto es OTRO ejercicio y no se compara con el original. */
  substituteIds: string[]
}

/** Objetivo/valor de una serie: w (bilateral) o l/r (unilateral, izquierda primero). */
export interface SetTarget {
  w?: number | null
  l?: number | null
  r?: number | null
}

export interface PlanSnapshot {
  sets: number
  repMin: number
  repMax: number
  targets: SetTarget[]
  restSecMin: number
  restSecMax: number
  targetRir: number
  notes: string
  perSide: boolean
}

export interface Template extends Base {
  code: 'A' | 'B' | 'C'
  name: string
  version: number
  validFrom: string // yyyy-mm-dd
  active: boolean
}

export interface TemplateItem extends Base, PlanSnapshot {
  templateId: string
  exerciseId: string
  order: number
  /** Si es un accesorio "durante los descansos", id del TemplateItem principal. */
  pairedWithItemId: string | null
  /** Se puede quitar cuando se llega cargado a un partido (hack squat, curl femoral en C). */
  removableNearMatch: boolean
}

export type SessionMode = 'normal' | 'readaptacion' | 'ajustada'

export interface Session extends Base {
  date: string // yyyy-mm-dd
  templateId: string | null
  templateCode: 'A' | 'B' | 'C' | null
  mode: SessionMode
  status: 'en_curso' | 'cerrada'
  notes: string
  startedAt: string
  endedAt?: string | null
  imported?: boolean
}

export type ExerciseStatus = 'pendiente' | 'hecho' | 'no_hecho' | 'sustituido' | 'parcial'

export interface SessionExercise extends Base {
  sessionId: string
  /** Ejercicio realmente hecho (si se sustituyó, es el sustituto). */
  exerciseId: string
  templateItemId: string | null
  order: number
  /** Si es un accesorio emparejado, id del SessionExercise principal. */
  pairedWithId: string | null
  status: ExerciseStatus
  /** Ejercicio original cuando hay sustitución. */
  substitutedForExerciseId?: string | null
  obs: string
  plan: PlanSnapshot
  /** Texto original del importador, por trazabilidad. */
  importRaw?: string
}

export interface SetLog extends Base {
  sessionExerciseId: string
  index: number
  w?: number | null
  l?: number | null
  r?: number | null
  reps: number | null
  repsL?: number | null
  repsR?: number | null
  rir: number | null
  failed: boolean
  done: boolean
  completedAt?: string | null
  /** Reps/RIR estimados al importar (no se usan para progresión). */
  estimated?: boolean
}

export interface Match extends Base {
  date: string
  time: string
  rival: string
  home: boolean
  departureTime?: string | null
  notes: string
}

export interface BodyWeight extends Base {
  date: string
  kg: number
}

export interface Settings extends Base {
  theme: 'auto' | 'claro' | 'oscuro'
  incrementsKg: Record<LoadType, number>
  targetSetsPerGroup: number
  readaptationAfterDays: number
  readaptationPct: number
  volleyDays: number[] // 0 domingo ... 6 sábado
  gymWeekdays: number[]
}
