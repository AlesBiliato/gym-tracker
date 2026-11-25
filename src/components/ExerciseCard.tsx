import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Exercise, SessionExercise, SetLog, Settings } from '../db/types'
import {
  applySuggestion, lastPerformance, revertSuggestion, saveSet, setExerciseStatus, setObs, setPlanSets, substituteExercise, undoSet,
} from '../db/repo'
import { formatDate, formatKg, formatRest } from '../domain/format'
import { quickSet, repsLabel, repsOptions, RIR_OPTIONS, targetForSet } from '../domain/sessionPlan'
import { Sheet } from './ui'
import SetEditor, { type SetValues } from './SetEditor'
import { useRestTimer } from './RestTimer'
import { loadsText } from './SuggestionsCard'

const STATUS_LABEL: Record<string, string> = {
  pendiente: '', en_curso: 'En curso', hecho: 'Hecho', parcial: 'Parcial', no_hecho: 'No realizado', sustituido: 'Sustituido',
}
const STATUS_STYLE: Record<string, string> = {
  hecho: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  en_curso: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  parcial: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  no_hecho: 'bg-slate-500/15 text-slate-500',
  sustituido: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
}

function fmtSet(s: Partial<SetLog>, uni: boolean, bodyweight: boolean) {
  const load = bodyweight ? '' : uni ? `${formatKg(s.l)}/${formatKg(s.r)} kg` : `${formatKg(s.w)} kg`
  const reps = s.repsL != null || s.repsR != null ? `${s.repsL ?? '–'}/${s.repsR ?? '–'}` : `${s.reps ?? '–'}`
  return `${load}${load ? ' × ' : ''}${reps}`
}

export default function ExerciseCard({
  se, ex, allExercises, nameOf, sets, open, onToggle, nested, settings, readOnly, children,
}: {
  se: SessionExercise; ex: Exercise; allExercises: Exercise[]; nameOf: (id: string) => string
  sets: SetLog[]; open: boolean; onToggle: () => void; nested?: boolean
  settings: Settings; readOnly?: boolean; children?: ReactNode
}) {
  const timer = useRestTimer()
  const last = useLiveQuery(() => lastPerformance(se.exerciseId, se.sessionId), [se.exerciseId, se.sessionId])
  const [editing, setEditing] = useState<number | null>(null)
  const [menu, setMenu] = useState(false)
  const [subst, setSubst] = useState(false)
  /** Serie recién marcada con ✓ cuya corrección (reps/RIR) está visible durante su descanso. */
  const [corr, setCorr] = useState<{ index: number; token: number } | null>(null)

  const plan = se.plan
  const bodyweight = ex.loadType === 'peso corporal'
  const step = ex.incrementKg ?? (settings.incrementsKg[ex.loadType] || 2.5)
  const byIndex = useMemo(() => new Map(sets.filter((s) => !s.deletedAt).map((s) => [s.index, s])), [sets])
  const doneCount = [...byIndex.values()].filter((s) => s.done).length

  /** ✓: carga del plan, reps de la última vez en esa serie (o el máximo del rango) y RIR sin indicar. */
  const quick = (i: number): SetValues => quickSet(plan, i, last?.sets, ex.unilateral)

  const targetLabel = (i: number) => {
    const t = targetForSet(plan, i)
    const load = bodyweight ? '' : ex.unilateral
      ? (t.l == null && t.r == null ? '' : `${formatKg(t.l)}/${formatKg(t.r)} kg`)
      : (t.w == null ? '' : `${formatKg(t.w)} kg`)
    return `${load ? load + ' ' : ''}× ${repsLabel(plan)}`
  }

  const commit = async (i: number, v: SetValues): Promise<number> => {
    await saveSet(se.id, i, { ...v, done: true, completedAt: new Date().toISOString() })
    return timer.start(plan.restSecMax)
  }
  /** Un toque: guarda la serie y arranca el descanso; debajo salen los botones de corrección. */
  const toggleQuick = async (i: number) => {
    if (byIndex.get(i)?.done) {
      if (corr?.index === i) setCorr(null)
      await undoSet(se.id, i)
    } else {
      const token = await commit(i, quick(i))
      setCorr({ index: i, token })
    }
  }

  const rows = Math.max(plan.sets, ...[...byIndex.keys()].map((k) => k + 1))
  const editingExisting = editing != null ? byIndex.get(editing) : undefined
  const initial = editing == null ? {} : editingExisting?.done ? editingExisting : quick(editing)

  const candidates = allExercises
    .filter((e) => !e.excluded && e.id !== se.exerciseId && !e.deletedAt)
    .sort((a, b) => {
      const sa = ex.substituteIds.includes(a.id) ? 0 : a.muscleGroup === ex.muscleGroup ? 1 : 2
      const sb = ex.substituteIds.includes(b.id) ? 0 : b.muscleGroup === ex.muscleGroup ? 1 : 2
      return sa - sb || a.name.localeCompare(b.name, 'es')
    })
    .slice(0, 40)

  return (
    <div className={nested ? 'ml-4 border-l-4 border-sky-300 pl-3 dark:border-sky-800' : ''}>
      <div className="card !p-0 overflow-hidden">
        <button onClick={onToggle} className="flex min-h-[4.5rem] w-full items-center gap-3 p-4 text-left">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold leading-tight">{ex.name}</span>
              {STATUS_LABEL[se.status] && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[se.status]}`}>{STATUS_LABEL[se.status]}</span>
              )}
            </div>
            {se.substitutedForExerciseId && <div className="text-sm text-violet-500">en lugar de {nameOf(se.substitutedForExerciseId)}</div>}
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {plan.sets}×{repsLabel(plan)} · RIR {plan.targetRir} · desc. {formatRest(plan.restSecMin)}
              {plan.restSecMax !== plan.restSecMin ? `–${formatRest(plan.restSecMax)}` : ''}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xl font-bold tabular-nums">{doneCount}/{plan.sets}</div>
            <div className="text-slate-400">{open ? '▲' : '▼'}</div>
          </div>
        </button>

        {open && (
          <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
            {plan.notes && <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">{plan.notes}</p>}
            {se.suggestion && <SuggestionNote se={se} unilateral={ex.unilateral} readOnly={!!readOnly} />}
            {last && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                <b>Última vez</b> ({formatDate(last.date)}): {last.sets.map((s) => fmtSet(s, ex.unilateral, bodyweight)).join(' · ')}
              </p>
            )}

            <div className="space-y-2">
              {Array.from({ length: rows }, (_, i) => {
                const s = byIndex.get(i)
                const done = !!s?.done
                const label = targetLabel(i)
                const showCorr = done && corr?.index === i && timer.token === corr.token
                return (
                  <Fragment key={i}>
                  <div className={`flex items-center gap-2 rounded-2xl p-1 pl-3 ${done ? 'bg-emerald-500/10' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    <button disabled={readOnly} onClick={() => setEditing(i)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="w-6 text-sm font-bold text-slate-400">{i + 1}</span>
                      <span className="min-w-0">
                        {done ? (
                          <>
                            <span className="block truncate text-lg font-bold">{fmtSet(s!, ex.unilateral, bodyweight)}</span>
                            <span className="block text-sm text-slate-500">
                                        {s!.rir == null ? 'RIR sin indicar' : `RIR ${s!.rir}`}{s!.failed ? ' · fallo' : ''}
                            </span>
                          </>
                        ) : (
                          <span className="block truncate text-lg">{label}</span>
                        )}
                      </span>
                    </button>
                    <button
                      disabled={readOnly}
                      onClick={() => toggleQuick(i)}
                      aria-label={done ? 'Deshacer serie' : 'Marcar serie hecha tal cual'}
                      className={`flex h-14 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-bold transition active:scale-95 ${
                        done ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'
                      }`}
                    >
                      ✓
                    </button>
                  </div>
                  {showCorr && (
                    <QuickCorrection
                      reps={s!.reps} rir={s!.rir} options={repsOptions(plan, s!.reps)}
                      onReps={(n) => saveSet(se.id, i, { reps: n })}
                      onRir={(n) => saveSet(se.id, i, { rir: n })}
                    />
                  )}
                  </Fragment>
                )
              })}
            </div>

            <textarea
              key={se.id + se.obs}
              defaultValue={se.obs}
              disabled={readOnly}
              onBlur={(e) => e.target.value !== se.obs && setObs(se.id, e.target.value)}
              placeholder="Observaciones del ejercicio…"
              rows={2}
              className="input min-h-0 py-3"
            />

            {!readOnly && (
              <button className="btn btn-soft w-full" onClick={() => setMenu(true)}>⋯ Opciones del ejercicio</button>
            )}
          </div>
        )}
      </div>

      {children && <div className="mt-2 space-y-2">{children}</div>}

      <SetEditor
        open={editing != null}
        onClose={() => setEditing(null)}
        ex={ex}
        index={editing ?? 0}
        initial={initial}
        step={step}
        wasDone={!!editingExisting?.done}
        onSave={async (v) => { const i = editing!; setEditing(null); await commit(i, v) }}
        onClear={async () => { const i = editing!; setEditing(null); await undoSet(se.id, i) }}
      />

      <Sheet open={menu} onClose={() => setMenu(false)} title={ex.name}>
        <div className="grid gap-2">
          {se.status === 'no_hecho' ? (
            <button className="btn btn-soft" onClick={async () => { await setExerciseStatus(se.id, 'pendiente'); setMenu(false) }}>Volver a marcar como pendiente</button>
          ) : (
            <button className="btn btn-soft" onClick={async () => { await setExerciseStatus(se.id, 'no_hecho'); setMenu(false) }}>No realizado hoy</button>
          )}
          <button className="btn btn-soft" onClick={() => { setMenu(false); setSubst(true) }}>Sustituir por otro ejercicio</button>
          <button className="btn btn-soft" onClick={async () => { await setPlanSets(se.id, { ...plan, sets: plan.sets + 1 }); setMenu(false) }}>+ Añadir una serie</button>
          {plan.sets > doneCount && plan.sets > 1 && (
            <button className="btn btn-soft" onClick={async () => { await setPlanSets(se.id, { ...plan, sets: plan.sets - 1 }); setMenu(false) }}>− Quitar una serie</button>
          )}
        </div>
      </Sheet>

      <Sheet open={subst} onClose={() => setSubst(false)} title="Sustituir por…">
        <p className="mb-3 text-sm text-slate-500">El sustituto se registra como ejercicio distinto y no se compara con el original.</p>
        <div className="grid gap-2">
          {candidates.map((c) => (
            <button key={c.id} className="btn btn-soft justify-between text-left"
              onClick={async () => { await substituteExercise(se.id, c.id); setSubst(false) }}>
              <span>{c.name}</span>
              <span className="text-sm font-normal text-slate-500">{ex.substituteIds.includes(c.id) ? 'sugerido' : c.muscleGroup}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

/** Sugerencia de carga del ejercicio: aviso, propuesta y botón para aplicarla o deshacerla. */
function SuggestionNote({ se, unilateral, readOnly }: { se: SessionExercise; unilateral: boolean; readOnly: boolean }) {
  const sug = se.suggestion!
  const before = loadsText(sug.previousTargets, unilateral)
  const after = loadsText(sug.targets, unilateral)
  const differs = before !== after
  return (
    <div className="space-y-1.5 rounded-xl bg-sky-500/10 p-3 text-sm">
      <p className="font-semibold text-sky-700 dark:text-sky-300">
        {sug.kind === 'subir' ? '↑ Sugerencia: subir' : sug.kind === 'consolidar' ? '⚠ Sugerencia: consolidar' : '= Sugerencia: mantener'}
      </p>
      <p>{sug.reason}</p>
      {sug.warnings.map((w) => (
        <p key={w} className="rounded-lg bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">{w}</p>
      ))}
      {differs && (
        <div className="flex items-center justify-between gap-2">
          <span className="tabular-nums">{sug.applied ? 'Aplicada: ' : 'Propuesta: '}<b>{after}</b></span>
          {!readOnly && (
            <button className="btn btn-soft btn-sm shrink-0"
              onClick={() => (sug.applied ? revertSuggestion(se.id) : applySuggestion(se.id))}>
              {sug.applied ? 'Deshacer' : 'Aplicar'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Corrección rápida bajo la serie, solo durante su descanso: un toque en las reps o en el RIR.
 * Si no se toca nada, la serie se queda como se guardó (RIR sin indicar: no cuenta para subir carga).
 */
function QuickCorrection({ reps, rir, options, onReps, onRir }: {
  reps: number | null; rir: number | null; options: number[]; onReps: (n: number) => void; onRir: (n: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // El ✓ puede estar cerca del borde inferior: se asegura de que los botones queden a la vista.
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [])
  return (
    <div ref={ref} className="space-y-3 rounded-2xl bg-sky-500/10 p-3" data-testid="quick-correction">
      <div>
        <p className="label">Repeticiones</p>
        <div className={`grid gap-2 ${options.length <= 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {options.map((n) => (
            <button key={n} type="button" onClick={() => onReps(n)} aria-pressed={reps === n}
              className={`btn min-h-14 px-0 text-xl ${reps === n ? 'btn-primary' : 'btn-soft'}`}>{n}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">RIR: repeticiones que te quedaban</p>
        <div className="grid grid-cols-5 gap-2">
          {RIR_OPTIONS.map((n) => (
            <button key={n} type="button" onClick={() => onRir(n)} aria-pressed={rir === n}
              className={`btn min-h-14 px-0 text-xl ${rir === n ? 'btn-primary' : 'btn-soft'}`}>{n === 4 ? '4+' : n}</button>
          ))}
        </div>
      </div>
      {rir == null && <p className="text-xs text-slate-500">Sin tocar el RIR, esta serie no cuenta para subir de carga.</p>}
    </div>
  )
}
