import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { newBase } from '../db/base'
import { saveExercise } from '../db/repo'
import { formatKg, parseNumber } from '../domain/format'
import { LOAD_TYPES, MUSCLE_GROUPS, type Exercise } from '../db/types'
import { PageHeader, Sheet, Toggle } from '../components/ui'

const blank = (): Exercise => ({
  ...newBase(), name: '', muscleGroup: 'Piernas', loadType: 'máquina', unilateral: false, excluded: false,
  role: 'principal', soreness: false, aliases: [], substituteIds: [],
})

export default function CatalogPage() {
  const list = useLiveQuery(async () => (await db.exercises.toArray()).filter((e) => !e.deletedAt), [])
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Exercise | null>(null)
  if (!list) return <PageHeader title="Catálogo" />
  const filtered = list.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <PageHeader title="Catálogo" sub={`${list.length} ejercicios`} right={<Link to="/plantillas" className="btn btn-soft btn-sm">Atrás</Link>} />
      <div className="space-y-4 px-4">
        <input className="input" placeholder="Buscar ejercicio…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary w-full" onClick={() => setEdit(blank())}>+ Nuevo ejercicio</button>
        {MUSCLE_GROUPS.map((g) => {
          const items = filtered.filter((e) => e.muscleGroup === g).sort((a, b) => a.name.localeCompare(b.name, 'es'))
          if (!items.length) return null
          return (
            <section key={g}>
              <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">{g}</h2>
              <div className="space-y-2">
                {items.map((e) => (
                  <button key={e.id} onClick={() => setEdit(e)} className={`card flex w-full items-center justify-between text-left ${e.excluded ? 'opacity-50' : ''}`}>
                    <span>
                      <span className="block font-semibold">{e.name}</span>
                      <span className="text-sm text-slate-500">
                        {e.loadType}{e.unilateral ? ' · unilateral (izq./der.)' : ''}{e.soreness ? ' · agujetas' : ''}{e.excluded ? ' · excluido' : ''}
                      </span>
                    </span>
                    <span className="text-slate-400">›</span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {edit && (
        <Sheet open onClose={() => setEdit(null)} title={edit.name || 'Nuevo ejercicio'}>
          <EditForm ex={edit} onSave={async (e) => { await saveExercise(e); setEdit(null) }} />
        </Sheet>
      )}
    </>
  )
}

function EditForm({ ex, onSave }: { ex: Exercise; onSave: (e: Exercise) => void }) {
  const [e, setE] = useState(ex)
  const [inc, setInc] = useState(ex.incrementKg == null ? '' : formatKg(ex.incrementKg))
  const set = (p: Partial<Exercise>) => setE((c) => ({ ...c, ...p }))
  return (
    <div className="space-y-3">
      <div><span className="label">Nombre</span><input className="input" value={e.name} onChange={(x) => set({ name: x.target.value })} /></div>
      <div><span className="label">Grupo muscular</span>
        <select className="input" value={e.muscleGroup} onChange={(x) => set({ muscleGroup: x.target.value as Exercise['muscleGroup'] })}>
          {MUSCLE_GROUPS.map((g) => <option key={g}>{g}</option>)}
        </select></div>
      <div><span className="label">Tipo de carga</span>
        <select className="input" value={e.loadType} onChange={(x) => set({ loadType: x.target.value as Exercise['loadType'] })}>
          {LOAD_TYPES.map((g) => <option key={g}>{g}</option>)}
        </select></div>
      <div><span className="label">Incremento al subir (kg, vacío = el general)</span>
        <input className="input" inputMode="decimal" value={inc} onChange={(x) => setInc(x.target.value)} /></div>
      <Toggle label="Unilateral" hint="Peso izquierda/derecha" checked={e.unilateral} onChange={(unilateral) => set({ unilateral })} />
      <Toggle label="Accesorio" hint="Se hace en los descansos de otro" checked={e.role === 'accesorio'} onChange={(v) => set({ role: v ? 'accesorio' : 'principal' })} />
      <Toggle label="Agujetas altas" checked={e.soreness} onChange={(soreness) => set({ soreness })} />
      <Toggle label="Excluido" hint="Nunca se propone" checked={e.excluded} onChange={(excluded) => set({ excluded })} />
      <button className="btn btn-primary w-full" disabled={!e.name.trim()}
        onClick={() => onSave({ ...e, name: e.name.trim(), incrementKg: parseNumber(inc) ?? undefined })}>Guardar</button>
    </div>
  )
}
