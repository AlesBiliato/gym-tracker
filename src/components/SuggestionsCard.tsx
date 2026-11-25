import { useLiveQuery } from 'dexie-react-hooks'
import { computeSuggestions, type ItemSuggestion } from '../db/repo'
import { formatTarget } from '../domain/format'
import type { SuggestionKind } from '../domain/progression'
import type { SetTarget } from '../db/types'
import { Toggle } from './ui'

const BADGE: Record<Exclude<SuggestionKind, 'sin_datos'>, { label: string; cls: string }> = {
  subir: { label: '↑ Subir', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  mantener: { label: '= Mantener', cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
  consolidar: { label: '⚠ Consolidar', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
}

export const loadsText = (targets: SetTarget[], unilateral: boolean) =>
  targets.map((t) => formatTarget(t, unilateral)).join(' · ') + ' kg'

/** Sugerencias de carga para la próxima sesión. Nunca se aplican solas: el usuario elige. */
export default function SuggestionsCard({
  code, apply, onChange,
}: { code: 'A' | 'B' | 'C'; apply: string[]; onChange: (ids: string[]) => void }) {
  const list = useLiveQuery(() => computeSuggestions(code), [code])
  if (!list) return null

  const shown = list.filter((x) => x.suggestion.kind !== 'sin_datos')
  const without = list.filter((x) => x.suggestion.kind === 'sin_datos')
  const changing = shown.filter((x) => x.suggestion.changes)
  const toggle = (id: string, on: boolean) => onChange(on ? [...new Set([...apply, id])] : apply.filter((x) => x !== id))
  const allOn = changing.length > 0 && changing.every((x) => apply.includes(x.item.id))

  if (shown.length === 0 && without.length === 0) return null
  return (
    <div className="card space-y-3">
      <div>
        <p className="font-bold">Sugerencias de carga</p>
        <p className="text-sm text-slate-500">
          Según lo que hiciste la última vez. Son solo propuestas: elige cuáles aplicar y podrás editar cualquier peso en la sesión.
        </p>
      </div>

      {changing.length > 1 && (
        <button className="btn btn-soft btn-sm w-full" onClick={() => onChange(allOn ? [] : changing.map((x) => x.item.id))}>
          {allOn ? 'Quitar todas' : `Aplicar todas (${changing.length})`}
        </button>
      )}

      {shown.map((x) => <Row key={x.item.id} x={x} on={apply.includes(x.item.id)} onToggle={(v) => toggle(x.item.id, v)} />)}

      {without.length > 0 && (
        <details className="text-sm text-slate-500">
          <summary className="cursor-pointer">{without.length} sin sugerencia</summary>
          <ul className="mt-1 space-y-1">
            {without.map((x) => (
              <li key={x.item.id}><span className="font-medium text-slate-600 dark:text-slate-300">{x.exercise.name}:</span> {x.suggestion.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Row({ x, on, onToggle }: { x: ItemSuggestion; on: boolean; onToggle: (v: boolean) => void }) {
  const { suggestion: s, exercise: ex, item } = x
  const b = BADGE[s.kind as Exclude<SuggestionKind, 'sin_datos'>]
  return (
    <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold leading-tight">{ex.name}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</span>
      </div>
      {s.changes ? (
        <p className="mt-1 text-sm tabular-nums">
          <span className="text-slate-500">{loadsText(item.targets, ex.unilateral)}</span>
          <span className="mx-1">→</span>
          <b>{loadsText(s.targets, ex.unilateral)}</b>
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Sin cambios respecto a la plantilla: {loadsText(s.targets, ex.unilateral)}</p>
      )}
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{s.reason}</p>
      {s.warnings.map((w) => (
        <p key={w} className="mt-1 rounded-lg bg-amber-500/10 px-2 py-1 text-sm text-amber-700 dark:text-amber-300">{w}</p>
      ))}
      {s.changes && <Toggle label="Aplicar en esta sesión" checked={on} onChange={onToggle} />}
    </div>
  )
}
