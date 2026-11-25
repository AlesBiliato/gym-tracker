import Dexie, { type Table } from 'dexie'
import type {
  BodyWeight, Exercise, Match, Session, SessionExercise, SetLog, Settings, Template, TemplateItem,
} from './types'

export class GymDB extends Dexie {
  exercises!: Table<Exercise, string>
  templates!: Table<Template, string>
  templateItems!: Table<TemplateItem, string>
  sessions!: Table<Session, string>
  sessionExercises!: Table<SessionExercise, string>
  sets!: Table<SetLog, string>
  matches!: Table<Match, string>
  bodyWeights!: Table<BodyWeight, string>
  settings!: Table<Settings, string>

  constructor(name = 'gym-tracker') {
    super(name)
    this.version(1).stores({
      exercises: 'id, name, muscleGroup, updatedAt',
      templates: 'id, code, active, updatedAt',
      templateItems: 'id, templateId, exerciseId, updatedAt',
      sessions: 'id, date, status, templateCode, updatedAt',
      sessionExercises: 'id, sessionId, exerciseId, updatedAt',
      sets: 'id, sessionExerciseId, updatedAt',
      matches: 'id, date, updatedAt',
      bodyWeights: 'id, date, updatedAt',
      settings: 'id',
    })
  }
}

export const db = new GymDB()
