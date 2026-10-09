/**
 * Motor da quadra: estado das peças, aplicação de um trecho da animação e
 * interpolação entre dois estados. Funções puras, sem React, para testar fácil.
 *
 * Coordenadas em metros: x de 0 a 20 (largura) e y de 0 a 40 (comprimento).
 * y = 0 é o gol adversário; o time do jogador ataca para cima.
 */
import type { Frame, Point, Scenario } from '../api/types'

export type Facing = 'up' | 'down'
export type BallRef = string | Point

export interface BoardState {
  positions: Record<string, Point>
  ball: BallRef
  face: Record<string, Facing>
}

/** O que a tela desenha num instante: posições e a bola já resolvida em ponto. */
export interface Snapshot {
  positions: Record<string, Point>
  ball: Point
}

export type Team = 'you' | 'us' | 'them'

/** Goleiros que não precisam aparecer no JSON de cada jogada. */
export const BASE_POSITIONS: Record<string, Point> = { gk: [10, 38.6], o0: [10, 1.2] }

export const COURT = { width: 20, length: 40, goalLeft: 8.5, goalRight: 11.5 } as const

export function teamOf(id: string): Team {
  if (id === 'v') return 'you'
  return id.startsWith('o') ? 'them' : 'us'
}

export function initialState(s: Scenario): BoardState {
  return {
    positions: { ...BASE_POSITIONS, ...s.start.positions },
    ball: s.start.ball,
    face: { ...s.face },
  }
}

export function applyFrame(state: BoardState, frame: Frame): BoardState {
  return {
    positions: { ...state.positions, ...frame.moves },
    ball: frame.ball ?? state.ball,
    face: state.face,
  }
}

/** +1 quando o jogador olha para baixo (nosso gol), -1 quando olha para cima. */
export function facing(state: BoardState, id: string): 1 | -1 {
  const f = state.face[id]
  if (f) return f === 'down' ? 1 : -1
  return teamOf(id) === 'them' ? 1 : -1
}

const BALL_AHEAD = 0.8
const BALL_SIDE = 0.25

/** A bola com um jogador fica no pé, um pouco à frente dele. */
export function ballPoint(state: BoardState): Point {
  if (typeof state.ball !== 'string') return state.ball
  const p = state.positions[state.ball]
  if (!p) throw new Error(`Jogador "${state.ball}" não está na quadra`)
  return [p[0] + BALL_SIDE, p[1] + BALL_AHEAD * facing(state, state.ball)]
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
export const easeOut = (t: number) => 1 - (1 - t) ** 2

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Estado intermediário entre `from` e `to`, com `t` de 0 a 1. */
export function interpolate(from: BoardState, to: BoardState, t: number): Snapshot {
  const r = Math.min(1, Math.max(0, t))
  const e = easeInOut(r)
  const positions: Record<string, Point> = {}
  for (const id of Object.keys(to.positions)) {
    const b = to.positions[id]!
    const a = from.positions[id] ?? b
    positions[id] = [lerp(a[0], b[0], e), lerp(a[1], b[1], e)]
  }

  // Bola no pé do mesmo jogador: acompanha o jogador. Passe ou chute: viaja sozinha.
  const carried = typeof from.ball === 'string' && from.ball === to.ball
  if (carried) return { positions, ball: ballPoint({ positions, ball: to.ball, face: from.face }) }

  const b0 = ballPoint(from)
  const b1 = ballPoint(to)
  const eb = easeOut(r)
  return { positions, ball: [lerp(b0[0], b1[0], eb), lerp(b0[1], b1[1], eb)] }
}

export function snapshotOf(state: BoardState): Snapshot {
  return { positions: { ...state.positions }, ball: ballPoint(state) }
}

export interface Arrow {
  index: number
  from: Point
  /** Onde a ponta da seta termina (antes do jogador, quando é passe). */
  end: Point
  /** Onde fica a etiqueta com a letra da opção. */
  label: Point
  target: string | null
}

const ARROW_GAP_PLAYER = 1.05
const ARROW_GAP_POINT = 0.2
const YOU = 'v'

/**
 * Setas da pausa tática, uma por opção. Saem da bola quando a criança está com
 * ela (passe, chute, drible) e da própria criança quando a bola está com outro
 * (defesa: para onde se posicionar).
 */
export function arrowsFor(s: Scenario, state: BoardState): Arrow[] {
  const you = state.positions[YOU]
  if (!you) return []
  const hasBall = state.ball === YOU
  const origin = hasBall ? ballPoint(state) : you
  const startGap = hasBall ? 0 : ARROW_GAP_PLAYER
  const arrows: Arrow[] = []
  s.options.forEach((o, index) => {
    const to = o.target ? state.positions[o.target] : o.hint
    if (!to) return
    const dx = to[0] - origin[0]
    const dy = to[1] - origin[1]
    const len = Math.hypot(dx, dy)
    const endGap = o.target ? ARROW_GAP_PLAYER : ARROW_GAP_POINT
    if (len <= startGap + endGap + 0.3) return
    const at = (d: number): Point => [origin[0] + (dx * d) / len, origin[1] + (dy * d) / len]
    arrows.push({
      index,
      from: at(startGap),
      end: at(len - endGap),
      label: at(startGap + (len - startGap - endGap) * 0.55),
      target: o.target,
    })
  })
  return arrows
}

export function bestOptionIndex(s: Scenario): number {
  return s.options.findIndex((o) => o.grade === 'best')
}

export function totalMs(frames: Frame[]): number {
  return frames.reduce((n, f) => n + f.ms, 0)
}
