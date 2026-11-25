import { describe, expect, it } from 'vitest'
import { CLOSE_DISTANCE, shouldClose, sheetTouchAction, type TouchState } from './sheetGesture'

const base: TouchState = {
  inside: true, startScrollTop: 0, scrollTop: 0, scrollHeight: 300, clientHeight: 300, delta: 0, dragging: false,
}
const act = (p: Partial<TouchState>) => sheetTouchAction({ ...base, ...p })

describe('gestos de la hoja inferior', () => {
  it('contenido corto, deslizar hacia abajo: arrastra/cierra la hoja', () => {
    expect(act({ delta: 40 })).toBe('drag')
  })
  it('contenido corto, deslizar hacia arriba: se bloquea (no se mueve la pantalla de detrás)', () => {
    expect(act({ delta: -40 })).toBe('block')
  })
  it('el fondo oscuro nunca hace scroll: hacia abajo cierra, hacia arriba se bloquea', () => {
    expect(act({ inside: false, delta: 30 })).toBe('drag')
    expect(act({ inside: false, delta: -30 })).toBe('block')
  })
  it('contenido largo, arriba del todo y tirando hacia abajo: cierra la hoja', () => {
    expect(act({ scrollHeight: 900, clientHeight: 400, delta: 50 })).toBe('drag')
  })
  it('contenido largo, a mitad: scroll normal dentro de la hoja en ambos sentidos', () => {
    const mid = { scrollHeight: 900, clientHeight: 400, scrollTop: 200, startScrollTop: 200 }
    expect(act({ ...mid, delta: 50 })).toBe('allow')
    expect(act({ ...mid, delta: -50 })).toBe('allow')
  })
  it('subir hasta arriba haciendo scroll NO cierra la hoja por accidente', () => {
    // El gesto empezó con scroll (startScrollTop>0) y llegó arriba: se bloquea el rebote, pero no se arrastra.
    expect(act({ scrollHeight: 900, clientHeight: 400, scrollTop: 0, startScrollTop: 120, delta: 80 })).toBe('block')
  })
  it('abajo del todo y deslizando hacia arriba: se bloquea el rebote hacia la pantalla de detrás', () => {
    expect(act({ scrollHeight: 900, clientHeight: 400, scrollTop: 500, startScrollTop: 500, delta: -60 })).toBe('block')
  })
  it('una vez que se arrastra, sigue arrastrando hasta soltar', () => {
    expect(act({ dragging: true, delta: -20, scrollTop: 300, scrollHeight: 900, clientHeight: 400 })).toBe('drag')
  })
  it('cierra solo si se arrastra lo suficiente', () => {
    expect(shouldClose(CLOSE_DISTANCE)).toBe(false)
    expect(shouldClose(CLOSE_DISTANCE + 1)).toBe(true)
    expect(shouldClose(20)).toBe(false)
  })
})
