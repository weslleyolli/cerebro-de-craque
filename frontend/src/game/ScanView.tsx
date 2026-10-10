/**
 * Visão do jogador ("scanning"). A câmera fica atrás do ombro da criança, na
 * altura dos olhos, e ela arrasta o dedo para virar a cabeça. Só aparece no
 * minimapa o que ela viu há pouco; quem fica fora da visão some da memória.
 *
 * Na pausa, o tempo congela: ela gira 360°, vê os realces no chão (zona
 * vermelha de quem vem pressionar, corredor verde de passe ou espaço livre) e
 * escolhe uma das opções que aparecem como hologramas na quadra.
 */
import { Canvas, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'

import type { Point, Scenario } from '../api/types'
import { LETTERS } from '../lib/catalog'
import { COURT, teamOf } from './engine'
import type { Snapshot } from './engine'
import {
  BODY_RADIUS,
  ScanTracker,
  TALL_RADIUS,
  VISION_FOV,
  VISION_HFOV,
  applyAI,
  dirFromYaw,
  inView,
  laneClear,
  memoryOpacity,
  occludedBy,
  pointKey,
  yawTo,
} from './scan'
import type { Blocker } from './scan'
import { HERO_KIT, rivalKit, teamKit } from './three/anime'
import type { Kit } from './three/anime'
import { Ball, CourtModel, FLAT, Figure, LABEL_HEIGHT, usePalette } from './three/scene'
import type { Palette } from './three/scene'
import { awareTarget, initialYaw, optionAnchor } from './vision'
import type { ScanMode, Vision } from './vision'

// ---------- Câmera ----------

// Atrás e acima do ombro: a criança se vê pequena no canto e enxerga a quadra.
const EYE_HEIGHT = 1.9
const BEHIND = 1.9
const SHOULDER = 0.6
const PITCH_DEFAULT = -0.2
/** Sem mexer na tela por este tempo, a cabeça volta a acompanhar a bola. */
const IDLE_FOLLOW_MS = 1200
const FOLLOW_SPEED = 1.6
const PITCH_MIN = -0.55
const PITCH_MAX = 0.25
const DRAG_YAW = 0.0072 // rad por pixel (~0,4°)
const DRAG_PITCH = 0.005
const KEY_YAW_SPEED = 2.2 // rad/s com a seta apertada
const STEP = 0.7
const STEP_MAX = 1.4

interface Shared {
  positions: Record<string, Point>
  ball: Point
  you: Point
  blockers: Blocker[]
  points: { key: string; at: Point }[]
  anchors: (Point | null)[]
}

function eyeOf(you: Point, yaw: number): Point {
  const f = dirFromYaw(yaw)
  const right: Point = [Math.cos(yaw), Math.sin(yaw)]
  return [you[0] - f[0] * BEHIND + right[0] * SHOULDER, you[1] - f[1] * BEHIND + right[1] * SHOULDER]
}

function Rig({
  shared,
  yaw,
  pitch,
  keys,
  mode,
  ghostYaw,
  vision,
  tracker,
  onFound,
  showOptions,
  lastInput,
  onReady,
}: {
  lastInput: MutableRefObject<number>
  onReady?: () => void
  shared: MutableRefObject<Shared>
  yaw: MutableRefObject<number>
  pitch: MutableRefObject<number>
  keys: MutableRefObject<Set<string>>
  mode: ScanMode
  ghostYaw: number | null
  vision: MutableRefObject<Vision>
  tracker: MutableRefObject<ScanTracker>
  onFound: (found: number[]) => void
  showOptions: boolean
}) {
  const look = useMemo(() => new THREE.Vector3(), [])
  const foundKey = useRef('')
  const started = useRef(false)

  useFrame(({ camera }, dt) => {
    const step = Math.min(dt, 0.1)
    const s = shared.current
    const now = performance.now()
    // Primeiro quadro: a visão já está contando o que a criança vê, o lance pode começar.
    if (!started.current) {
      started.current = true
      onReady?.()
    }

    // Setas do teclado viram a cabeça (computador).
    if (keys.current.size) lastInput.current = now
    if (keys.current.has('ArrowLeft')) yaw.current -= KEY_YAW_SPEED * step
    if (keys.current.has('ArrowRight')) yaw.current += KEY_YAW_SPEED * step
    if (keys.current.has('ArrowUp')) pitch.current = Math.min(PITCH_MAX, pitch.current + step)
    if (keys.current.has('ArrowDown')) pitch.current = Math.max(PITCH_MIN, pitch.current - step)

    // Depois da escolha, a câmera acompanha a bola; no fantasma, vira sozinha para o que importava.
    // Durante a jogada, sem mexer na tela, a cabeça acompanha a bola sozinha (como no jogo):
    // olhar em volta é o gesto de propósito.
    const idleLive = mode === 'live' && now - lastInput.current > IDLE_FOLLOW_MS
    const want =
      mode === 'follow' || idleLive
        ? yawTo(s.you, s.ball)
        : mode === 'ghost' && ghostYaw !== null
          ? ghostYaw
          : null
    if (want !== null) {
      const d = Math.atan2(Math.sin(want - yaw.current), Math.cos(want - yaw.current))
      const speed = mode === 'ghost' ? 2.2 : mode === 'follow' ? 3.5 : FOLLOW_SPEED
      yaw.current += d * Math.min(1, step * speed)
      pitch.current += (PITCH_DEFAULT - pitch.current) * Math.min(1, step * 3)
    }

    const eye = eyeOf(s.you, yaw.current)
    const f = dirFromYaw(yaw.current)
    camera.position.set(eye[0], EYE_HEIGHT, eye[1])
    look.set(eye[0] + f[0] * 10, EYE_HEIGHT + Math.tan(pitch.current) * 10, eye[1] + f[1] * 10)
    camera.lookAt(look)

    // O que a criança está vendo agora. Conta o que os olhos DELA veriam (da
    // posição dela), não o da câmera atrás do ombro: assim quem está na frente
    // tapa de verdade, e o passo para o lado é o que destapa. A abertura é fixa
    // (VISION_HFOV), não a da tela: o que conta como visto é igual em qualquer aparelho.
    const hfov = VISION_HFOV
    const v = vision.current
    const eyes = s.you
    v.yaw = yaw.current
    for (const [id, at] of Object.entries(s.positions)) {
      if (id === 'v') continue
      if (!inView(eyes, yaw.current, hfov, at, 0.04)) continue
      if (occludedBy(eyes, at, s.blockers.filter((b) => b.id !== id))) {
        v.lastBlocked.set(id, now)
        continue
      }
      v.lastSeen.set(id, now)
      v.lastPos.set(id, at)
    }
    for (const p of s.points) if (inView(eyes, yaw.current, hfov, p.at)) v.lastSeen.set(p.key, now)
    if (mode === 'live') v.scans = tracker.current.update(now, yaw.current, yawTo(s.you, s.ball))

    // Na pausa: quais opções (hologramas) já entraram no campo de visão.
    if (!showOptions) foundKey.current = ''
    else {
      const found: number[] = []
      s.anchors.forEach((a, i) => {
        if (a && inView(eye, yaw.current, hfov, a, 0.02)) found.push(i)
      })
      const k = found.join(',')
      if (k && k !== foundKey.current) {
        foundKey.current = k
        onFound(found)
      }
    }
  })
  return null
}

// ---------- Realces no chão ----------

function Band({ a, b, width, color, opacity, y = 0.03 }: { a: Point; b: Point; width: number; color: string; opacity: number; y?: number }) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  return (
    <group position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}>
      <mesh rotation={FLAT}>
        <planeGeometry args={[Math.hypot(dx, dz), width]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Spot({ at, r, color, opacity }: { at: Point; r: number; color: string; opacity: number }) {
  return (
    <mesh rotation={FLAT} position={[at[0], 0.035, at[1]]}>
      <circleGeometry args={[r, 28]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

const RED = '#ff3b3b'
const GREEN = '#3ddc84'

/** Números nas costas (o 10 é da criança). */
const NUMBERS: Record<string, string> = { a1: '9', a2: '7', f: '4', o1: '5', o2: '8', o3: '11', o4: '3' }
/** O fantasma veste azul-claro: mostra o que devia ter sido feito. */
const GHOST_KIT: Kit = { ...HERO_KIT, shirt: '#7fe7ff', socks: '#7fe7ff', shortsTrim: '#7fe7ff' }

// ---------- Rótulos e hologramas (HTML por cima do canvas) ----------

interface Label {
  key: string
  at: [number, number, number]
  kind: 'tag' | 'option'
  text: string
  index?: number
  title?: string
  found?: boolean
}

function LabelProjector({ labels, nodes }: { labels: MutableRefObject<Label[]>; nodes: MutableRefObject<Map<string, HTMLElement>> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()
    for (const l of labels.current) {
      const el = nodes.current.get(l.key)
      if (!el) continue
      v.set(l.at[0], l.at[1], l.at[2]).project(camera)
      const inside = v.z < 1 && Math.abs(v.x) <= 1.1 && Math.abs(v.y) <= 1.1
      el.style.visibility = inside ? 'visible' : 'hidden'
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
    }
  })
  return null
}

// ---------- Minimapa da memória ----------

const MAP_W = 78
const MAP_H = 156

function Minimap({ vision, scenario, you, ball }: { vision: MutableRefObject<Vision>; scenario: Scenario; you: Point; ball: Point }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120)
    return () => clearInterval(id)
  }, [])
  const now = performance.now()
  const v = vision.current
  const sx = MAP_W / COURT.width
  const sy = MAP_H / COURT.length
  const cone = (() => {
    const r = 9
    const a1 = dirFromYaw(v.yaw - VISION_HFOV / 2)
    const a2 = dirFromYaw(v.yaw + VISION_HFOV / 2)
    return `M${you[0] * sx},${you[1] * sy} L${(you[0] + a1[0] * r) * sx},${(you[1] + a1[1] * r) * sy} L${(you[0] + a2[0] * r) * sx},${(you[1] + a2[1] * r) * sy} Z`
  })()
  return (
    <svg
      width={MAP_W}
      height={MAP_H}
      viewBox={`-2 -2 ${MAP_W + 4} ${MAP_H + 4}`}
      className="rounded-md bg-black/45"
      role="img"
      aria-label={`Minimapa da memória: ${scenario.title}`}
    >
      <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={1} />
      <line x1={0} y1={MAP_H / 2} x2={MAP_W} y2={MAP_H / 2} stroke="rgba(255,255,255,.4)" strokeWidth={0.8} />
      <path d={cone} fill="rgba(255,210,63,.22)" />
      {[...v.lastPos.entries()].map(([id, at]) => {
        const op = memoryOpacity(now - (v.lastSeen.get(id) ?? -Infinity))
        if (op <= 0) return null
        const team = teamOf(id)
        return (
          <circle
            key={id}
            cx={at[0] * sx}
            cy={at[1] * sy}
            r={3.2}
            fill={team === 'them' ? '#1b2036' : '#ff7a2f'}
            stroke="#fff"
            strokeWidth={0.8}
            opacity={op}
          />
        )
      })}
      <circle cx={ball[0] * sx} cy={ball[1] * sy} r={2} fill="#fff" />
      <circle cx={you[0] * sx} cy={you[1] * sy} r={3.6} fill="#ffd23f" stroke="#3a2a00" strokeWidth={1} />
    </svg>
  )
}

// ---------- Cena ----------

export interface ScanViewProps {
  scenario: Scenario
  snapshot: Snapshot
  mode: ScanMode
  vision: MutableRefObject<Vision>
  /** Realces táticos na pausa. */
  hints: boolean
  /** Mostra as opções como hologramas (pausa tática). */
  showOptions: boolean
  /** Câmera lenta: escurece as bordas e mostra o aviso. */
  slowMo: boolean
  /** Pode dar passos para o lado (durante a jogada). */
  canStep: boolean
  /** Para onde virar sozinho no modo fantasma. */
  ghostYaw?: number | null
  /** Opções que já apareceram na tela durante a pausa. */
  onFound?: (found: number[]) => void
  onPick?: (optionIndex: number) => void
  /** A visão 3D abriu e já está contando o que a criança vê. */
  onReady?: () => void
}

export default function ScanView({
  scenario,
  snapshot,
  mode,
  vision,
  hints,
  showOptions,
  slowMo,
  canStep,
  ghostYaw = null,
  onFound,
  onPick,
  onReady,
}: ScanViewProps) {
  const palette = usePalette()
  const [, forceRender] = useState(0)
  const yaw = useRef(0)
  const pitch = useRef(PITCH_DEFAULT)
  const lastInput = useRef(0)
  const keys = useRef(new Set<string>())
  const tracker = useRef(new ScanTracker())
  const placedFor = useRef<string | null>(null)
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null)
  // Quanto o último toque arrastou: um arrasto não vale como clique num companheiro.
  const lastMoved = useRef(0)
  const youYaw = useCallback(() => yaw.current, [])
  const [dragged, setDragged] = useState(false)

  // Posições mostradas: o roteiro do lance + balanço defensivo + passo para o lado.
  const offset = vision.current.offset
  const positions = useMemo(() => {
    const p = applyAI(snapshot.positions, snapshot.ball, scenario.ai)
    const you = p.v
    return you ? { ...p, v: [you[0] + offset[0], you[1] + offset[1]] as Point } : p
  }, [snapshot, scenario.ai, offset])
  const you = positions.v ?? [COURT.width / 2, COURT.length / 2]

  // Lance novo: olha para a bola do começo do lance (não do quadro na tela, que
  // ainda pode ser o fim do lance anterior) e zera a contagem.
  if (placedFor.current !== scenario.id) {
    placedFor.current = scenario.id
    yaw.current = initialYaw(scenario)
    pitch.current = PITCH_DEFAULT
    lastInput.current = 0
    tracker.current.reset()
  }

  const tall = useMemo(() => new Set(scenario.tall), [scenario.tall])
  const anchors = scenario.options.map((_, i) => optionAnchor(scenario, i, positions))
  const awareT = awareTarget(scenario, positions)
  const points = [
    ...scenario.options.flatMap((o) => (o.hint ? [{ key: pointKey(o.hint), at: o.hint }] : [])),
    ...(awareT && awareT.key.startsWith('pt:') ? [awareT] : []),
  ]
  const shared = useRef<Shared>({ positions, ball: snapshot.ball, you, blockers: [], points, anchors })
  shared.current = {
    positions,
    ball: snapshot.ball,
    you,
    blockers: Object.entries(positions)
      .filter(([id]) => id !== 'v')
      .map(([id, at]) => ({ id, at, radius: tall.has(id) ? TALL_RADIUS : BODY_RADIUS })),
    points,
    anchors,
  }

  // Realces da pausa.
  const frozen = mode === 'frozen'
  const opponents = Object.entries(positions)
    .filter(([id]) => teamOf(id) === 'them' && id !== 'o0')
    .map(([, at]) => at)
  const openLanes = new Set<string>()
  if (frozen && hints) {
    for (const o of scenario.options) {
      if (o.target && positions[o.target] && laneClear(you, positions[o.target]!, opponents, 1.0)) openLanes.add(o.target)
    }
  }

  // Teclado: setas viram a cabeça.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) {
        keys.current.add(e.key)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key)
    // Trocou de janela com a seta apertada: o keyup vai para a outra janela.
    const release = () => keys.current.clear()
    const hidden = () => {
      if (document.hidden) release()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [])

  // O arrasto vale a partir de qualquer ponto, até de cima de um holograma;
  // só um toque parado conta como clique.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: 0 }
    lastMoved.current = 0
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    // Soltou o botão fora da visão (o pointerup não chegou aqui): o arrasto acabou.
    if (e.buttons === 0) {
      drag.current = null
      return
    }
    if (mode === 'follow' || mode === 'ghost') return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.x = e.clientX
    d.y = e.clientY
    d.moved += Math.abs(dx) + Math.abs(dy)
    lastMoved.current = d.moved
    // Arrasto de verdade: segue recebendo o movimento e o soltar mesmo fora da visão.
    const el = e.currentTarget
    if (d.moved > 8 && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId)
    lastInput.current = performance.now()
    yaw.current += dx * DRAG_YAW
    pitch.current = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch.current - dy * DRAG_PITCH))
    if (!dragged && d.moved > 12) setDragged(true)
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const wasDrag = () => lastMoved.current > 8
  const tap = (fn: () => void) => () => {
    if (!wasDrag()) fn()
  }

  const stepSide = useCallback(
    (dir: 1 | -1) => {
      const right: Point = [Math.cos(yaw.current), Math.sin(yaw.current)]
      const o = vision.current.offset
      let nx = o[0] + right[0] * STEP * dir
      let ny = o[1] + right[1] * STEP * dir
      const len = Math.hypot(nx, ny)
      if (len > STEP_MAX) {
        nx = (nx / len) * STEP_MAX
        ny = (ny / len) * STEP_MAX
      }
      vision.current.offset = [nx, ny]
      forceRender((n) => n + 1)
    },
    [vision],
  )
  const lookAtBall = () => {
    yaw.current = yawTo(you, snapshot.ball)
    pitch.current = PITCH_DEFAULT
  }

  // Rótulos: siglas dos companheiros e, na pausa, os hologramas das opções.
  const labels = useRef<Label[]>([])
  const [found, setFound] = useState<Set<number>>(new Set())
  const foundRef = useRef<Set<number>>(new Set())
  const handleFound = useCallback(
    (ids: number[]) => {
      if (ids.every((i) => foundRef.current.has(i))) return
      const next = new Set(foundRef.current)
      ids.forEach((i) => next.add(i))
      foundRef.current = next
      setFound(next)
      onFound?.([...next].sort())
    },
    [onFound],
  )
  useEffect(() => {
    if (!showOptions) {
      foundRef.current = new Set()
      setFound(new Set())
    }
  }, [showOptions, scenario.id])

  labels.current = [
    ...Object.entries(positions).flatMap(([id, at]): Label[] => {
      const team = teamOf(id)
      if (team !== 'us') return []
      const tag = id === 'gk' ? 'G' : (scenario.tags[id] ?? '')
      return tag ? [{ key: `p:${id}`, at: [at[0], LABEL_HEIGHT * (tall.has(id) ? 1.18 : 1), at[1]], kind: 'tag', text: tag }] : []
    }),
    ...(showOptions
      ? scenario.options.flatMap((o, i): Label[] => {
          const a = anchors[i]
          if (!a) return []
          // Proteger (sem alvo): o holograma fica ao lado da criança, na altura do peito.
          const side: Point = [Math.cos(yaw.current) * 1.1, Math.sin(yaw.current) * 1.1]
          const h = o.target ? LABEL_HEIGHT + 0.55 : o.hint ? 0.9 : 1.2
          const at: Point = !o.target && !o.hint ? [you[0] + side[0], you[1] + side[1]] : a
          return [
            {
              key: `o:${i}`,
              at: [at[0], h, at[1]],
              kind: 'option',
              text: LETTERS[i]!,
              index: i,
              title: o.short ?? o.label,
              found: found.has(i),
            },
          ]
        })
      : []),
  ]
  const nodes = useRef(new Map<string, HTMLElement>())

  const colors = (id: string): { kit: Kit; detail: 'hero' | 'crowd' } => {
    const team = teamOf(id)
    const num = NUMBERS[id] ?? '6'
    if (id === 'gk') return { kit: teamKit(palette.ourKeeper, '1'), detail: 'crowd' }
    if (id === 'o0') return { kit: rivalKit(palette.theirKeeper, '1'), detail: 'crowd' }
    if (team === 'you') return { kit: mode === 'ghost' ? GHOST_KIT : HERO_KIT, detail: 'hero' }
    if (team === 'us') return { kit: teamKit(palette.us, num), detail: 'crowd' }
    return { kit: rivalKit(palette.them, num), detail: 'crowd' }
  }

  return (
    <div
      className="relative h-full w-full touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="application"
      aria-label={`Visão do jogador em 3D: ${scenario.title}. Arraste para olhar em volta; setas do teclado também viram a cabeça.`}
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: VISION_FOV, near: 0.05, far: 140 }}
        gl={{ antialias: true }}
      >
        <SceneContents
          palette={palette}
          scenario={scenario}
          positions={positions}
          snapshot={snapshot}
          mode={mode}
          tall={tall}
          openLanes={openLanes}
          frozen={frozen}
          hints={hints}
          you={you}
          colors={colors}
          youYaw={youYaw}
          onPick={onPick && showOptions ? (i) => !wasDrag() && onPick(i) : undefined}
        />
        <Rig
          shared={shared}
          yaw={yaw}
          pitch={pitch}
          keys={keys}
          mode={mode}
          ghostYaw={ghostYaw}
          vision={vision}
          tracker={tracker}
          onFound={handleFound}
          showOptions={showOptions}
          lastInput={lastInput}
          onReady={onReady}
        />
        <LabelProjector labels={labels} nodes={nodes} />
      </Canvas>

      {/* Minimapa: só o que foi visto há pouco. */}
      <div className="pointer-events-none absolute top-2 left-2">
        <Minimap vision={vision} scenario={scenario} you={you} ball={snapshot.ball} />
      </div>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {labels.current.map((l) => (
          <div
            key={l.key}
            ref={(el) => {
              if (el) nodes.current.set(l.key, el)
              else nodes.current.delete(l.key)
            }}
            className="absolute top-0 left-0"
            style={{ visibility: 'hidden' }}
          >
            {l.kind === 'option' ? (
              <button
                type="button"
                onClick={tap(() => onPick?.(l.index!))}
                aria-label={`Opção ${l.text}: ${l.title}`}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-cyan-200/80 bg-cyan-400/25 py-1 pr-3 pl-1 text-xs font-bold whitespace-nowrap text-white shadow-[0_0_18px_rgba(103,232,249,.75)] backdrop-blur-sm"
              >
                <span className="grid size-6 place-items-center rounded-full bg-you text-you-ink">{l.text}</span>
                {l.title}
              </button>
            ) : (
              <span className="block rounded-full bg-black/50 px-2 py-0.5 text-[11px] leading-tight font-bold whitespace-nowrap text-white">
                {l.text}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Câmera lenta: bordas escuras e aviso. */}
      {slowMo && (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,.55)_100%)]">
          <span className="mt-3 rounded-full bg-black/60 px-3 py-1 font-display text-xs tracking-wider text-white">CÂMERA LENTA</span>
        </div>
      )}

      {(mode === 'live' || mode === 'frozen') && (
        <div className="absolute right-2 bottom-2 left-2 flex items-end justify-between gap-2">
          {canStep ? (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={tap(() => stepSide(-1))}
                className="rounded-full bg-black/55 px-3 py-2 text-xs font-bold text-white"
                aria-label="Dar um passo para a esquerda"
              >
                ◀ Passo
              </button>
              <button
                type="button"
                onClick={tap(() => stepSide(1))}
                className="rounded-full bg-black/55 px-3 py-2 text-xs font-bold text-white"
                aria-label="Dar um passo para a direita"
              >
                Passo ▶
              </button>
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={tap(lookAtBall)}
            className="rounded-full bg-black/55 px-3 py-2 text-xs font-bold text-white"
          >
            Olhar a bola
          </button>
        </div>
      )}

      {mode === 'live' && !dragged && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
          <span className="rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white">
            Arraste o dedo para olhar em volta
          </span>
        </div>
      )}
    </div>
  )
}

function SceneContents({
  palette,
  scenario,
  positions,
  snapshot,
  mode,
  tall,
  openLanes,
  frozen,
  hints,
  you,
  colors,
  onPick,
  youYaw,
}: {
  youYaw: () => number
  palette: Palette
  scenario: Scenario
  positions: Record<string, Point>
  snapshot: Snapshot
  mode: ScanMode
  tall: Set<string>
  openLanes: Set<string>
  frozen: boolean
  hints: boolean
  you: Point
  colors: (id: string) => { kit: Kit; detail: 'hero' | 'crowd' }
  onPick?: (i: number) => void
}) {
  const pickByTarget = new Map(
    scenario.options.flatMap((o, i) => (o.target ? [[o.target, i] as const] : [])),
  )
  const opponents = Object.entries(positions)
    .filter(([id]) => teamOf(id) === 'them' && id !== 'o0')
    .map(([, at]) => at)

  return (
    <>
      <color attach="background" args={[palette.wall]} />
      <fog attach="fog" args={[palette.wall, 30, 80]} />
      {/* Luz principal, preenchimento e uma luz de recorte por trás (o brilho na borda do anime). */}
      <hemisphereLight args={['#ffffff', palette.out, 0.9]} />
      <directionalLight position={[6, 14, 10]} intensity={1.5} />
      <directionalLight position={[-8, 9, -14]} intensity={0.9} color="#bfe8ff" />
      <CourtModel palette={palette} />

      {Object.entries(positions).map(([id, at]) => {
        const team = teamOf(id)
        const pick = frozen && onPick ? pickByTarget.get(id) : undefined
        return (
          <Figure
            key={id}
            look={`${scenario.id}:${id}`}
            at={at}
            ball={snapshot.ball}
            {...colors(id)}
            faceYaw={team === 'you' ? youYaw : null}
            tall={tall.has(id)}
            glow={openLanes.has(id) ? GREEN : null}
            ring={
              openLanes.has(id)
                ? { color: GREEN }
                : pick !== undefined
                  ? { color: palette.you }
                  : team === 'you' && frozen
                    ? { color: palette.you, pulse: true }
                    : null
            }
            ghost={team === 'you' && mode === 'ghost'}
            kicks
            onClick={pick !== undefined && onPick ? () => onPick(pick) : undefined}
          />
        )
      })}
      <Ball at={snapshot.ball} height={snapshot.ballHeight} />

      {frozen && hints && (
        <>
          {scenario.threats.map((id) => {
            const t = positions[id]
            if (!t) return null
            return (
              <group key={`t:${id}`}>
                <Band a={t} b={you} width={1.4} color={RED} opacity={0.22} />
                <Spot at={t} r={1.1} color={RED} opacity={0.3} />
              </group>
            )
          })}
          {scenario.options.map((o, i) => {
            if (o.target && openLanes.has(o.target)) {
              return <Band key={`l:${i}`} a={you} b={positions[o.target]!} width={0.9} color={GREEN} opacity={0.3} />
            }
            if (o.type === 'conducao' && o.hint && laneClear(you, o.hint, opponents, 1.3)) {
              return (
                <group key={`l:${i}`}>
                  <Band a={you} b={o.hint} width={1.8} color={GREEN} opacity={0.26} />
                  <Spot at={o.hint} r={1.2} color={GREEN} opacity={0.3} />
                </group>
              )
            }
            return null
          })}
        </>
      )}
    </>
  )
}
