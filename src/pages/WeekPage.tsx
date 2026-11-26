import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { newBase } from '../db/base'
import { deleteMatch, saveMatch } from '../db/repo'
import { formatDate, todayISO, weekdayName } from '../domain/format'
import { IMPORTANCE_LABEL, MATCH_IMPORTANCES, type Match } from '../db/types'
import { PageHeader, Sheet, Toggle } from '../components/ui'
import WeekCard from '../components/WeekCard'

const blank = (): Match => ({
  ...newBase(), date: todayISO(), time: '12:00', rival: '', home: true, importance: 'normal', notes: '',
})

export default function WeekPage() {
  const [params, setParams] = useSearchParams()
  const matches = useLiveQuery(async () => (await db.matches.toArray()).filter((m) => !m.deletedAt).sort((a, b) => a.date.localeCompare(b.date)), [])
  const [edit, setEdit] = useState<Match | null>(null)
  const adding = params.get('nuevo') === '1'
  const today = todayISO()

  if (!matches) return <PageHeader title="Semana" />
  const upcoming = matches.filter((m) => m.date >= today)
  const past = matches.filter((m) => m.date < today).slice(-3).reverse()
  const form = edit ?? (adding ? blank() : null)
  const close = () => { setEdit(null); if (adding) setParams({}, { replace: true }) }

  return (
    <>
      <PageHeader title="Semana" sub="Partidos y qué hacer según el calendario"
        right={<button className="btn btn-primary btn-sm" onClick={() => setEdit(blank())}>+ Partido</button>} />
      <div className="space-y-4 px-4">
        <WeekCard />

        <div className="card space-y-2">
          <p className="font-bold">Próximos partidos</p>
          {upcoming.length === 0 && <p className="text-sm text-slate-500">No hay ninguno. Añade el siguiente con «+ Partido».</p>}
          {upcoming.map((m) => <MatchRow key={m.id} m={m} onEdit={() => setEdit(m)} />)}
        </div>

        {past.length > 0 && (
          <div className="card space-y-2">
            <p className="font-bold text-slate-500">Anteriores</p>
            {past.map((m) => <MatchRow key={m.id} m={m} onEdit={() => setEdit(m)} />)}
          </div>
        )}
      </div>

      {form && (
        <Sheet open onClose={close} title={edit && matches.some((m) => m.id === edit.id) ? 'Editar partido' : 'Nuevo partido'}>
          <MatchForm
            match={form}
            onSave={async (m) => { await saveMatch(m); close() }}
            onDelete={edit && matches.some((m) => m.id === edit.id) ? async () => { await deleteMatch(edit.id); close() } : undefined}
          />
        </Sheet>
      )}
    </>
  )
}

function MatchRow({ m, onEdit }: { m: Match; onEdit: () => void }) {
  const imp = m.importance ?? 'normal'
  return (
    <button className="flex w-full items-center justify-between gap-3 rounded-xl py-2 text-left" onClick={onEdit}>
      <span>
        <span className="block font-semibold">{weekdayName(m.date)} {formatDate(m.date)} · {m.time}</span>
        <span className="block text-sm text-slate-500">{m.rival ? `vs ${m.rival}` : 'Sin rival'} · {m.home ? 'local' : 'visitante'}</span>
      </span>
      <span className={`chip !min-h-8 shrink-0 text-sm ${imp === 'importante' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : imp === 'facil' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : ''}`}>
        {IMPORTANCE_LABEL[imp]}
      </span>
    </button>
  )
}

function MatchForm({ match, onSave, onDelete }: { match: Match; onSave: (m: Match) => void; onDelete?: () => void }) {
  const [m, setM] = useState(match)
  const set = (p: Partial<Match>) => setM((c) => ({ ...c, ...p }))
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(m.date)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><span className="label">Fecha</span><input type="date" className="input" value={m.date} onChange={(e) => set({ date: e.target.value })} /></div>
        <div><span className="label">Hora</span><input type="time" className="input" value={m.time} onChange={(e) => set({ time: e.target.value })} /></div>
      </div>
      <div><span className="label">Rival</span><input className="input" value={m.rival} onChange={(e) => set({ rival: e.target.value })} /></div>
      <Toggle label="Juegas en casa" checked={m.home} onChange={(v) => set({ home: v })} />
      <div>
        <span className="label">Importancia</span>
        <div className="flex gap-2">
          {MATCH_IMPORTANCES.map((i) => (
            <button key={i} type="button" className={`chip flex-1 justify-center ${(m.importance ?? 'normal') === i ? 'chip-on' : ''}`} onClick={() => set({ importance: i })}>
              {IMPORTANCE_LABEL[i]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-sm text-slate-500">Importante: protejo las piernas 3 días antes. Normal: 2. Fácil: 1.</p>
      </div>
      <div><span className="label">Notas</span><input className="input" value={m.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
      <button className="btn btn-primary w-full" disabled={!valid} onClick={() => onSave(m)}>Guardar</button>
      {onDelete && <button className="btn btn-danger w-full" onClick={onDelete}>Eliminar partido</button>}
    </div>
  )
}
