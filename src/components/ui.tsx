import { useEffect, useRef, useState, type ReactNode } from 'react'
import { shouldClose, sheetTouchAction } from './sheetGesture'
import { formatKg, parseNumber } from '../domain/format'

/**
 * Hoja inferior (bottom sheet) pensada para el pulgar.
 * - Mientras está abierta, la pantalla de detrás NO hace scroll.
 * - Se cierra deslizando hacia abajo (desde arriba del contenido o desde el fondo oscuro) o tocando fuera.
 * - Si el contenido es largo, se hace scroll dentro de la hoja sin arrastrar nada más.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [dy, setDy] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Bloquea el scroll de la página de detrás (escritorio y rueda del ratón).
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Gestos táctiles: listeners nativos NO pasivos, para poder impedir el scroll del fondo.
  useEffect(() => {
    const overlay = overlayRef.current
    const panel = panelRef.current
    if (!open || !overlay || !panel) return
    let startY = 0
    let startScroll = 0
    let inside = false
    let drag = false
    let lastDy = 0

    const onStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
      inside = panel.contains(e.target as Node)
      startScroll = panel.scrollTop
      drag = false
      lastDy = 0
    }
    const onMove = (e: TouchEvent) => {
      const delta = e.touches[0].clientY - startY
      const action = sheetTouchAction({
        inside, startScrollTop: startScroll, scrollTop: panel.scrollTop, scrollHeight: panel.scrollHeight,
        clientHeight: panel.clientHeight, delta, dragging: drag,
      })
      if (action === 'allow') return
      if (e.cancelable) e.preventDefault()
      if (action === 'drag') {
        if (!drag) { drag = true; setDragging(true) }
        lastDy = Math.max(0, delta)
        setDy(lastDy)
      }
    }
    const onEnd = () => {
      if (!drag) return
      drag = false
      setDragging(false)
      if (shouldClose(lastDy)) onCloseRef.current()
      else setDy(0)
    }
    overlay.addEventListener('touchstart', onStart, { passive: true })
    overlay.addEventListener('touchmove', onMove, { passive: false })
    overlay.addEventListener('touchend', onEnd)
    overlay.addEventListener('touchcancel', onEnd)
    return () => {
      overlay.removeEventListener('touchstart', onStart)
      overlay.removeEventListener('touchmove', onMove)
      overlay.removeEventListener('touchend', onEnd)
      overlay.removeEventListener('touchcancel', onEnd)
      setDy(0)
      setDragging(false)
    }
  }, [open])

  if (!open) return null
  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        ref={panelRef}
        className="mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-slate-900"
        style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: dragging ? 'none' : 'transform 0.2s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
        {title && <h2 className="mb-4 text-xl font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

/** Campo numérico grande con −/+ y escritura directa (coma decimal). */
export function NumField({
  label, value, onChange, step = 1, min = 0, max, unit,
}: {
  label?: string; value: number | null; onChange: (v: number | null) => void
  step?: number; min?: number; max?: number; unit?: string
}) {
  const [text, setText] = useState(value == null ? '' : formatKg(value))
  useEffect(() => setText(value == null ? '' : formatKg(value)), [value])
  const bump = (d: number) => {
    const next = Math.round(((value ?? 0) + d) * 100) / 100
    onChange(Math.min(max ?? Infinity, Math.max(min, next)))
  }
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-soft w-14 px-0 text-2xl" onClick={() => bump(-step)} aria-label="Menos">−</button>
        <div className="relative min-w-0 flex-1">
          <input
            className="input text-center text-xl font-bold"
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              const n = parseNumber(e.target.value)
              if (n !== null || e.target.value.trim() === '') onChange(n)
            }}
            onFocus={(e) => e.target.select()}
          />
          {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{unit}</span>}
        </div>
        <button type="button" className="btn btn-soft w-14 px-0 text-2xl" onClick={() => bump(step)} aria-label="Más">+</button>
      </div>
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-1 text-left">
      <span>
        <span className="block text-lg">{label}</span>
        {hint && <span className="block text-sm text-slate-500">{hint}</span>}
      </span>
      <span className={`flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition ${checked ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
        <span className={`h-6 w-6 rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : ''}`} />
      </span>
    </button>
  )
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {right}
    </header>
  )
}
