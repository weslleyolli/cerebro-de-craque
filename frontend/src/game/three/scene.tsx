/**
 * Peças 3D compartilhadas: cores do tema, quadra em escala, bonecos e bola.
 *
 * Eixos: x da quadra → x do 3D; y da quadra → z do 3D; altura é o y do 3D.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import type { Point } from '../../api/types'
import { COURT } from '../engine'
import { AnimeBody, IDLE, applyPose, kickPose, runPose } from './anime'
import type { Kit, Rig } from './anime'

// ---------- Cores ----------

export interface Palette {
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

export function readPalette(): Palette {
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

export function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setPalette(readPalette())
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return palette
}

export const SKIN = ['#f1c7a5', '#d9a47a', '#b97a52', '#8a5636', '#5e3a24']
export const HAIR = ['#1d2340', '#2b1a10', '#151515', '#4a2c17', '#3a1e4a']

export function hash(text: string): number {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

// ---------- Peças planas no chão ----------

export const LINE_W = 0.1
export const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

/** Faixa reta deitada no chão, de `a` até `b` (pontos da quadra). */
export function Strip({ a, b, width = LINE_W, y = 0.012, color }: { a: Point; b: Point; width?: number; y?: number; color: string }) {
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
export function ArcLine({ center, r, start, length, color }: { center: Point; r: number; start: number; length: number; color: string }) {
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

export function CourtModel({ palette }: { palette: Palette }) {
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

/** Altura dos rótulos (VOCÊ, AD...) acima do chão. */
export const LABEL_HEIGHT = 2.1
/** Escala do jogador alto (tapa mais a visão). */
export const TALL_SCALE = 1.18

const KICK_MS = 520

export interface FigureProps {
  /** Semente para variar pele e cabelo. */
  look: string
  at: Point
  ball: Point
  kit: Kit
  /** "hero": a criança, com rosto e detalhes; "crowd": os outros, mais leves. */
  detail?: 'hero' | 'crowd'
  /** Para onde o boneco olha quando está parado (ângulo da visão); se não vier, olha para a bola. */
  faceYaw?: (() => number) | null
  tall?: boolean
  /** Brilho na camisa: companheiro numa boa linha de passe. */
  glow?: string | null
  /** Anel no chão (cor) e se ele pulsa. */
  ring?: { color: string; pulse?: boolean } | null
  /** Fantasma: o boneco fica transparente (mostra o que devia ter sido feito). */
  ghost?: boolean
  /** Chuta quando a bola sai do pé dele (passe, chute). */
  kicks?: boolean
  onClick?: () => void
}

/** Jogador anime: corre para onde se move; parado, olha para a bola e respira; chuta quando a bola sai do pé. */
export function Figure({ look, at, ball, kit, detail = 'crowd', faceYaw, tall, glow, ring, ghost, kicks, onClick }: FigureProps) {
  const root = useRef<THREE.Group>(null)
  const rig = useRef<Rig | null>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const target = useRef({ at, ball, faceYaw, ringPulse: !!ring?.pulse, kicks: !!kicks })
  target.current = { at, ball, faceYaw, ringPulse: !!ring?.pulse, kicks: !!kicks }
  const motion = useRef({
    x: at[0],
    z: at[1],
    speed: 0,
    heading: Math.PI,
    phase: hash(look) % 7,
    ballDist: Infinity,
    kickAt: -Infinity,
  })
  const skin = SKIN[hash(look) % SKIN.length]!
  const hair = HAIR[hash(look + 'h') % HAIR.length]!

  useFrame((state, dt) => {
    const m = motion.current
    const { at: p, ball: b, faceYaw: fy, ringPulse, kicks: canKick } = target.current
    const step = Math.min(dt, 0.1)
    const now = state.clock.elapsedTime * 1000
    const dx = p[0] - m.x
    const dz = p[1] - m.z
    const moved = Math.hypot(dx, dz)
    const instant = step > 0 ? moved / step : 0
    m.speed += (instant - m.speed) * Math.min(1, step * 8)
    m.x = p[0]
    m.z = p[1]

    // Bola saindo rápido do pé: chute.
    const bd = Math.hypot(b[0] - p[0], b[1] - p[1])
    if (canKick && m.ballDist < 1.1 && bd - m.ballDist > 0.06 && now - m.kickAt > KICK_MS) m.kickAt = now
    m.ballDist = bd

    let want = m.heading
    if (m.speed > 0.6 && moved > 1e-4) want = Math.atan2(dx, dz)
    else if (fy) {
      // Ângulo da visão (0 = gol adversário) para a rotação do boneco (frente em +z).
      want = Math.PI - fy()
    } else if (bd > 0.5) want = Math.atan2(b[0] - p[0], b[1] - p[1])
    const diff = Math.atan2(Math.sin(want - m.heading), Math.cos(want - m.heading))
    m.heading += diff * Math.min(1, step * 9)

    const run = Math.min(1, m.speed / 4.5)
    m.phase += step * (4 + m.speed * 2.2)
    let pose = run > 0.05 ? runPose(m.phase, run) : IDLE
    if (run <= 0.05) {
      // Parado, o corpo "respira".
      const t = state.clock.elapsedTime
      pose = { ...pose, torso: [pose.torso[0] + Math.sin(t * 2.1 + m.phase) * 0.03, 0], lift: Math.sin(t * 2.1) * 0.006 }
    }
    const k = (now - m.kickAt) / KICK_MS
    if (k >= 0 && k < 1) pose = kickPose(k, pose)
    if (rig.current) applyPose(rig.current, pose)

    root.current?.position.set(p[0], 0, p[1])
    if (root.current) root.current.rotation.y = m.heading
    ringRef.current?.scale.setScalar(ringPulse ? 1 + 0.15 * Math.sin(state.clock.elapsedTime * 5) : 1)
  })

  return (
    <group
      ref={root}
      position={[at[0], 0, at[1]]}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation()
              onClick()
            }
          : undefined
      }
      onPointerOver={onClick ? () => (document.body.style.cursor = 'pointer') : undefined}
      onPointerOut={onClick ? () => (document.body.style.cursor = '') : undefined}
    >
      {!ghost && (
        <mesh rotation={FLAT} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.42, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.28} />
        </mesh>
      )}
      {ring && (
        <mesh ref={ringRef} rotation={FLAT} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.62, 0.78, 32]} />
          <meshBasicMaterial color={ring.color} transparent opacity={0.9} />
        </mesh>
      )}
      <group scale={tall ? TALL_SCALE : 1}>
        <AnimeBody kit={kit} skin={skin} hair={hair} detail={detail} ghost={ghost} glow={glow} rigRef={rig} />
      </group>
    </group>
  )
}

// ---------- Bola ----------

const BALL_R = 0.19

export function Ball({ at, height }: { at: Point; height: number }) {
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
