import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { newBase, now } from '../db/base'
import { deleteTemplateItem, saveTemplateItem } from '../db/repo'
import { formatRest, formatTarget } from '../domain/format'
import { orderItems, repsLabel } from '../domain/sessionPlan'
import type { Exercise, TemplateItem } from '../db/types'
import { NumField, PageHeader, Sheet, Toggle } from '../components/ui'

export default function TemplateEditorPage() {
  const { id = '' } = useParams()
  const tpl = useLiveQuery(() => db.templates.get(id), [id])
  const items = useLiveQuery(() => db.templateItems.where('templateId').equals(id).toArray(), [id])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const [edit, setEdit] = useState<TemplateItem | null>(null)
  const [adding, setAdding] = useState(false)
  if (!tpl || !items || !exercises) return <PageHeader title="Plantilla" />

  const ex = (eid: string) => exercises.find((e) => e.id === eid)!
  const ordered = orderItems(items.filter((i) => !i.deletedAt))
  const mains = ordered.filter((i) => !i.pairedWithItemId)

  const move = async (it: TemplateItem, dir: -1 | 1) => {
    const group = ordered.filter((i) => i.pairedWithItemId === it.pairedWithItemId)
    const pos = group.findIndex((g) => g.id === it.id)
    const other = group[pos + dir]
    if (!other) return
    await db.transaction('rw', db.templateItems, async () => {
      await db.templateItems.update(it.id, { order: other.order, updatedAt: now() })
      await db.templateItems.update(other.id, { order: it.order, updatedAt: now() })
    })
  }

  const add = async (e: Exercise) => {
    const it: TemplateItem = {
      ...newBase(), templateId: id, exerciseId: e.id, order: Math.max(-1, ...items.map((i) => i.order)) + 1,
      sets: 3, repMin: 8, repMax: 10, targets: [], restSecMin: 90, restSecMax: 120, targetRir: 2, notes: '',
      perSide: false, pairedWithItemId: null, removableNearMatch: false,
    }
    await saveTemplateItem(it)
    setAdding(false)
    setEdit(it)
  }

  return (
    <>
      <PageHeader title={`Plantilla ${tpl.code}`} sub={`${tpl.name} · v${tpl.version}${tpl.active ? '' : ' (anterior)'}`}
        right={<Link to="/plantillas" className="btn btn-soft btn-sm">Atrás</Link>} />
      <div className="space-y-2 px-4">
        {ordered.map((it) => {
          const e = ex(it.exerciseId)
          const siblings = ordered.filter((i) => i.pairedWithItemId === it.pairedWithItemId)
          const pos = siblings.findIndex((s) => s.id === it.id)
          return (
            <div key={it.id} className={`card ${it.pairedWithItemId ? 'ml-5 border-l-4 border-sky-300 dark:border-sky-800' : ''}`}>
              <button className="w-full text-left" onClick={() => setEdit(it)}>
                <span className="block text-lg font-bold">{e.name}</span>
                <span className="block text-sm text-slate-500">
                  {it.sets}×{repsLabel(it)} · RIR {it.targetRir} · {formatRest(it.restSecMin)}–{formatRest(it.restSecMax)}
                </span>
                <span className="block text-sm tabular-nums text-slate-500">
                  {it.targets.length ? it.targets.map((t) => formatTarget(t, e.unilateral)).join(' → ') + ' kg' : 'Sin peso objetivo'}
                </span>
                {it.removableNearMatch && <span className="text-xs font-semibold text-amber-500">Se puede quitar cerca del partido</span>}
              </button>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-soft btn-sm flex-1" disabled={pos === 0} onClick={() => move(it, -1)}>↑</button>
                <button className="btn btn-soft btn-sm flex-1" disabled={pos === siblings.length - 1} onClick={() => move(it, 1)}>↓</button>
                <button className="btn btn-soft btn-sm flex-[2]" onClick={() => setEdit(it)}>Editar</button>
              </div>
            </div>
          )
        })}
        <button className="btn btn-primary w-full" onClick={() => setAdding(true)}>+ Añadir ejercicio</button>
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Añadir ejercicio">
        <div className="grid gap-2">
          {exercises.filter((e) => !e.excluded && !e.deletedAt).sort((a, b) => a.name.localeCompare(b.name, 'es')).map((e) => (
            <button key={e.id} className="btn btn-soft justify-between" onClick={() => add(e)}>
              <span className="text-left">{e.name}</span><span className="text-sm font-normal text-slate-500">{e.muscleGroup}</span>
            </button>
          ))}
        </div>
      </Sheet>

      {edit && (
        <ItemEditor
          item={edit} exercise={ex(edit.exerciseId)} mains={mains.filter((m) => m.id !== edit.id)} nameOf={(i) => ex(i.exerciseId).name}
          onClose={() => setEdit(null)}
          onSave={async (it) => { await saveTemplateItem(it); setEdit(null) }}
          onDelete={async () => { if (confirm('¿Quitar este ejercicio de la plantilla?')) { await deleteTemplateItem(edit.id); setEdit(null) } }}
        />
      )}
    </>
  )
}

function ItemEditor({
  item, exercise, mains, nameOf, onClose, onSave, onDelete,
}: {
  item: TemplateItem; exercise: Exercise; mains: TemplateItem[]; nameOf: (i: TemplateItem) => string
  onClose: () => void; onSave: (i: TemplateItem) => void; onDelete: () => void
}) {
  const [it, setIt] = useState<TemplateItem>(item)
  const set = (p: Partial<TemplateItem>) => setIt((c) => ({ ...c, ...p }))
  const uni = exercise.unilateral
  const targets = Array.from({ length: it.sets }, (_, i) => it.targets[i] ?? {})
  const setTarget = (i: number, p: { w?: number | null; l?: number | null; r?: number | null }) =>
    set({ targets: targets.map((t, j) => (j === i ? { ...t, ...p } : t)) })
  const step = exercise.incrementKg ?? 2.5

  return (
    <Sheet open onClose={onClose} title={exercise.name}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Series" value={it.sets} onChange={(v) => set({ sets: Math.max(1, v ?? 1) })} min={1} />
          <NumField label="Reps mín." value={it.repMin} onChange={(v) => set({ repMin: v ?? 1, repMax: Math.max(it.repMax, v ?? 1) })} min={1} />
          <NumField label="Reps máx." value={it.repMax} onChange={(v) => set({ repMax: Math.max(it.repMin, v ?? it.repMin) })} min={1} />
        </div>
        <NumField label="RIR objetivo" value={it.targetRir} onChange={(v) => set({ targetRir: v ?? 2 })} max={5} />
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Descanso mín. (s)" value={it.restSecMin} onChange={(v) => set({ restSecMin: v ?? 60 })} step={15} />
          <NumField label="Descanso máx. (s)" value={it.restSecMax} onChange={(v) => set({ restSecMax: Math.max(it.restSecMin, v ?? 60) })} step={15} />
        </div>
        <div className="space-y-2">
          <span className="label">Peso objetivo por serie (kg){uni ? ' · izquierda / derecha' : ''}</span>
          {targets.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-sm font-bold text-slate-400">{i + 1}</span>
              {uni ? (
                <div className="grid flex-1 grid-cols-2 gap-2">
                  <NumField value={t.l ?? null} onChange={(l) => setTarget(i, { l })} step={step} />
                  <NumField value={t.r ?? null} onChange={(r) => setTarget(i, { r })} step={step} />
                </div>
              ) : (
                <div className="flex-1"><NumField value={t.w ?? null} onChange={(w) => setTarget(i, { w })} step={step} /></div>
              )}
            </div>
          ))}
        </div>
        <div>
          <span className="label">Notas</span>
          <textarea className="input py-3" rows={2} value={it.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        <div>
          <span className="label">Durante los descansos de…</span>
          <select className="input" value={it.pairedWithItemId ?? ''} onChange={(e) => set({ pairedWithItemId: e.target.value || null })}>
            <option value="">— (ejercicio independiente)</option>
            {mains.filter((m) => !m.pairedWithItemId).map((m) => <option key={m.id} value={m.id}>{nameOf(m)}</option>)}
          </select>
        </div>
        <Toggle label="Repeticiones por lado" checked={it.perSide} onChange={(perSide) => set({ perSide })} />
        <Toggle label="Quitable cerca del partido" hint="Se podrá omitir si llegas cargado" checked={it.removableNearMatch} onChange={(removableNearMatch) => set({ removableNearMatch })} />
        <div className="grid gap-2">
          <button className="btn btn-primary" onClick={() => onSave({ ...it, targets })}>Guardar</button>
          <button className="btn btn-danger" onClick={onDelete}>Quitar de la plantilla</button>
        </div>
      </div>
    </Sheet>
  )
}
