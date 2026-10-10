/**
 * Visão do jogador ("scanning"): para onde a criança está olhando, quem ela
 * consegue ver, quem está tapado por outro jogador e quantas vezes ela olhou em
 * volta antes de a bola chegar. Funções puras, testadas sem 3D.
 *
 * Ângulos ("yaw") em radianos, na quadra vista de cima: 0 aponta para o gol
 * adversário (y diminuindo); positivo gira para a direita (x aumentando).
 */
import type { Point } from '../api/types'

export const TAU = Math.PI * 2

/** Direção para olhar de `from` até `to`. */
export function yawTo(from: Point, to: Point): number {
  return Math.atan2(to[0] - from[0], -(to[1] - from[1]))
}

/** Vetor unitário (na quadra) para um ângulo. */
export function dirFromYaw(yaw: number): Point {
  return [Math.sin(yaw), -Math.cos(yaw)]
}

/** Diferença b − a, no intervalo (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU
  if (d <= -Math.PI) d += TAU
  if (d > Math.PI) d -= TAU
  return d
}

/** Abertura horizontal da câmera a partir da vertical (graus) e da proporção da tela. */
export function horizontalFov(verticalFovDeg: number, aspect: number): number {
  return 2 * Math.atan(Math.tan((verticalFovDeg * Math.PI) / 360) * aspect)
}

/** Abertura vertical da câmera da visão do jogador (graus). */
export const VISION_FOV = 70

/**
 * Abertura que vale para o que a criança viu (memória, "viu o que importava",
 * opções encontradas): a de um celular em pé, seja qual for o formato da tela.
 * Assim, deitar o celular ou jogar no computador não deixa ver mais sem girar.
 */
export const VISION_HFOV = horizontalFov(VISION_FOV, 0.8)

/** O ponto está dentro do campo de visão (só o ângulo, sem contar quem tapa)? */
export function inView(eye: Point, yaw: number, hfov: number, target: Point, margin = 0): boolean {
  return Math.abs(angleDiff(yaw, yawTo(eye, target))) <= hfov / 2 + margin
}

/** Distância de `p` ao segmento a–b e a posição (0 a 1) do ponto mais próximo. */
export function segmentDistance(a: Point, b: Point, p: Point): { d: number; t: number } {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
  return { d: Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)), t }
}

export const BODY_RADIUS = 0.3
export const TALL_RADIUS = 0.4

export interface Blocker {
  id: string
  at: Point
  radius: number
}

/**
 * Alguém está na frente, entre o olho e o alvo? Simplificação em planta (2D):
 * o corpo é um cilindro mais alto que a linha de visão (olho ~1,5 m, peito ~1,1 m).
 */
export function occludedBy(eye: Point, target: Point, blockers: Blocker[]): string | null {
  for (const b of blockers) {
    const { d, t } = segmentDistance(eye, target, b.at)
    if (t > 0.04 && t < 0.96 && d < b.radius) return b.id
  }
  return null
}

/** A linha de passe está livre: nenhum adversário a menos de `width` metros dela. */
export function laneClear(from: Point, to: Point, opponents: Point[], width = 1.1): boolean {
  return opponents.every((o) => {
    const { d, t } = segmentDistance(from, to, o)
    return t <= 0.02 || t >= 0.98 || d >= width
  })
}

/**
 * Balanço defensivo: o marcador "cercar" acompanha a bola de um lado para o
 * outro, sem largar a posição. Contínuo, para não dar saltos na animação.
 */
export const BALANCE = 0.22
export const BALANCE_MAX = 1.2

export function applyAI(
  positions: Record<string, Point>,
  ball: Point,
  ai: Record<string, 'cercar'>,
): Record<string, Point> {
  const ids = Object.keys(ai)
  if (!ids.length) return positions
  const out = { ...positions }
  for (const id of ids) {
    const p = positions[id]
    if (!p || ai[id] !== 'cercar') continue
    const shift = Math.max(-BALANCE_MAX, Math.min(BALANCE_MAX, (ball[0] - p[0]) * BALANCE))
    out[id] = [p[0] + shift, p[1]]
  }
  return out
}

/**
 * Conta as "olhadas": cada vez que a criança tira os olhos da bola por mais de
 * `away` radianos durante pelo menos `dwellMs`, conta uma. Para contar de novo,
 * ela precisa voltar a olhar para perto da bola.
 */
export class ScanTracker {
  count = 0
  private awaySince: number | null = null
  private counted = false

  constructor(
    private readonly away = Math.PI / 3,
    private readonly back = Math.PI / 5,
    private readonly dwellMs = 150,
  ) {}

  update(now: number, lookYaw: number, ballYaw: number): number {
    const off = Math.abs(angleDiff(ballYaw, lookYaw))
    if (off >= this.away) {
      if (this.awaySince === null) this.awaySince = now
      if (!this.counted && now - this.awaySince >= this.dwellMs) {
        this.count++
        this.counted = true
      }
    } else if (off <= this.back) {
      this.awaySince = null
      this.counted = false
    }
    return this.count
  }

  reset() {
    this.count = 0
    this.awaySince = null
    this.counted = false
  }
}

/** Onde fica `target` em relação a quem olha na direção `yaw`. */
export function directionWord(yaw: number, eye: Point, target: Point): string {
  const d = angleDiff(yaw, yawTo(eye, target))
  const a = Math.abs(d)
  if (a <= Math.PI / 4) return 'na sua frente'
  if (a >= (3 * Math.PI) / 4) return 'nas suas costas'
  return d > 0 ? 'à sua direita' : 'à sua esquerda'
}

/** Chave da memória para um ponto da quadra (opções de espaço vazio). */
export function pointKey(p: Point): string {
  return `pt:${p[0]},${p[1]}`
}

/** Quanto tempo uma lembrança fica nítida no minimapa antes de sumir. */
export const MEMORY_FRESH_MS = 1000
export const MEMORY_FADE_MS = 3500

/** Opacidade de algo visto há `ageMs`: 1 enquanto fresco, apagando até sumir. */
export function memoryOpacity(ageMs: number): number {
  if (ageMs <= MEMORY_FRESH_MS) return 1
  if (ageMs >= MEMORY_FADE_MS) return 0
  return 1 - (ageMs - MEMORY_FRESH_MS) / (MEMORY_FADE_MS - MEMORY_FRESH_MS)
}

/** Visto até `windowMs` antes de `at`? (ex.: a criança viu o companheiro antes de a bola chegar) */
export function seenRecently(lastSeen: number | undefined, at: number, windowMs = 3500): boolean {
  return lastSeen !== undefined && at - lastSeen <= windowMs
}
