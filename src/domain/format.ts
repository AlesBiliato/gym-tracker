import type { SetTarget } from '../db/types'

const nf = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false })

/** 62.5 -> "62,5" */
export const formatKg = (n: number | null | undefined): string => (n == null || Number.isNaN(n) ? '–' : nf.format(n))

/** "62,5" | "62.5" -> 62.5 ; vacío o inválido -> null */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** yyyy-mm-dd -> dd/mm/aa */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso
}

export const todayISO = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10))
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const weekdayName = (iso: string): string => WEEKDAYS[new Date(iso + 'T12:00:00').getDay()]

/** "30/20" (izq./der.) o "62,5" según el objetivo; vacío -> "–" */
export function formatTarget(t: SetTarget | undefined, unilateral: boolean): string {
  if (!t) return '–'
  if (unilateral) return t.l == null && t.r == null ? '–' : `${formatKg(t.l)}/${formatKg(t.r)}`
  return formatKg(t.w)
}

export function formatRest(sec: number): string {
  if (sec < 60) return `${sec} s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** ISO con hora -> "dd/mm/aa HH:mm" en hora local. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`
}
