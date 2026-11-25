/**
 * Actualizaciones de la PWA. La versión nueva se descarga en segundo plano pero NO
 * se activa sola: se avisa y el usuario decide cuándo (p. ej. entre sesiones).
 * Los datos viven en IndexedDB y la sesión en curso en la base de datos, así que
 * recargar no pierde nada; el temporizador de descanso también sobrevive a la recarga.
 */
import { registerSW } from 'virtual:pwa-register'

type Listener = () => void
const listeners = new Set<Listener>()
let needRefresh = false
let dismissed = false
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined
let registration: ServiceWorkerRegistration | undefined

const emit = () => listeners.forEach((l) => l())

export function initUpdates() {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true
      dismissed = false
      emit()
    },
    onRegisteredSW(_url, reg) {
      registration = reg
      if (!reg) return
      // iOS casi nunca comprueba solo: se busca al abrir la app y cada 30 min.
      const check = () => { reg.update().catch(() => {}) }
      setInterval(check, 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    },
  })
}

export const subscribe = (l: Listener) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
export const getNeedRefresh = () => needRefresh && !dismissed

export function dismissUpdate() {
  dismissed = true
  emit()
}

/** Activa la versión nueva y recarga. */
export async function applyUpdate() {
  await updateSW?.(true)
}

/** Busca ahora. Devuelve true si hay una versión nueva esperando. */
export async function checkForUpdate(): Promise<boolean> {
  try {
    await registration?.update()
    await new Promise((r) => setTimeout(r, 1500)) // da tiempo a que onNeedRefresh dispare
  } catch { /* sin conexión */ }
  if (needRefresh) { dismissed = false; emit() }
  return needRefresh
}
