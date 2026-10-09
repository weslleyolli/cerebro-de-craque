import { describe, expect, it } from 'vitest'

import type { Scenario } from '../api/types'
import {
  applyFrame,
  arrowsFor,
  ballPoint,
  bestOptionIndex,
  initialState,
  interpolate,
  teamOf,
} from './engine'

const scenario: Scenario = {
  id: 'teste',
  category: 'ataque',
  concept: '2 contra 1',
  title: 'Teste',
  sort_order: 1,
  setup: '',
  ask: '',
  lesson: '',
  view: { top: -1.6, bottom: 31 },
  tags: { v: 'AE', a2: 'AD' },
  face: { a1: 'down' },
  start: { positions: { v: [6, 22], a2: [15, 22], a1: [10, 12], o1: [10, 11] }, ball: 'v' },
  intro: [],
  options: [
    {
      type: 'passe', label: 'Tocar', target: 'a2', hint: null, grade: 'best',
      result: 'GOL!', kind: 'gol', why: '', frames: [{ ms: 500, moves: {}, ball: 'a2' }],
    },
    {
      type: 'chute', label: 'Chutar', target: null, hint: [10, 1], grade: 'bad',
      result: 'Defesa', kind: 'perde', why: '', frames: [{ ms: 500, moves: {}, ball: [10, 1] }],
    },
    {
      type: 'proteger', label: 'Segurar', target: null, hint: null, grade: 'ok',
      result: 'Posse', kind: 'posse', why: '', frames: [{ ms: 500, moves: {}, ball: null }],
    },
  ],
}

describe('engine', () => {
  it('coloca os goleiros mesmo quando a jogada não os lista', () => {
    const s = initialState(scenario)
    expect(s.positions.gk).toEqual([10, 38.6])
    expect(s.positions.o0).toEqual([10, 1.2])
  })

  it('identifica os times', () => {
    expect(teamOf('v')).toBe('you')
    expect(teamOf('a1')).toBe('us')
    expect(teamOf('gk')).toBe('us')
    expect(teamOf('o3')).toBe('them')
  })

  it('põe a bola à frente de quem conduz, no sentido do ataque', () => {
    const s = initialState(scenario)
    const [, y] = ballPoint(s)
    expect(y).toBeLessThan(22) // nosso time ataca para cima
    expect(ballPoint({ ...s, ball: 'o1' })[1]).toBeGreaterThan(11) // adversário para baixo
    expect(ballPoint({ ...s, ball: 'a1' })[1]).toBeGreaterThan(12) // pivô de costas
  })

  it('mantém a bola quando o trecho não diz nada sobre ela', () => {
    const s = applyFrame(initialState(scenario), { ms: 100, moves: { v: [7, 20] }, ball: null })
    expect(s.ball).toBe('v')
    expect(s.positions.v).toEqual([7, 20])
    expect(s.positions.a2).toEqual([15, 22])
  })

  it('interpola do começo ao fim do trecho', () => {
    const from = initialState(scenario)
    const to = applyFrame(from, { ms: 100, moves: { v: [8, 18] }, ball: null })
    expect(interpolate(from, to, 0).positions.v).toEqual([6, 22])
    expect(interpolate(from, to, 1).positions.v).toEqual([8, 18])
    const mid = interpolate(from, to, 0.5).positions.v!
    expect(mid[0]).toBeCloseTo(7)
    // bola conduzida acompanha o jogador
    expect(interpolate(from, to, 1).ball).toEqual(ballPoint(to))
  })

  it('faz a bola viajar no passe', () => {
    const from = initialState(scenario)
    const to = applyFrame(from, { ms: 100, moves: {}, ball: 'a2' })
    expect(interpolate(from, to, 0).ball).toEqual(ballPoint(from))
    expect(interpolate(from, to, 1).ball).toEqual(ballPoint(to))
    const x = interpolate(from, to, 0.5).ball[0]
    expect(x).toBeGreaterThan(ballPoint(from)[0])
    expect(x).toBeLessThan(ballPoint(to)[0])
  })

  it('desenha uma seta por opção com destino, parando antes do companheiro', () => {
    const arrows = arrowsFor(scenario, initialState(scenario))
    expect(arrows.map((a) => a.index)).toEqual([0, 1])
    const pass = arrows[0]!
    expect(pass.target).toBe('a2')
    expect(pass.end[0]).toBeLessThan(15)
  })

  it('na defesa, as setas saem da criança e não da bola', () => {
    const s = { ...initialState(scenario), ball: 'o1' }
    const arrows = arrowsFor(scenario, s)
    const shot = arrows.find((a) => a.index === 1)!
    // começa na borda do círculo da criança, em [6, 22]
    expect(Math.hypot(shot.from[0] - 6, shot.from[1] - 22)).toBeCloseTo(1.05)
  })

  it('encontra a melhor opção', () => {
    expect(bestOptionIndex(scenario)).toBe(0)
  })
})
