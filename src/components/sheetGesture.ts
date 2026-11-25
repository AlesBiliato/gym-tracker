/**
 * Decisión pura de qué hacer con un gesto táctil sobre una hoja inferior.
 * - 'drag':  la hoja sigue al dedo (y se cierra si se arrastra lo bastante hacia abajo)
 * - 'block': se impide el gesto (no debe moverse la pantalla de detrás)
 * - 'allow': scroll normal DENTRO de la hoja
 */
export type TouchAction = 'drag' | 'block' | 'allow'

export interface TouchState {
  /** El gesto empezó dentro del panel (no en el fondo oscuro). */
  inside: boolean
  /** scrollTop del panel cuando empezó el gesto. */
  startScrollTop: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  /** Desplazamiento vertical del dedo desde el inicio (positivo = hacia abajo). */
  delta: number
  /** Ya se había empezado a arrastrar la hoja en este gesto. */
  dragging: boolean
}

/** Arrastre mínimo (px) hacia abajo para cerrar la hoja al soltar. */
export const CLOSE_DISTANCE = 90

export function sheetTouchAction(s: TouchState): TouchAction {
  if (s.dragging) return 'drag'
  // Fondo oscuro: nunca hace scroll; deslizar hacia abajo cierra.
  if (!s.inside) return s.delta > 0 ? 'drag' : 'block'
  // Tirar hacia abajo estando arriba del todo (desde el inicio del gesto): arrastra/cierra la hoja.
  if (s.delta > 0 && s.startScrollTop <= 0 && s.scrollTop <= 0) return 'drag'
  const canScroll = s.scrollHeight > s.clientHeight + 1
  if (!canScroll) return 'block'
  const atBottom = s.scrollTop + s.clientHeight >= s.scrollHeight - 1
  const atTop = s.scrollTop <= 0
  // En los extremos se impide el "rebote" que arrastraría la pantalla de detrás.
  if ((s.delta < 0 && atBottom) || (s.delta > 0 && atTop)) return 'block'
  return 'allow'
}

export const shouldClose = (dy: number): boolean => dy > CLOSE_DISTANCE
