import type { Base } from './types'

/** UUID v4 con alternativa para contextos no seguros (http por Wi-Fi en desarrollo). */
export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function deviceId(): string {
  try {
    let d = localStorage.getItem('deviceId')
    if (!d) {
      d = uuid()
      localStorage.setItem('deviceId', d)
    }
    return d
  } catch {
    return 'unknown'
  }
}

export function newBase(): Base {
  const now = new Date().toISOString()
  return { id: uuid(), createdAt: now, updatedAt: now, deletedAt: null, deviceId: deviceId() }
}

export const now = (): string => new Date().toISOString()
