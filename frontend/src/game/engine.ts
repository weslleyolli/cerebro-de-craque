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

/**
 * Como as peças estavam se mexendo no fim de um trecho (a pausa congela no meio
 * da corrida): o trecho seguinte começa com essas velocidades, sem tranco.
 */
export interface Motion {
  /** Velocidade de cada jogador, em m/s no tempo do lance. */
  vel: Record<string, Point>
  /** Velocidade da bola solta (m/s). */
  ballVel: Point
  /** Bola com alguém: onde ela está em relação ao pé de quem conduz. */
  carry: Point | null
}

export interface BoardState {
  positions: Record<string, Point>
  ball: BallRef
  face: Record<string, Facing>
  /** Movimento no fim do trecho anterior (só existe depois de uma animação). */
  motion?: Motion
}

/** O que a tela desenha num instante: posições e a bola já resolvida em ponto. */
export interface Snapshot {
  positions: Record<string, Point>
  ball: Point
  /** Altura da bola em metros (0 no chão). Só a visão 3D usa. */
  ballHeight: number
  /** Velocidade de cada jogador em m/s no tempo do lance (a visão 3D anima as pernas por ela). */
  vel: Record<string, Point>
  /** Ritmo do tempo na tela: 1 normal, 0,3 na câmera lenta, 0 na pausa. */
  rate: number
  /** Chute em andamento (0 a 1) de quem está chutando; a batida na bola é em 0,52. */
  kick: Record<string, number>
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

/** A bola parada no pé fica a esta distância à frente de quem conduz. */
export const CARRY_AHEAD = 0.32
/** E um pouco para o lado do pé direito. */
export const CARRY_SIDE = 0.08

/** Bola no pé de quem está parado: à frente, no sentido em que o jogador olha. */
export function restCarry(state: BoardState, id: string): Point {
  const keep = state.motion?.carry
  if (keep) return keep
  const f = facing(state, id)
  // Olhando para cima (y diminuindo), a direita é +x.
  return [-f * CARRY_SIDE, f * CARRY_AHEAD]
}

/** A bola com um jogador fica no pé, um pouco à frente dele. */
export function ballPoint(state: BoardState): Point {
  if (typeof state.ball !== 'string') return state.ball
  const p = state.positions[state.ball]
  if (!p) throw new Error(`Jogador "${state.ball}" não está na quadra`)
  const c = restCarry(state, state.ball)
  return [p[0] + c[0], p[1] + c[1]]
}

/** Quadro parado: as peças onde estão (congeladas no meio do movimento, se vieram de uma animação). */
export function snapshotOf(state: BoardState): Snapshot {
  return {
    positions: { ...state.positions },
    ball: ballPoint(state),
    ballHeight: 0,
    vel: state.motion ? { ...state.motion.vel } : {},
    rate: state.motion ? 0 : 1,
    kick: {},
  }
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
