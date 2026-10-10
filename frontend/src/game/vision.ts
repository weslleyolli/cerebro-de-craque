/**
 * Memória visual da criança durante o lance, compartilhada entre a visão 3D e a
 * tela do treino. Sem three.js aqui, para não puxar o 3D para o pacote principal.
 */
import type { Point, Scenario } from '../api/types'
import { initialState, snapshotOf } from './engine'
import type { BoardState } from './engine'
import { pointKey, yawTo } from './scan'

export type ScanMode = 'live' | 'frozen' | 'follow' | 'ghost'

export interface Vision {
  /** Quando cada jogador (id) ou ponto (pointKey) foi visto pela última vez (performance.now). */
  lastSeen: Map<string, number>
  /** Onde cada jogador estava quando foi visto pela última vez. */
  lastPos: Map<string, Point>
  /** Quando cada jogador estava no campo de visão, mas tapado por outro. */
  lastBlocked: Map<string, number>
  /** Olhadas em volta durante a jogada (antes da pausa). */
  scans: number
  /** Passo para o lado (metros, na quadra), ainda não incorporado ao lance. */
  offset: Point
  /** Para onde a criança está olhando agora. */
  yaw: number
}

export function newVision(): Vision {
  return { lastSeen: new Map(), lastPos: new Map(), lastBlocked: new Map(), scans: 0, offset: [0, 0], yaw: 0 }
}

/**
 * Para onde a criança olha quando o lance começa: da posição inicial dela para
 * a bola. Vem do roteiro do lance, nunca do quadro na tela (que ainda pode ser o
 * fim do lance anterior).
 */
export function initialYaw(scenario: Scenario): number {
  const s = snapshotOf(initialState(scenario))
  const you = s.positions.v
  return you ? yawTo(you, s.ball) : 0
}

/** Até esta distância (metros), a bola solta que chega na criança acompanha o passo dela. */
export const STEP_CARRY_M = 3

/**
 * Incorpora o passo para o lado ao lance, na pausa: a criança anda e o passe que
 * está chegando nela vai junto, para a bola continuar nos pés dela. Bola com
 * outro jogador ou longe não muda.
 */
export function applyStep(state: BoardState, offset: Point): BoardState {
  const you = state.positions.v
  if (!you || (!offset[0] && !offset[1])) return state
  const ball = state.ball
  const carry =
    typeof ball !== 'string' && Math.hypot(ball[0] - you[0], ball[1] - you[1]) <= STEP_CARRY_M
  return {
    ...state,
    positions: { ...state.positions, v: [you[0] + offset[0], you[1] + offset[1]] },
    ball: carry ? [ball[0] + offset[0], ball[1] + offset[1]] : ball,
  }
}

/** Ponto que representa uma opção na quadra: o companheiro, o espaço ou a própria criança. */
export function optionAnchor(scenario: Scenario, i: number, positions: Record<string, Point>): Point | null {
  const o = scenario.options[i]
  if (!o) return null
  if (o.target) return positions[o.target] ?? null
  if (o.hint) return o.hint
  return positions.v ?? null
}

/** O que a criança precisava ver: chave na memória e ponto na quadra. */
export function awareTarget(
  scenario: Scenario,
  positions: Record<string, Point>,
): { key: string; at: Point } | null {
  const see = scenario.aware?.see
  if (!see) return null
  if (typeof see === 'string') {
    const at = positions[see]
    return at ? { key: see, at } : null
  }
  return { key: pointKey(see), at: see }
}

/** Janela em que "ver antes de receber" vale: o que foi visto há mais tempo já mudou. */
export const AWARE_WINDOW_MS = 4500
