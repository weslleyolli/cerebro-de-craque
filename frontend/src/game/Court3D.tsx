/**
 * Visão 3D "de jogador": a câmera fica atrás e acima da criança, olhando para
 * o gol adversário, e os bonecos correm na quadra. Usa o mesmo Snapshot da
 * prancheta 2D, então a lógica do lance é uma só.
 *
 * Eixos: x da quadra → x do 3D; y da quadra → z do 3D; altura é o y do 3D.
 *
 * Os rótulos (VOCÊ, AD, letras das opções) são HTML comum por cima do canvas,
 * reposicionados a cada quadro pela projeção da câmera.
 */
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'

import type { Point, Scenario } from '../api/types'
import { LETTERS } from '../lib/catalog'
import { COURT, teamOf } from './engine'
import type { Arrow, Snapshot } from './engine'

// ---------- Cores ----------

interface Palette {
  court: string
  out: string
  line: string
  us: string
  them: string
  you: string
  ourKeeper: string
  theirKeeper: string
  wall: string
  stands: string
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  const out = v('--court-out', '#165866')
  const shade = (k: number) => `#${new THREE.Color(out).multiplyScalar(k).getHexString()}`
  return {
    court: v('--court', '#1d6f80'),
    out,
    line: v('--court-line', '#e8f6f7'),
    us: v('--us', '#ff7a2f'),
    them: v('--them', '#1b2036'),
    you: '#ffd23f',
    ourKeeper: '#2fbf71',
    theirKeeper: '#8e5cf6',
    wall: shade(0.5),
    stands: shade(0.75),
  }
}

function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setPalette(readPalette())
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return palette
}

const SKIN = ['#f1c7a5', '#d9a47a', '#b97a52', '#8a5636', '#5e3a24']
const HAIR = ['#2b1a10', '#4a2c17', '#151515', '#7a4b22']

function hash(text: string): number {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

// ---------- Peças planas no chão ----------

const LINE_W = 0.1
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

/** Faixa reta deitada no chão, de `a` até `b` (pontos da quadra). */
function Strip({ a, b, width = LINE_W, y = 0.012, color }: { a: Point; b: Point; width?: number; y?: number; color: string }) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  return (
    <group position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}>
      <mesh rotation={FLAT}>
        <planeGeometry args={[Math.hypot(dx, dz), width]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

/**
 * Arco deitado no chão. Ângulos no plano do anel: depois de deitado, o ângulo
 * `a` aponta para (cos a, -sin a) em (x, z).
 */
function ArcLine({ center, r, start, length, color }: { center: Point; r: number; start: number; length: number; color: string }) {
  return (
    <mesh position={[center[0], 0.012, center[1]]} rotation={FLAT}>
      <ringGeometry args={[r - LINE_W / 2, r + LINE_W / 2, 64, 1, start, length]} />
      <meshBasicMaterial color={color} side={THREE.DoubleSide} />
    </mesh>
  )
}

// ---------- Quadra ----------

function Goal({ z, dir, color }: { z: number; dir: 1 | -1; color: string }) {
  const { goalLeft: G1, goalRight: G2 } = COURT
  const H = 2
  const D = 0.9
  return (
    <group>
      {[G1, G2].map((x) => (
        <mesh key={x} position={[x, H / 2, z]}>
          <cylinderGeometry args={[0.05, 0.05, H, 10]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
      <mesh position={[(G1 + G2) / 2, H, z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, G2 - G1 + 0.1, 10]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[(G1 + G2) / 2, H / 2, z - (dir * D) / 2]}>
        <boxGeometry args={[G2 - G1, H, D, 12, 8, 4]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

function CourtModel({ palette }: { palette: Palette }) {
  const { width: W, length: L, goalLeft: G1, goalRight: G2 } = COURT
  const c = palette.line
  const H = Math.PI / 2
  return (
    <group>
      <mesh rotation={FLAT} position={[W / 2, 0, L / 2]}>
        <planeGeometry args={[W + 12, L + 14]} />
        <meshStandardMaterial color={palette.out} roughness={0.9} />
      </mesh>
      <mesh rotation={FLAT} position={[W / 2, 0.004, L / 2]}>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial color={palette.court} roughness={0.75} />
      </mesh>

      {/* Linhas: contorno, meio, círculo central, áreas e marcas. */}
      <Strip a={[0, 0]} b={[W, 0]} color={c} />
      <Strip a={[0, L]} b={[W, L]} color={c} />
      <Strip a={[0, 0]} b={[0, L]} color={c} />
      <Strip a={[W, 0]} b={[W, L]} color={c} />
      <Strip a={[0, L / 2]} b={[W, L / 2]} color={c} />
      <ArcLine center={[W / 2, L / 2]} r={3} start={0} length={Math.PI * 2} color={c} />
      <ArcLine center={[G1, 0]} r={6} start={Math.PI} length={H} color={c} />
      <ArcLine center={[G2, 0]} r={6} start={3 * H} length={H} color={c} />
      <Strip a={[G1, 6]} b={[G2, 6]} color={c} />
      <ArcLine center={[G1, L]} r={6} start={H} length={H} color={c} />
      <ArcLine center={[G2, L]} r={6} start={0} length={H} color={c} />
      <Strip a={[G1, L - 6]} b={[G2, L - 6]} color={c} />
      {[6, 10, L - 6, L - 10, L / 2].map((z) => (
        <mesh key={z} rotation={FLAT} position={[W / 2, 0.013, z]}>
          <circleGeometry args={[0.13, 16]} />
          <meshBasicMaterial color={c} />
        </mesh>
      ))}

      {/* Paredes do ginásio e arquibancada dos dois lados. */}
      {[
        { pos: [W / 2, 2, -7], size: [W + 12, 4, 0.3] },
        { pos: [W / 2, 2, L + 7], size: [W + 12, 4, 0.3] },
      ].map((w, i) => (
        <mesh key={i} position={w.pos as [number, number, number]}>
          <boxGeometry args={w.size as [number, number, number]} />
          <meshStandardMaterial color={palette.wall} />
        </mesh>
      ))}
      {[-1, 1].map((side) =>
        [0, 1, 2].map((step) => (
          <mesh
            key={`${side}-${step}`}
            position={[side < 0 ? -3.2 - step * 0.9 : W + 3.2 + step * 0.9, 0.3 + step * 0.45, L / 2]}
          >
            <boxGeometry args={[0.9, 0.6 + step * 0.9, L + 8]} />
            <meshStandardMaterial color={step % 2 ? palette.stands : palette.wall} />
          </mesh>
        )),
      )}

      <Goal z={0} dir={1} color={c} />
      <Goal z={L} dir={-1} color={c} />
    </group>
  )
}

// ---------- Bonecos ----------

const HIP = 0.72
const SHOULDER = 1.36
export const LABEL_HEIGHT = 2.05

interface FigureProps {
  look: string
  at: Point
  ball: Point
  shirt: string
  shorts: string
  isYou: boolean
  asking: boolean
  pickIndex?: number
  onPick?: (i: number) => void
  ringColor: string
}

/** Boneco simples: corre para onde se move e, parado, olha para a bola. */
function Figure({ look, at, ball, shirt, shorts, isYou, asking, pickIndex, onPick, ringColor }: FigureProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const target = useRef({ at, ball })
  target.current = { at, ball }
  const motion = useRef({ x: at[0], z: at[1], speed: 0, heading: Math.PI, phase: hash(look) % 7 })
  const skin = SKIN[hash(look) % SKIN.length]
  const hair = HAIR[hash(look + 'h') % HAIR.length]

  useFrame((state, dt) => {
    const m = motion.current
    const { at: p, ball: b } = target.current
    const step = Math.min(dt, 0.1)
    const dx = p[0] - m.x
    const dz = p[1] - m.z
    const moved = Math.hypot(dx, dz)
    const instant = step > 0 ? moved / step : 0
    m.speed += (instant - m.speed) * Math.min(1, step * 8)
    m.x = p[0]
    m.z = p[1]

    let want = m.heading
    if (m.speed > 0.6 && moved > 1e-4) want = Math.atan2(dx, dz)
    else {
      const bx = b[0] - p[0]
      const bz = b[1] - p[1]
      if (Math.hypot(bx, bz) > 0.5) want = Math.atan2(bx, bz)
    }
    const diff = Math.atan2(Math.sin(want - m.heading), Math.cos(want - m.heading))
    m.heading += diff * Math.min(1, step * 9)

    const run = Math.min(1, m.speed / 4.5)
    m.phase += step * (4 + m.speed * 2.2)
    const swing = Math.sin(m.phase) * 0.75 * run
    root.current?.position.set(p[0], 0, p[1])
    if (root.current) root.current.rotation.y = m.heading
    if (body.current) body.current.position.y = Math.abs(Math.sin(m.phase)) * 0.06 * run
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing * 0.8
    if (armR.current) armR.current.rotation.x = swing * 0.8
    ring.current?.scale.setScalar(isYou && asking ? 1 + 0.15 * Math.sin(state.clock.elapsedTime * 5) : 1)
  })

  const pickable = pickIndex !== undefined && !!onPick
  const showRing = (isYou && asking) || pickable
  const limb = (r: number, len: number, color: string) => (
    <mesh position={[0, -(len / 2 + r), 0]}>
      <capsuleGeometry args={[r, len, 4, 8]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  )

  return (
    <group
      ref={root}
      position={[at[0], 0, at[1]]}
      onClick={
        pickable
          ? (e) => {
              e.stopPropagation()
              onPick(pickIndex)
            }
          : undefined
      }
      onPointerOver={pickable ? () => (document.body.style.cursor = 'pointer') : undefined}
      onPointerOut={pickable ? () => (document.body.style.cursor = '') : undefined}
    >
      <mesh rotation={FLAT} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.42, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>
      {showRing && (
        <mesh ref={ring} rotation={FLAT} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.62, 0.78, 32]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.9} />
        </mesh>
      )}
      <group ref={body}>
        <group ref={legL} position={[-0.11, HIP, 0]}>
          {limb(0.085, 0.5, skin!)}
        </group>
        <group ref={legR} position={[0.11, HIP, 0]}>
          {limb(0.085, 0.5, skin!)}
        </group>
        <mesh position={[0, HIP + 0.02, 0]}>
          <cylinderGeometry args={[0.21, 0.2, 0.24, 14]} />
          <meshStandardMaterial color={shorts} />
        </mesh>
        <mesh position={[0, HIP + 0.36, 0]}>
          <capsuleGeometry args={[0.2, 0.3, 4, 12]} />
          <meshStandardMaterial color={shirt} roughness={0.6} />
        </mesh>
        <group ref={armL} position={[-0.27, SHOULDER, 0]}>
          {limb(0.065, 0.38, shirt)}
        </group>
        <group ref={armR} position={[0.27, SHOULDER, 0]}>
          {limb(0.065, 0.38, shirt)}
        </group>
        <mesh position={[0, 1.6, 0]}>
          <sphereGeometry args={[0.16, 16, 12]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        <mesh position={[0, 1.62, 0]}>
          <sphereGeometry args={[0.168, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={hair} />
        </mesh>
      </group>
    </group>
  )
}

// ---------- Bola ----------

const BALL_R = 0.19

function Ball({ at, height }: { at: Point; height: number }) {
  const ball = useRef<THREE.Mesh>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const last = useRef<Point>(at)
  const target = useRef({ at, height })
  target.current = { at, height }

  useFrame(() => {
    const { at: p, height: h } = target.current
    const dx = p[0] - last.current[0]
    const dz = p[1] - last.current[1]
    last.current = p
    if (ball.current) {
      ball.current.position.set(p[0], BALL_R + h, p[1])
      // Rola na direção do movimento.
      ball.current.rotation.x += dz / BALL_R
      ball.current.rotation.z -= dx / BALL_R
    }
    if (shadow.current) {
      shadow.current.position.set(p[0], 0.021, p[1])
      shadow.current.scale.setScalar(1 / (1 + h))
    }
  })

  return (
    <>
      <mesh ref={shadow} rotation={FLAT}>
        <circleGeometry args={[BALL_R * 1.1, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
      <mesh ref={ball} position={[at[0], BALL_R + height, at[1]]}>
        <icosahedronGeometry args={[BALL_R, 1]} />
        <meshStandardMaterial color="#ffffff" flatShading roughness={0.4} />
      </mesh>
    </>
  )
}

// ---------- Setas das opções ----------

const DASH = 0.5
const GAP = 0.3

function OptionArrow({ arrow, color }: { arrow: Arrow; color: string }) {
  const dx = arrow.end[0] - arrow.from[0]
  const dz = arrow.end[1] - arrow.from[1]
  const len = Math.hypot(dx, dz)
  const dashes = useMemo(() => {
    const out: [Point, Point][] = []
    for (let d = 0; d < len - 0.35; d += DASH + GAP) {
      const e = Math.min(d + DASH, len - 0.35)
      out.push([
        [arrow.from[0] + (dx * d) / len, arrow.from[1] + (dz * d) / len],
        [arrow.from[0] + (dx * e) / len, arrow.from[1] + (dz * e) / len],
      ])
    }
    return out
  }, [arrow.from, dx, dz, len])
  return (
    <group>
      {dashes.map(([a, b], i) => (
        <Strip key={i} a={a} b={b} width={0.16} y={0.03} color={color} />
      ))}
      <group position={[arrow.end[0], 0.04, arrow.end[1]]} rotation={[0, Math.atan2(dx, dz), 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.25]}>
          <coneGeometry args={[0.34, 0.65, 3]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
    </group>
  )
}

// ---------- Câmera ----------

const CAM_PITCH = 0.73 // altura / distância: ~36° olhando para baixo
const CAM_MIN = 8
const CAM_MAX = 26
const CAM_STEP = 0.75
/** Até onde, na tela (de -1 a 1), um ponto importante pode chegar. */
const SAFE_X = 0.86
const SAFE_TOP = 0.8
const SAFE_BOTTOM = -0.92

function placeCamera(cam: THREE.PerspectiveCamera, pts: Point[], dist: number, look: THREE.Vector3) {
  let minZ = Infinity
  let maxZ = -Infinity
  let sumX = 0
  for (const [x, z] of pts) {
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
    sumX += x
  }
  const x = (sumX / pts.length) * 0.85 + (COURT.width / 2) * 0.15
  cam.position.set(x, dist * CAM_PITCH, maxZ + dist * 0.85)
  look.set(x, 0.5, (minZ + maxZ) / 2 - dist * 0.25)
  cam.lookAt(look)
  cam.updateMatrixWorld()
}

const probe = new THREE.Vector3()

function fits(cam: THREE.PerspectiveCamera, pts: Point[]): boolean {
  for (const [x, z] of pts) {
    for (const h of [0, LABEL_HEIGHT]) {
      probe.set(x, h, z).project(cam)
      if (probe.z >= 1 || Math.abs(probe.x) > SAFE_X || probe.y > SAFE_TOP || probe.y < SAFE_BOTTOM) return false
    }
  }
  return true
}

/**
 * Câmera atrás da criança, olhando para o gol adversário (para cima na
 * prancheta). Afasta até caber tudo o que importa no momento: a criança, a
 * bola e, na pausa, o destino de cada opção.
 */
function CameraRig({ focus, sceneKey }: { focus: MutableRefObject<Point[]>; sceneKey: string }) {
  const look = useRef(new THREE.Vector3())
  const placedFor = useRef<string | null>(null)
  const trial = useMemo(() => new THREE.PerspectiveCamera(), [])
  const trialLook = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera, size }, dt) => {
    const pts = focus.current
    if (!pts.length) return
    const cam = camera as THREE.PerspectiveCamera
    trial.fov = cam.fov
    trial.aspect = size.width / Math.max(1, size.height)
    trial.near = cam.near
    trial.far = cam.far
    trial.updateProjectionMatrix()

    let dist = CAM_MIN
    placeCamera(trial, pts, dist, trialLook)
    while (dist < CAM_MAX && !fits(trial, pts)) {
      dist += CAM_STEP
      placeCamera(trial, pts, dist, trialLook)
    }

    if (placedFor.current !== sceneKey) {
      // Lance novo: posiciona direto, sem atravessar a quadra voando.
      camera.position.copy(trial.position)
      look.current.copy(trialLook)
      placedFor.current = sceneKey
    } else {
      const k = 1 - Math.exp(-Math.min(dt, 0.1) * 2.5)
      camera.position.lerp(trial.position, k)
      look.current.lerp(trialLook, k)
    }
    camera.lookAt(look.current)
  })
  return null
}

// ---------- Rótulos em HTML ----------

interface Label {
  key: string
  at: [number, number, number]
  kind: 'you' | 'tag' | 'option'
  text: string
  index?: number
  title?: string
}

/** Coloca cada rótulo HTML em cima do seu ponto 3D, depois que a câmera se mexeu. */
function LabelProjector({ labels, nodes }: { labels: MutableRefObject<Label[]>; nodes: MutableRefObject<Map<string, HTMLElement>> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()
    for (const l of labels.current) {
      const el = nodes.current.get(l.key)
      if (!el) continue
      v.set(l.at[0], l.at[1], l.at[2]).project(camera)
      const inside = v.z < 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05
      el.style.visibility = inside ? 'visible' : 'hidden'
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
    }
  })
  return null
}

// ---------- Cena ----------

interface Court3DProps {
  scenario: Scenario
  snapshot: Snapshot
  arrows?: Arrow[]
  asking?: boolean
  onPick?: (optionIndex: number) => void
}

export default function Court3D({ scenario, snapshot, arrows = [], asking = false, onPick }: Court3DProps) {
  const palette = usePalette()
  const you = snapshot.positions.v ?? [COURT.width / 2, COURT.length / 2]
  const pickable = new Map(arrows.filter((a) => a.target).map((a) => [a.target as string, a.index] as const))
  const shown = asking ? arrows : []

  // O que a câmera precisa mostrar agora.
  const focus = useRef<Point[]>([])
  focus.current = [
    you,
    snapshot.ball,
    ...shown.flatMap((a) => {
      const target = a.target ? snapshot.positions[a.target] : undefined
      return target ? [a.end, a.label, target] : [a.end, a.label]
    }),
  ]

  const labels = useRef<Label[]>([])
  labels.current = [
    ...Object.entries(snapshot.positions).flatMap(([id, at]): Label[] => {
      const team = teamOf(id)
      if (team === 'you') return [{ key: `p:${id}`, at: [at[0], LABEL_HEIGHT, at[1]], kind: 'you', text: 'VOCÊ' }]
      const tag = team === 'them' ? '' : id === 'gk' ? 'G' : (scenario.tags[id] ?? '')
      return tag ? [{ key: `p:${id}`, at: [at[0], LABEL_HEIGHT, at[1]], kind: 'tag', text: tag }] : []
    }),
    ...shown.map(
      (a): Label => ({
        key: `o:${a.index}`,
        at: [a.label[0], 0.45, a.label[1]],
        kind: 'option',
        text: LETTERS[a.index]!,
        index: a.index,
        title: scenario.options[a.index]!.label,
      }),
    ),
  ]
  const nodes = useRef(new Map<string, HTMLElement>())

  const colors = (id: string) => {
    const team = teamOf(id)
    if (id === 'gk') return { shirt: palette.ourKeeper, shorts: '#1f2a30' }
    if (id === 'o0') return { shirt: palette.theirKeeper, shorts: '#1f2a30' }
    if (team === 'you') return { shirt: palette.you, shorts: '#22262b' }
    if (team === 'us') return { shirt: palette.us, shorts: '#22262b' }
    return { shirt: palette.them, shorts: '#f2f4f5' }
  }

  return (
    <div className="relative h-full w-full" role="img" aria-label={`Quadra de futsal em 3D, vista do jogador: ${scenario.title}`}>
      <Canvas dpr={[1, 1.75]} camera={{ fov: 58, near: 0.1, far: 140 }} gl={{ antialias: true }}>
        <color attach="background" args={[palette.wall]} />
        <fog attach="fog" args={[palette.wall, 30, 80]} />
        <hemisphereLight args={['#ffffff', palette.out, 1.1]} />
        <directionalLight position={[6, 14, 10]} intensity={1.4} />
        <CameraRig focus={focus} sceneKey={scenario.id} />
        <CourtModel palette={palette} />
        {Object.entries(snapshot.positions).map(([id, at]) => (
          <Figure
            key={id}
            look={`${scenario.id}:${id}`}
            at={at}
            ball={snapshot.ball}
            {...colors(id)}
            isYou={teamOf(id) === 'you'}
            asking={asking}
            ringColor={palette.you}
            pickIndex={asking ? pickable.get(id) : undefined}
            onPick={onPick}
          />
        ))}
        <Ball at={snapshot.ball} height={snapshot.ballHeight} />
        {shown.map((a) => (
          <OptionArrow key={a.index} arrow={a} color={palette.you} />
        ))}
        <LabelProjector labels={labels} nodes={nodes} />
      </Canvas>

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
                onClick={() => onPick?.(l.index!)}
                aria-label={`Opção ${l.text}: ${l.title}`}
                className="pointer-events-auto grid size-9 place-items-center rounded-full bg-you text-sm font-bold text-you-ink shadow-md ring-2 ring-black/20"
              >
                {l.text}
              </button>
            ) : (
              <span
                className={`block rounded-full px-2 py-0.5 text-[11px] leading-tight font-bold whitespace-nowrap select-none ${
                  l.kind === 'you' ? 'bg-you text-you-ink' : 'bg-black/50 text-white'
                }`}
              >
                {l.text}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
