import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { formatClock } from '../domain/format'

interface TimerCtx {
  start: (seconds: number) => void
  stop: () => void
}
const Ctx = createContext<TimerCtx>({ start: () => {}, stop: () => {} })
export const useRestTimer = () => useContext(Ctx)

const KEY = 'restTimer'

function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    ;[0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 880
      g.gain.value = 0.25
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.15)
    })
  } catch { /* sin audio */ }
  try { navigator.vibrate?.([200, 100, 200]) } catch { /* iOS no vibra */ }
}

/**
 * El temporizador guarda la HORA DE FIN (no un contador): si iOS pausa la
 * pestaña en segundo plano, al volver el tiempo restante sigue siendo correcto.
 */
export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [end, setEnd] = useState<{ endAt: number; total: number } | null>(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
      return v && v.endAt > Date.now() - 15000 ? v : null
    } catch { return null }
  })
  const [, setTick] = useState(0)
  const fired = useRef(false)

  const persist = (v: typeof end) => {
    try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  }
  const start = useCallback((seconds: number) => {
    fired.current = false
    const v = { endAt: Date.now() + seconds * 1000, total: seconds }
    setEnd(v)
    persist(v)
  }, [])
  const stop = useCallback(() => { setEnd(null); persist(null) }, [])
  const add = (s: number) => setEnd((e) => {
    if (!e) return e
    const v = { endAt: e.endAt + s * 1000, total: e.total + s }
    persist(v)
    fired.current = false
    return v
  })

  useEffect(() => {
    if (!end) return
    const id = setInterval(() => {
      setTick((t) => t + 1)
      if (Date.now() >= end.endAt && !fired.current) { fired.current = true; beep() }
      if (Date.now() >= end.endAt + 12000) stop()
    }, 250)
    return () => clearInterval(id)
  }, [end, stop])

  const remaining = end ? Math.ceil((end.endAt - Date.now()) / 1000) : 0
  const over = end != null && remaining <= 0

  return (
    <Ctx.Provider value={{ start, stop }}>
      {children}
      {end && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md px-3">
          <div className={`flex items-center gap-2 rounded-2xl p-2 pl-4 shadow-xl ${over ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white dark:bg-sky-600'}`}>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wide opacity-80">{over ? 'Descanso terminado' : 'Descanso'}</div>
              <div className="text-3xl font-extrabold tabular-nums">{over ? '¡A por la siguiente!' : formatClock(remaining)}</div>
            </div>
            {!over && (
              <>
                <button className="btn btn-sm bg-white/15" onClick={() => add(-15)}>−15</button>
                <button className="btn btn-sm bg-white/15" onClick={() => add(15)}>+15</button>
              </>
            )}
            <button className="btn btn-sm bg-white/25" onClick={stop}>{over ? 'Vale' : 'Saltar'}</button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
