/**
 * Movimento contínuo dos lances. Cada trecho (a jogada até a pausa, a opção
 * escolhida) vira uma linha do tempo só: cada jogador segue uma curva suave
 * pelos pontos do roteiro, sem parar a cada quadro; a bola rola, é chutada e é
 * dominada como bola de verdade. Funções puras, sem React, para testar fácil.
 *
 * Dois relógios: o do lance (o `ms` de cada quadro do JSON) e o da tela. A
 * câmera lenta e a pausa só mudam o ritmo entre os dois, sempre de forma suave.
 * Velocidades em m/s no tempo do lance; tempos internos em segundos do lance.
 */
import type { Frame, Point } from '../api/types'
import { CARRY_AHEAD, CARRY_SIDE, COURT, applyFrame, restCarry, teamOf } from './engine'
import type { BallRef, BoardState, Motion, Snapshot } from './engine'

// ---------- Números do movimento ----------

/** Fração da velocidade que segue através da pausa (o resto o jogador freia na câmera lenta). */
export const FREEZE_KEEP = 0.6
/** Freada de quem vinha correndo e fica parado no trecho seguinte (s). */
const BRAKE_S = 0.3
/** Reação dos adversários: atraso fixo por jogador (s). */
export const REACTION_MIN = 0.08
export const REACTION_MAX = 0.25
/** Rampas do relógio (ms de tela): saída da pausa, entrada na pausa, troca de câmera lenta. */
const RAMP_IN_MS = 360
const RAMP_OUT_MS = 440
const RAMP_SLOW_MS = 300

/** Domínio: a bola encosta no pé e assenta à frente em ~0,2 s. */
export const CUSHION_S = 0.2
/** Onde a bola encosta no pé de quem recebe (m à frente do corpo). */
export const REACH = 0.45
/** Toque na bola: preparo antes da batida e volta depois (s do lance). */
const KICK_PRE = 0.24
const KICK_POST = 0.26
/** Fase do chute em que o pé bate na bola (kickPose). */
export const KICK_CONTACT = 0.52
/** Até esta distância de um jogador, a bola solta que muda de rumo foi tocada por ele. */
const KICK_REACH = 1.5
/** Passe mais curto que isso é desarme ou toque curto: sem chute armado. */
const KICK_MIN_M = 2.2
/** Condução: um toque a cada tantos metros, a bola sai um pouco mais à frente. */
const TOUCH_EVERY_M = 1.8
const TOUCH_PUSH = 0.24
/** Passe longo sobe; curto vai rasteiro. */
const LONG_PASS_M = 10
const ARC_MAX = 1.4

// ---------- Contas ----------

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const len = (p: Point) => Math.hypot(p[0], p[1])
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]]
const mul = (a: Point, k: number): Point => [a[0] * k, a[1] * k]
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]
const unit = (a: Point): Point => {
  const l = len(a)
  return l > 1e-9 ? [a[0] / l, a[1] / l] : [0, 0]
}
const same = (a: BallRef, b: BallRef) =>
  typeof a === 'string' || typeof b === 'string' ? a === b : Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6
/** Curva em S de 0 a 1 (derivada zero nas pontas). */
export const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}
const angleLerp = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t

/** Hermite cúbica: posição e velocidade num trecho de duração h, com s de 0 a 1. */
function hermite(p0: Point, m0: Point, p1: Point, m1: Point, h: number, s: number): { p: Point; v: Point } {
  const s2 = s * s
  const s3 = s2 * s
  const h00 = 2 * s3 - 3 * s2 + 1
  const h10 = s3 - 2 * s2 + s
  const h01 = -2 * s3 + 3 * s2
  const h11 = s3 - s2
  const d00 = 6 * s2 - 6 * s
  const d10 = 3 * s2 - 4 * s + 1
  const d01 = -6 * s2 + 6 * s
  const d11 = 3 * s2 - 2 * s
  return {
    p: [
      h00 * p0[0] + h10 * h * m0[0] + h01 * p1[0] + h11 * h * m1[0],
      h00 * p0[1] + h10 * h * m0[1] + h01 * p1[1] + h11 * h * m1[1],
    ],
    v: [
      (d00 * p0[0] + d01 * p1[0]) / h + d10 * m0[0] + d11 * m1[0],
      (d00 * p0[1] + d01 * p1[1]) / h + d10 * m0[1] + d11 * m1[1],
    ],
  }
}

function hash(text: string): number {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** Atraso de reação de cada adversário (s): fixo por jogador, sem sorteio a cada quadro. */
export function reactionLag(id: string): number {
  if (teamOf(id) !== 'them') return 0
  return REACTION_MIN + ((hash(id) % 1000) / 999) * (REACTION_MAX - REACTION_MIN)
}

// ---------- Jogadores ----------

interface Track {
  t: number[]
  p: Point[]
  m: Point[]
  /** Atraso de reação efetivo neste trecho (s) e a duração do trecho. */
  lag: number
  dur: number
}

/**
 * Relógio próprio do adversário: começa atrasado e alcança o roteiro no fim do
 * trecho. Assim ele reage depois dos outros, mas chega na pausa e no fim onde o
 * lance manda.
 */
function lagWarp(tr: Track, t: number): { u: number; du: number } {
  const d = tr.lag
  if (d <= 0) return { u: t, du: 1 }
  const D = tr.dur
  const rs = 4 * d
  const re = Math.max(4 * d, D / 2)
  let g = 1
  let dg = 0
  if (t < rs) {
    const x = t / rs
    g = x * x * (3 - 2 * x)
    dg = (6 * x * (1 - x)) / rs
  } else if (t > D - re) {
    const x = (t - (D - re)) / re
    g = 1 - x * x * (3 - 2 * x)
    dg = (-6 * x * (1 - x)) / re
  }
  return { u: clamp(t - d * g, 0, D), du: 1 - d * dg }
}

function evalTrack(tr: Track, t: number): { p: Point; v: Point } {
  const { u, du } = lagWarp(tr, clamp(t, 0, tr.dur))
  const n = tr.t.length
  if (n === 1 || u <= tr.t[0]!) return { p: tr.p[0]!, v: mul(tr.m[0]!, du) }
  if (u >= tr.t[n - 1]!) return { p: tr.p[n - 1]!, v: mul(tr.m[n - 1]!, du) }
  let k = 0
  while (k < n - 2 && u > tr.t[k + 1]!) k++
  const h = tr.t[k + 1]! - tr.t[k]!
  const r = hermite(tr.p[k]!, tr.m[k]!, tr.p[k + 1]!, tr.m[k + 1]!, h, (u - tr.t[k]!) / h)
  return { p: r.p, v: mul(r.v, du) }
}

const MOVE_EPS = 0.02

/**
 * Curva de um jogador pelos pontos do roteiro, com velocidade contínua nos
 * pontos do meio. Só para (velocidade zero) onde ele fica parado de verdade
 * entre dois quadros, no começo de um trecho que sai do repouso e no fim da opção.
 */
function buildTrack(times: number[], pts: Point[], v0: Point, end: 'freeze' | 'stop', lag: number): Track {
  const n = pts.length - 1
  const D = times[n]!
  const chord: Point[] = []
  const moving: boolean[] = []
  for (let k = 0; k < n; k++) {
    const c = sub(pts[k + 1]!, pts[k]!)
    moving.push(len(c) > MOVE_EPS)
    chord.push(mul(c, 1 / (times[k + 1]! - times[k]!)))
  }
  const m: Point[] = pts.map(() => [0, 0] as Point)
  m[0] = v0
  for (let k = 1; k < n; k++) {
    if (!moving[k - 1] || !moving[k]) continue
    const a = times[k]! - times[k - 1]!
    const b = times[k + 1]! - times[k]!
    // Derivada da parábola pelos três pontos (tempos diferentes de cada lado).
    m[k] = mul(add(mul(chord[k - 1]!, b), mul(chord[k]!, a)), 1 / (a + b))
  }
  if (end === 'freeze' && n > 0 && moving[n - 1]) m[n] = mul(chord[n - 1]!, FREEZE_KEEP)

  // Sem passar do ponto: tangentes grandes demais em relação ao trecho são reduzidas.
  for (let k = 0; k < n; k++) {
    if (!moving[k]) continue
    const h = times[k + 1]! - times[k]!
    const c = sub(pts[k + 1]!, pts[k]!)
    const L = len(c)
    const dir = mul(c, 1 / L)
    const a = (dot(m[k]!, dir) * h) / L
    const b = (dot(m[k + 1]!, dir) * h) / L
    const r = a * a + b * b
    if (r > 9) {
      const f = 3 / Math.sqrt(r)
      if (k > 0) m[k] = mul(m[k]!, f)
      m[k + 1] = mul(m[k + 1]!, f)
    }
  }

  const t = [...times]
  const p = [...pts]
  // Vinha correndo e o trecho manda ficar parado: freia passando um pouco do
  // ponto e volta devagar até ele (o ponto do roteiro continua valendo).
  if (n > 0 && !moving[0] && len(v0) > 0.05) {
    const tb = Math.min(BRAKE_S, (times[1]! - times[0]!) * 0.5)
    t.splice(1, 0, times[0]! + tb)
    p.splice(1, 0, add(pts[0]!, mul(v0, tb / 2)))
    m.splice(1, 0, [0, 0])
  }
  return { t, p, m, lag: Math.min(lag, D / 10), dur: D }
}

// ---------- Relógio (tela → lance) ----------

interface Clock {
  /** Início de cada quadro na tela (ms), sem contar as rampas. */
  W: number[]
  /** Início de cada quadro no lance (ms). */
  K: number[]
  rate: number[]
  /** Meia largura da rampa em cada fronteira (ms de tela). */
  half: number[]
  /** Ritmo antes e depois de cada fronteira. */
  before: number[]
  after: number[]
  duration: number
}

function buildClock(frames: Frame[], speed: number, rampIn: boolean, end: 'freeze' | 'stop'): Clock {
  const n = frames.length
  const rate = frames.map((f) => (f.slow && f.slow > 0 ? f.slow : 1) / speed)
  const lens = frames.map((f, i) => Math.max(1, f.ms) / rate[i]!)
  const half: number[] = []
  const before: number[] = []
  const after: number[] = []
  for (let j = 0; j <= n; j++) {
    const ra = j === 0 ? (rampIn ? 0 : rate[0]!) : rate[j - 1]!
    const rb = j === n ? (end === 'freeze' ? 0 : rate[n - 1]!) : rate[j]!
    before.push(ra)
    after.push(rb)
    let h = 0
    if (Math.abs(ra - rb) > 1e-9) {
      h = j === 0 ? RAMP_IN_MS / 2 : j === n ? RAMP_OUT_MS / 2 : RAMP_SLOW_MS / 2
      if (j > 0) h = Math.min(h, 0.45 * lens[j - 1]!)
      if (j < n) h = Math.min(h, 0.45 * lens[j]!)
    }
    half.push(h)
  }
  const W = [half[0]!]
  const K = [0]
  for (let i = 0; i < n; i++) {
    W.push(W[i]! + lens[i]!)
    K.push(K[i]! + Math.max(1, frames[i]!.ms))
  }
  return { W, K, rate, half, before, after, duration: W[n]! + half[n]! }
}

/** Tempo do lance (ms) e ritmo num instante da tela (ms desde o começo do trecho). */
function clockAt(c: Clock, w: number): { story: number; rate: number; frame: number } {
  const n = c.rate.length
  const total = c.K[n]!
  if (w >= c.duration) return { story: total, rate: c.after[n]!, frame: n - 1 }
  for (let j = 0; j <= n; j++) {
    const h = c.half[j]!
    if (h > 0 && Math.abs(w - c.W[j]!) < h) {
      const x = (w - (c.W[j]! - h)) / (2 * h)
      const ra = c.before[j]!
      const rb = c.after[j]!
      const s0 = c.K[j]! - ra * h
      const story = s0 + 2 * h * (ra * x + (rb - ra) * (x * x * x - (x * x * x * x) / 2))
      return { story: clamp(story, 0, total), rate: ra + (rb - ra) * smoothstep(x), frame: Math.min(n - 1, x < 0.5 ? j - 1 : j) }
    }
  }
  if (w <= c.W[0]!) return { story: 0, rate: c.before[0]!, frame: 0 }
  let i = 0
  while (i < n - 1 && w >= c.W[i + 1]!) i++
  if (w >= c.W[n]!) return { story: total, rate: c.after[n]!, frame: n - 1 }
  return { story: clamp(c.K[i]! + c.rate[i]! * (w - c.W[i]!), 0, total), rate: c.rate[i]!, frame: i }
}

// ---------- Bola ----------

type Piece =
  | { kind: 'carry'; t0: number; t1: number; id: string; rest: number; fix: Point | null }
  | { kind: 'rest'; t0: number; t1: number; at: Point }
  | { kind: 'coast'; t0: number; t1: number; at: Point; vel: Point }
  | { kind: 'roll'; t0: number; t1: number; path: Point[]; cum: number[]; vs: number; ve: number; arc: number }
  | { kind: 'cushion'; t0: number; t1: number; p0: Point; v0: Point; p1: Point; v1: Point }

interface Kick {
  id: string
  /** Começo do preparo, batida e fim (s do lance). */
  from: number
  at: number
  to: number
}

/** Chute (para o gol ou para fora pela linha de fundo perto do gol). */
function isShot(p: Point): boolean {
  return (p[1] < 0.3 || p[1] > COURT.length - 0.3) && p[0] > COURT.goalLeft - 1.5 && p[0] < COURT.goalRight + 1.5
}

function rollAt(pc: Extract<Piece, { kind: 'roll' }>, t: number): { p: Point; v: Point; h: number } {
  const T = pc.t1 - pc.t0
  const u = clamp((t - pc.t0) / T, 0, 1)
  const L = pc.cum[pc.cum.length - 1]!
  // Distância percorrida: começa rápida (o chute) e vai perdendo velocidade (rolando).
  const u2 = u * u
  const u3 = u2 * u
  const s = (u3 - 2 * u2 + u) * T * pc.vs + (-2 * u3 + 3 * u2) * L + (u3 - u2) * T * pc.ve
  const ds = (3 * u2 - 4 * u + 1) * pc.vs + ((-6 * u2 + 6 * u) * L) / T + (3 * u2 - 2 * u) * pc.ve
  const sc = clamp(s, 0, L)
  let k = 0
  while (k < pc.path.length - 2 && sc > pc.cum[k + 1]!) k++
  const a = pc.path[k]!
  const b = pc.path[k + 1]!
  const seg = pc.cum[k + 1]! - pc.cum[k]!
  const f = seg > 1e-9 ? (sc - pc.cum[k]!) / seg : 0
  const dir = unit(sub(b, a))
  return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], v: mul(dir, ds), h: pc.arc * Math.sin(Math.PI * u) }
}

// ---------- Trecho ----------

export interface ClipOptions {
  /** Multiplica a duração (1,7 com a opção "mais devagar"). */
  speed?: number
  /** "freeze": termina na pausa, ainda em movimento; "stop": todos param no fim. */
  end?: 'freeze' | 'stop'
}

export interface Clip {
  /** Duração na tela (ms). */
  duration: number
  /** Duração no lance (ms). */
  story: number
  /** Quadro desenhado `w` ms depois do começo do trecho. */
  sample(w: number): Snapshot
  /** Tempo do lance (ms) e ritmo num instante da tela. */
  clock(w: number): { story: number; rate: number }
  /** Câmera lenta neste instante? */
  slowAt(w: number): boolean
  /** Peças no fim, com o movimento para o próximo trecho continuar sem tranco. */
  end: BoardState
  /** Tempos (ms do lance) dos quadros-chave do roteiro. */
  keys: number[]
  /** Chutes do trecho (ms do lance da batida). */
  kicks: { id: string; at: number }[]
}

export function buildClip(start: BoardState, frames: Frame[], opts: ClipOptions = {}): Clip {
  const speed = opts.speed ?? 1
  const end = opts.end ?? 'stop'
  const n = frames.length
  const states: BoardState[] = [start]
  for (const f of frames) states.push(applyFrame(states[states.length - 1]!, f))
  const K = [0]
  frames.forEach((f, i) => K.push(K[i]! + Math.max(1, f.ms) / 1000))
  const D = K[n]!
  const motion = start.motion
  const ids = Object.keys(states[n]!.positions)

  // Jogadores.
  const tracks: Record<string, Track> = {}
  for (const id of ids) {
    const first = states.find((s) => s.positions[id])!.positions[id]!
    const pts = states.map((s) => s.positions[id] ?? first)
    tracks[id] = buildTrack(K, pts, motion?.vel[id] ?? [0, 0], end, reactionLag(id))
  }
  const at = (id: string, t: number) => (tracks[id] ? evalTrack(tracks[id], t) : { p: [0, 0] as Point, v: [0, 0] as Point })

  // Distância corrida por quem conduz (ritmo dos toques na bola).
  const distCache = new Map<string, Float64Array>()
  const DT = 1 / 60
  const distAt = (id: string, t: number) => {
    let tab = distCache.get(id)
    if (!tab) {
      const steps = Math.max(1, Math.ceil(D / DT))
      tab = new Float64Array(steps + 1)
      let prev = at(id, 0).p
      for (let i = 1; i <= steps; i++) {
        const p = at(id, Math.min(D, i * DT)).p
        tab[i] = tab[i - 1]! + len(sub(p, prev))
        prev = p
      }
      distCache.set(id, tab)
    }
    const x = clamp(t / DT, 0, tab.length - 1)
    const i = Math.floor(x)
    const j = Math.min(tab.length - 1, i + 1)
    return tab[i]! + (tab[j]! - tab[i]!) * (x - i)
  }

  /** Bola no pé de quem conduz: à frente no sentido da corrida, com o ritmo dos toques. */
  const carryOffset = (id: string, t: number, rest: number): Point => {
    const v = at(id, t).v
    const sp = len(v)
    const w = smoothstep((sp - 0.3) / 1.2)
    const ang = w > 0 ? angleLerp(rest, Math.atan2(v[1], v[0]), w) : rest
    const dir: Point = [Math.cos(ang), Math.sin(ang)]
    const phase = (distAt(id, t) / TOUCH_EVERY_M) % 1
    // Toque rápido para a frente e o jogador alcançando a bola até o próximo.
    const touch = phase < 0.15 ? smoothstep(phase / 0.15) : 1 - (phase - 0.15) / 0.85
    const d = CARRY_AHEAD + w * (0.1 + 0.03 * sp + TOUCH_PUSH * touch)
    return [dir[0] * d - dir[1] * CARRY_SIDE, dir[1] * d + dir[0] * CARRY_SIDE]
  }
  /** Ângulo de "à frente" de quem está parado com a bola (tirando o pequeno desvio para o lado). */
  const restAngle = (state: BoardState, id: string) => {
    const c = restCarry(state, id)
    const ahead = Math.sqrt(Math.max(1e-6, c[0] * c[0] + c[1] * c[1] - CARRY_SIDE * CARRY_SIDE))
    return Math.atan2(c[1], c[0]) - Math.atan2(CARRY_SIDE, ahead)
  }

  const pieces: Piece[] = []
  const kicks: Kick[] = []
  const B: BallRef[] = states.map((s) => s.ball)
  // Ângulo de "à frente" de cada jogador com a bola parada (vira para quem passou a bola).
  const restOf = new Map<string, number>()
  let carryFix: Point | null = null
  if (typeof B[0] === 'string') {
    restOf.set(B[0], restAngle(start, B[0]))
    if (motion?.carry) {
      // Continua de onde a bola estava na pausa, ajustando aos poucos.
      const c0 = carryOffset(B[0], 0, restOf.get(B[0])!)
      carryFix = sub(motion.carry, c0)
    }
  }

  const pieceAt = (t: number): Piece | undefined => {
    for (let i = pieces.length - 1; i >= 0; i--) if (t >= pieces[i]!.t0 - 1e-9) return pieces[i]
    return pieces[0]
  }
  const ballAt = (t: number): { p: Point; v: Point; h: number } => evalPiece(pieceAt(t), t)
  function evalPiece(pc: Piece | undefined, t: number): { p: Point; v: Point; h: number } {
    if (!pc) {
      const b = B[0]!
      if (typeof b !== 'string') return { p: b, v: [0, 0], h: 0 }
      const c = at(b, t)
      const off = add(carryOffset(b, t, restOf.get(b) ?? restAngle(start, b)), carryFix ?? [0, 0])
      return { p: add(c.p, off), v: c.v, h: 0 }
    }
    switch (pc.kind) {
      case 'carry': {
        const c = at(pc.id, t)
        let off = carryOffset(pc.id, t, pc.rest)
        if (pc.fix) off = add(off, mul(pc.fix, 1 - smoothstep(t / 0.3)))
        const p = add(c.p, off)
        // Velocidade da bola no pé: a do jogador (os toques são pequenos).
        return { p, v: c.v, h: 0 }
      }
      case 'rest':
        return { p: pc.at, v: [0, 0], h: 0 }
      case 'coast': {
        const dt = clamp(t, pc.t0, pc.t1) - pc.t0
        const sp = len(pc.vel)
        const dir = unit(pc.vel)
        const a = Math.min(1.5, sp / Math.max(1e-3, pc.t1 - pc.t0))
        return { p: add(pc.at, mul(dir, sp * dt - 0.5 * a * dt * dt)), v: mul(dir, sp - a * dt), h: 0 }
      }
      case 'roll':
        return rollAt(pc, t)
      case 'cushion': {
        const T = pc.t1 - pc.t0
        const r = hermite(pc.p0, pc.v0, pc.p1, pc.v1, T, clamp((t - pc.t0) / T, 0, 1))
        return { p: r.p, v: r.v, h: 0 }
      }
    }
  }
  const pushCarry = (id: string, t0: number, t1: number) => {
    const last = pieces[pieces.length - 1]
    if (last && last.kind === 'carry' && last.id === id && Math.abs(last.t1 - t0) < 1e-9) {
      last.t1 = t1
      return
    }
    const fix = t0 === 0 ? carryFix : null
    pieces.push({ kind: 'carry', t0, t1, id, rest: restOf.get(id) ?? restAngle(start, id), fix })
  }

  /** Jogador que tocou a bola solta em `p` (o mais perto, se ela mudou de rumo). */
  const toucher = (p: Point, t: number, inDir: Point, outDir: Point, except: string | null): string | null => {
    const turned = len(inDir) < 0.5 || dot(unit(inDir), unit(outDir)) < Math.cos((40 * Math.PI) / 180)
    if (!turned) return null
    let best: string | null = null
    let bd = KICK_REACH
    for (const id of ids) {
      if (id === except) continue
      const d = len(sub(at(id, t).p, p))
      if (d < bd) {
        bd = d
        best = id
      }
    }
    return best
  }

  let i = 0
  while (i < n) {
    const a = B[i]!
    const b = B[i + 1]!
    if (same(a, b)) {
      if (typeof a === 'string') pushCarry(a, K[i]!, K[i + 1]!)
      else pieces.push({ kind: 'rest', t0: K[i]!, t1: K[i + 1]!, at: a })
      i++
      continue
    }
    // Voo da bola: do quadro i até o j, passando pelos pontos do meio.
    let j = i
    const ts = K[i]!
    const startP = typeof a === 'string' ? null : a
    const inVel: Point = i === 0 ? (startP ? (motion?.ballVel ?? [0, 0]) : [0, 0]) : startP ? ballAt(ts).v : [0, 0]
    while (j + 1 < n) {
      const wp = B[j + 1]!
      const nx = B[j + 2]!
      if (typeof wp === 'string' || same(wp, nx)) break
      // O roteiro desvia a bola num ponto perto de um jogador: é um toque dele, outro voo.
      const prev = j === i ? (typeof a === 'string' ? at(a, K[i]!).p : a) : (B[j] as Point)
      const nxP = typeof nx === 'string' ? at(nx, K[j + 2]!).p : nx
      if (toucher(wp, K[j + 1]!, sub(wp, prev), sub(nxP, wp), typeof nx === 'string' ? nx : null)) break
      j++
    }
    const te = K[j + 1]!
    const dest = B[j + 1]!
    const receiver = typeof dest === 'string' ? dest : null
    const firstTarget: Point =
      j > i ? (B[i + 1] as Point) : receiver ? at(receiver, te).p : (dest as Point)
    // Quem chuta: o dono da bola, ou quem estava perto da bola solta quando ela mudou de rumo.
    let kicker: string | null = typeof a === 'string' ? a : null
    if (startP) kicker = toucher(startP, ts, inVel, sub(firstTarget, startP), receiver)
    // Bola tirada do pé de quem está do lado é desarme, não chute.
    if (typeof a === 'string' && receiver && len(sub(at(a, ts).p, at(receiver, te).p)) < KICK_MIN_M) kicker = null
    // Chute logo no começo do trecho: o pé precisa de um instante para armar.
    const lead = kicker && ts < KICK_PRE ? Math.min(KICK_PRE - ts, 0.3 * (te - ts)) : 0
    const tc = ts + lead
    if (lead > 0) {
      if (typeof a === 'string') pushCarry(a, ts, tc)
      else pieces.push({ kind: 'coast', t0: ts, t1: tc, at: a, vel: inVel })
    }
    const dep = lead > 0 || typeof a === 'string' ? ballAt(tc) : { p: a, v: inVel, h: 0 }
    // Quem recebe e segura a bola amortece; quem toca de primeira devolve na hora.
    const oneTouch = receiver !== null && j + 1 < n && !same(B[j + 2]!, receiver)
    const cush = receiver && !oneTouch ? Math.min(CUSHION_S, 0.3 * (te - tc)) : 0
    const tArr = te - cush
    const way = B.slice(i + 1, j + 1) as Point[]
    const from = way.length ? way[way.length - 1]! : dep.p
    let destP: Point
    let u: Point
    if (receiver) {
      const r = at(receiver, tArr).p
      u = unit(sub(r, from))
      destP = len(sub(r, from)) > REACH + 0.05 ? sub(r, mul(u, REACH)) : from
    } else {
      destP = dest as Point
      u = unit(sub(destP, from))
    }
    const path = [dep.p, ...way, destP]
    const cum = [0]
    for (let k = 1; k < path.length; k++) cum.push(cum[k - 1]! + len(sub(path[k]!, path[k - 1]!)))
    const L = cum[cum.length - 1]!
    const T = Math.max(1e-3, tArr - tc)
    const avg = L / T
    const next = j + 2 <= n ? B[j + 2] : undefined
    const stopsHere = !receiver && next !== undefined && same(dest, next)
    const shot = !receiver && isShot(destP)
    let ve: number
    if (receiver) ve = 0.55 * avg
    else if (stopsHere) ve = 0
    else if (j + 1 === n) ve = end === 'freeze' ? 0.6 * avg : shot ? 0.55 * avg : 0.2 * avg
    else ve = 0.6 * avg
    let vs: number
    if (kicker) vs = Math.max(0, 2 * avg - ve)
    else {
      // Bola que já vinha rolando: segue com a velocidade que tinha.
      const d0 = unit(sub(path[1] ?? destP, path[0]!))
      vs = clamp(dot(dep.v, d0), 0, 2.8 * avg)
      if (!receiver && !stopsHere && !(j + 1 === n && end === 'stop')) ve = clamp(2 * avg - vs, 0.25 * avg, 1.2 * avg)
    }
    const arc = L < 0.5 ? 0 : shot ? Math.min(ARC_MAX, 0.25 + L * 0.05) : L >= LONG_PASS_M ? Math.min(ARC_MAX, (L - 7) * 0.09) : 0
    if (kicker && L >= KICK_MIN_M) kicks.push({ id: kicker, from: Math.max(0, tc - KICK_PRE), at: tc, to: tc + KICK_POST })
    const roll: Piece = { kind: 'roll', t0: tc, t1: tArr, path, cum, vs, ve, arc }
    pieces.push(roll)
    if (receiver) {
      // Recebeu: a bola assenta à frente, virado para onde ela veio.
      const rest = Math.atan2(-u[1], -u[0])
      restOf.set(receiver, rest)
      if (cush > 0) {
        const c = at(receiver, te)
        pieces.push({
          kind: 'cushion',
          t0: tArr,
          t1: te,
          p0: destP,
          v0: mul(u, ve),
          p1: add(c.p, carryOffset(receiver, te, rest)),
          v1: c.v,
        })
      }
    }
    i = j + 1
  }
  if (!pieces.length) {
    const b = B[0]!
    if (typeof b === 'string') pushCarry(b, 0, D)
    else pieces.push({ kind: 'rest', t0: 0, t1: D, at: b })
  }

  const kickAt = (t: number): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const k of kicks) {
      if (t < k.from || t > k.to) continue
      out[k.id] =
        t < k.at
          ? KICK_CONTACT * (k.at > k.from ? (t - k.from) / (k.at - k.from) : 1)
          : KICK_CONTACT + (1 - KICK_CONTACT) * ((t - k.at) / (k.to - k.at))
    }
    return out
  }

  const clock = buildClock(frames, speed, !!motion && hasMotion(motion), end)

  const sampleStory = (t: number, rate: number): Snapshot => {
    const positions: Record<string, Point> = {}
    const vel: Record<string, Point> = {}
    for (const id of ids) {
      const r = at(id, t)
      positions[id] = r.p
      vel[id] = r.v
    }
    const b = ballAt(t)
    return { positions, ball: b.p, ballHeight: Math.max(0, b.h), vel, rate, kick: kickAt(t) }
  }

  // Fim do trecho: posições exatas do roteiro e o movimento para o próximo.
  const last = states[n]!
  const endSnap = sampleStory(D, clock.after[n]!)
  const endVel: Record<string, Point> = {}
  for (const id of ids) endVel[id] = endSnap.vel[id]!
  const lastBall = B[n]!
  const ballEnd = ballAt(D)
  const endMotion: Motion = {
    vel: endVel,
    ballVel: typeof lastBall === 'string' ? [0, 0] : ballEnd.v,
    carry: typeof lastBall === 'string' ? sub(ballEnd.p, last.positions[lastBall]!) : null,
  }
  const endState: BoardState = { ...last, motion: endMotion }

  return {
    duration: clock.duration,
    story: D * 1000,
    keys: K.map((k) => k * 1000),
    kicks: kicks.map((k) => ({ id: k.id, at: k.at * 1000 })),
    end: endState,
    clock: (w) => {
      const c = clockAt(clock, w)
      return { story: c.story, rate: c.rate }
    },
    slowAt: (w) => {
      if (w >= clock.duration) return false
      const c = clockAt(clock, w)
      const f = frames[c.frame]
      return !!f && !!f.slow && f.slow > 0 && f.slow < 1
    },
    sample: (w) => {
      if (w >= clock.duration) return { ...endSnap, positions: { ...last.positions } }
      const c = clockAt(clock, w)
      return sampleStory(c.story / 1000, c.rate)
    },
  }
}

export function hasMotion(m: Motion): boolean {
  return Object.values(m.vel).some((v) => len(v) > 0.05) || len(m.ballVel) > 0.05
}
