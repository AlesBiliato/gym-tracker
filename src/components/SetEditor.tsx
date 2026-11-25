import { useEffect, useState } from 'react'
import type { Exercise, SetLog } from '../db/types'
import { NumField, Sheet, Toggle } from './ui'

export type SetValues = Pick<SetLog, 'w' | 'l' | 'r' | 'reps' | 'repsL' | 'repsR' | 'rir' | 'failed'>

export default function SetEditor({
  open, onClose, ex, index, initial, step, wasDone, onSave, onClear,
}: {
  open: boolean; onClose: () => void; ex: Exercise; index: number
  initial: Partial<SetValues>; step: number; wasDone: boolean
  onSave: (v: SetValues) => void; onClear: () => void
}) {
  const [v, setV] = useState<SetValues>({ w: null, l: null, r: null, reps: null, rir: null, failed: false })
  const [sides, setSides] = useState(false)

  useEffect(() => {
    if (!open) return
    setV({ w: null, l: null, r: null, reps: null, rir: null, failed: false, ...initial })
    setSides(initial.repsL != null || initial.repsR != null)
  }, [open, initial])

  const set = (p: Partial<SetValues>) => setV((c) => ({ ...c, ...p }))
  const isBodyweight = ex.loadType === 'peso corporal'

  return (
    <Sheet open={open} onClose={onClose} title={`${ex.name} · serie ${index + 1}`}>
      <div className="space-y-4">
        {!isBodyweight &&
          (ex.unilateral ? (
            <div className="grid grid-cols-1 gap-3">
              <NumField label="Izquierda (kg)" value={v.l ?? null} onChange={(l) => set({ l })} step={step} />
              <NumField label="Derecha (kg)" value={v.r ?? null} onChange={(r) => set({ r })} step={step} />
            </div>
          ) : (
            <NumField label="Peso (kg)" value={v.w ?? null} onChange={(w) => set({ w })} step={step} />
          ))}

        {sides && ex.unilateral ? (
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Reps izq." value={v.repsL ?? null} onChange={(repsL) => set({ repsL, reps: repsL ?? v.reps })} />
            <NumField label="Reps der." value={v.repsR ?? null} onChange={(repsR) => set({ repsR })} />
          </div>
        ) : (
          <NumField label="Repeticiones" value={v.reps} onChange={(reps) => set({ reps })} />
        )}

        <div>
          <span className="label">Repeticiones en reserva (RIR)</span>
          <div className="grid grid-cols-6 gap-2">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => set({ rir: n })}
                className={`btn min-h-14 px-0 text-xl ${v.rir === n ? 'btn-primary' : 'btn-soft'}`}>
                {n}{n === 5 ? '+' : ''}
              </button>
            ))}
          </div>
        </div>

        <Toggle label="Fallo" hint="No completé las repeticiones" checked={v.failed} onChange={(failed) => set({ failed })} />
        {ex.unilateral && <Toggle label="Reps distintas por lado" checked={sides} onChange={setSides} />}

        <div className="grid grid-cols-1 gap-2 pt-1">
          <button className="btn btn-primary text-xl" onClick={() => onSave(sides ? v : { ...v, repsL: null, repsR: null })}>
            Guardar serie
          </button>
          {wasDone && <button className="btn btn-danger" onClick={onClear}>Marcar como no hecha</button>}
        </div>
      </div>
    </Sheet>
  )
}
