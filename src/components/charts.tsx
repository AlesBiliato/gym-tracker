import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatDate, formatKg } from '../domain/format'
import type { ExercisePoint, Frequency, WeightPoint } from '../domain/stats'

const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const shortTs = (t: number) => shortDate(new Date(t).toISOString().slice(0, 10))
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const AXIS = { stroke: 'var(--viz-axis)', fontSize: 12 }
/** El texto de la leyenda va en tinta neutra; el color lo lleva solo el marcador. */
const legendText = (v: string) => <span style={{ color: 'var(--viz-axis)' }}>{v}</span>
const MARGIN = { top: 8, right: 8, bottom: 0, left: -8 }

function Tip({ active, payload, label, unit, title }: {
  active?: boolean; payload?: { name: string; value: number; color: string; payload: Record<string, unknown> }[]
  label?: string | number; unit: string; title?: (l: string) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
      <div className="font-semibold">{title ? title(String(label)) : formatDate(typeof label === "number" ? new Date(label).toISOString().slice(0, 10) : String(label))}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
          {p.name}: <b>{formatKg(p.value)} {unit}</b>
        </div>
      ))}
    </div>
  )
}

/** Peso máximo por sesión (una línea; dos —izquierda y derecha— en unilaterales). */
export function MaxWeightChart({ data, unilateral }: { data: ExercisePoint[]; unilateral: boolean }) {
  const rows = data.map((d) => ({ t: ms(d.date), date: d.date, Peso: d.maxW, Izquierda: d.maxL, Derecha: d.maxR }))
  return (
    <div className="viz h-56 w-full" role="img" aria-label="Peso máximo por sesión">
      <ResponsiveContainer>
        <LineChart data={rows} margin={MARGIN}>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortTs} tick={AXIS} axisLine={false} tickLine={false} minTickGap={32} padding={{ left: 8, right: 8 }} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} domain={['auto', 'auto']} tickFormatter={(v) => formatKg(v)} />
          <Tooltip content={<Tip unit="kg" />} cursor={{ stroke: 'var(--viz-axis)', strokeDasharray: '3 3' }} />
          {unilateral ? (
            <>
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} formatter={legendText} />
              <Line isAnimationActive={false} type="linear" dataKey="Izquierda" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, stroke: 'var(--viz-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
              <Line isAnimationActive={false} type="linear" dataKey="Derecha" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4, stroke: 'var(--viz-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
            </>
          ) : (
            <Line isAnimationActive={false} type="linear" dataKey="Peso" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, stroke: 'var(--viz-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Volumen (kg × reps) por sesión. */
export function VolumeChart({ data }: { data: ExercisePoint[] }) {
  return (
    <div className="viz h-48 w-full" role="img" aria-label="Volumen por sesión">
      <ResponsiveContainer>
        <BarChart data={data.map((d) => ({ date: d.date, Volumen: d.volume }))} margin={MARGIN}>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<Tip unit="kg" />} cursor={{ fill: 'var(--viz-grid)', opacity: 0.5 }} />
          <Bar isAnimationActive={false} dataKey="Volumen" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Sesiones por semana frente al objetivo. La semana en curso va más clara. */
export function FrequencyChart({ freq, target }: { freq: Frequency; target: number }) {
  const rows = freq.weeks.map((w) => ({ date: w.weekStart, Sesiones: w.count, current: w.current }))
  return (
    <div className="viz h-48 w-full" role="img" aria-label="Sesiones por semana">
      <ResponsiveContainer>
        <BarChart data={rows} margin={MARGIN}>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} allowDecimals={false} domain={[0, Math.max(target + 1, ...rows.map((r) => r.Sesiones))]} />
          <Tooltip
            content={<Tip unit="" title={(l) => `Semana del ${formatDate(l)}`} />}
            cursor={{ fill: 'var(--viz-grid)', opacity: 0.5 }}
          />
          <ReferenceLine y={target} stroke="var(--viz-axis)" strokeDasharray="4 4" label={{ value: `Objetivo ${target}`, position: 'insideTopLeft', fill: 'var(--viz-axis)', fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="Sesiones" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28}
            shape={(p: { x?: number; y?: number; width?: number; height?: number; payload?: unknown }) => (
              <rect x={p.x} y={p.y} width={p.width} height={Math.max(p.height ?? 0, 0)} rx={4} fill="var(--series-1)" opacity={(p.payload as { current?: boolean } | undefined)?.current ? 0.5 : 1} />
            )}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Peso corporal: medidas (puntos) y media móvil de 7 días (línea). */
export function WeightChart({ points }: { points: WeightPoint[] }) {
  const rows = points.map((p) => ({ t: ms(p.date), date: p.date, Peso: p.kg, 'Media 7 días': Math.round(p.avg7 * 100) / 100 }))
  return (
    <div className="viz h-56 w-full" role="img" aria-label="Peso corporal y media móvil de 7 días">
      <ResponsiveContainer>
        <LineChart data={rows} margin={MARGIN}>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortTs} tick={AXIS} axisLine={false} tickLine={false} minTickGap={32} padding={{ left: 8, right: 8 }} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} domain={['auto', 'auto']} tickFormatter={(v) => formatKg(v)} />
          <Tooltip content={<Tip unit="kg" />} cursor={{ stroke: 'var(--viz-axis)', strokeDasharray: '3 3' }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} formatter={legendText} />
          <Line isAnimationActive={false} type="linear" dataKey="Media 7 días" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
          <Line isAnimationActive={false} dataKey="Peso" stroke="var(--series-2)" strokeWidth={0} dot={{ r: 4, fill: 'var(--series-2)', stroke: 'var(--viz-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} legendType="circle" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
