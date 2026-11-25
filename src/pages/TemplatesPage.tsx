import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { duplicateTemplate } from '../db/repo'
import { formatDate, todayISO } from '../domain/format'
import { PageHeader } from '../components/ui'

export default function TemplatesPage() {
  const nav = useNavigate()
  const tpls = useLiveQuery(async () => (await db.templates.toArray()).filter((t) => !t.deletedAt), [])
  const items = useLiveQuery(() => db.templateItems.toArray(), [])
  if (!tpls || !items) return <PageHeader title="Plantillas" />
  const active = tpls.filter((t) => t.active).sort((a, b) => a.code.localeCompare(b.code))
  const old = tpls.filter((t) => !t.active).sort((a, b) => b.version - a.version)

  return (
    <>
      <PageHeader title="Plantillas" sub="Sesiones A, B y C" right={<Link to="/catalogo" className="btn btn-soft btn-sm">Catálogo</Link>} />
      <div className="space-y-3 px-4">
        {active.map((t) => (
          <div key={t.id} className="card space-y-3">
            <Link to={`/plantillas/${t.id}`} className="block">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500 text-3xl font-extrabold text-white">{t.code}</span>
                <span>
                  <span className="block text-lg font-bold leading-tight">{t.name}</span>
                  <span className="text-sm text-slate-500">v{t.version} · desde {formatDate(t.validFrom)} · {items.filter((i) => i.templateId === t.id).length} ejercicios</span>
                </span>
              </div>
            </Link>
            <button className="btn btn-soft btn-sm w-full" onClick={async () => nav(`/plantillas/${await duplicateTemplate(t.id, todayISO())}`)}>
              Duplicar como nueva versión
            </button>
          </div>
        ))}
        {old.length > 0 && (
          <>
            <h2 className="pt-2 text-sm font-semibold uppercase text-slate-500">Versiones anteriores</h2>
            {old.map((t) => (
              <Link key={t.id} to={`/plantillas/${t.id}`} className="card block text-slate-500">
                {t.code} · v{t.version} · {formatDate(t.validFrom)}
              </Link>
            ))}
          </>
        )}
      </div>
    </>
  )
}
