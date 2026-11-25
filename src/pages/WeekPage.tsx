import { PageHeader } from '../components/ui'

export default function WeekPage() {
  return (
    <>
      <PageHeader title="Semana" sub="Calendario de partidos y ajustes" />
      <div className="px-4">
        <div className="card text-slate-500">
          La vista semanal, los partidos y el ajuste de la sesión según el calendario llegarán en la fase 4.
        </div>
      </div>
    </>
  )
}
