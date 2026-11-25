import { useState, useSyncExternalStore } from 'react'
import { applyUpdate, dismissUpdate, getNeedRefresh, subscribe } from '../update'

/** Aviso fijo arriba: "Hay una versión nueva — Actualizar". */
export default function UpdateBanner() {
  const show = useSyncExternalStore(subscribe, getNeedRefresh)
  const [busy, setBusy] = useState(false)
  if (!show) return null
  return (
    <div className="fixed inset-x-0 top-0 z-[60] px-3 pt-[calc(0.5rem+env(safe-area-inset-top))]" role="status">
      <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-sky-600 p-2 pl-4 text-white shadow-xl">
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Hay una versión nueva</p>
          <p className="text-xs opacity-90">Tus datos y la sesión en curso se conservan.</p>
        </div>
        <button className="btn btn-sm bg-white/15" onClick={dismissUpdate} disabled={busy}>Luego</button>
        <button
          className="btn btn-sm bg-white text-sky-700"
          disabled={busy}
          onClick={() => { setBusy(true); void applyUpdate() }}
        >
          {busy ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
    </div>
  )
}
