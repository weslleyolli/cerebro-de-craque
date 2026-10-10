import { describe, expect, it } from 'vitest'

import type { Scenario } from '../api/types'
import { ballPoint, initialState } from './engine'
import type { BoardState } from './engine'
import { yawTo } from './scan'
import { STEP_CARRY_M, applyStep, initialYaw } from './vision'

const scenario = {
  id: 'teste',
  face: {},
  // Criança na ala esquerda; a bola começa com o fixo, atrás dela.
  start: { positions: { v: [3, 20], f: [10, 30] }, ball: 'f' },
} as unknown as Scenario

describe('memória visual', () => {
  it('começa o lance olhando para a bola do começo do lance', () => {
    const s = initialState(scenario)
    expect(initialYaw(scenario)).toBeCloseTo(yawTo([3, 20], ballPoint(s)))
    // Bola atrás e à direita: olha para trás, não para o gol adversário.
    expect(initialYaw(scenario)).toBeGreaterThan(Math.PI / 2)
  })

  it('o passo para o lado leva junto o passe que está chegando', () => {
    const s: BoardState = { positions: { v: [12.3, 25.1], a1: [14, 12] }, ball: [12.3, 24.65], face: {} }
    const out = applyStep(s, [-1.15, 0.8])
    expect(out.positions.v![0]).toBeCloseTo(11.15)
    expect(out.positions.v![1]).toBeCloseTo(25.9)
    // A bola continua a 0,45 m da criança, e não a 1,7 m.
    const b = out.ball as [number, number]
    expect(Math.hypot(b[0] - out.positions.v![0], b[1] - out.positions.v![1])).toBeCloseTo(0.45)
    expect(out.positions.a1).toEqual([14, 12])
  })

  it('o passo não mexe na bola longe nem na bola com outro jogador', () => {
    const far: BoardState = { positions: { v: [3, 20] }, ball: [3, 20 - STEP_CARRY_M - 1], face: {} }
    expect(applyStep(far, [0.7, 0]).ball).toEqual([3, 20 - STEP_CARRY_M - 1])
    const held: BoardState = { positions: { v: [3, 20], o1: [3.5, 20.5] }, ball: 'o1', face: {} }
    const out = applyStep(held, [0.7, 0])
    expect(out.ball).toBe('o1')
    expect(out.positions.v).toEqual([3.7, 20])
    // Sem passo, o lance fica como estava.
    expect(applyStep(held, [0, 0])).toBe(held)
  })
})
