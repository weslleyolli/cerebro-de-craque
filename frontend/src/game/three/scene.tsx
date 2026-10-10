/**
 * Peças 3D compartilhadas: cores do tema, quadra em escala, bonecos e bola.
 *
 * Eixos: x da quadra → x do 3D; y da quadra → z do 3D; altura é o y do 3D.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import type { Point } from '../../api/types'
import { COURT } from '../engine'

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
export const HAIR = ['#2b1a10', '#4a2c17', '#151515', '#7a4b22']

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

const HIP = 0.72
const SHOULDER = 1.36
/** Altura dos rótulos (VOCÊ, AD...) acima do chão. */
export const LABEL_HEIGHT = 2.05
/** Escala do jogador alto (tapa mais a visão). */
export const TALL_SCALE = 1.18

export interface FigureProps {
  /** Semente para variar pele e cabelo. */
  look: string
  at: Point
  ball: Point
  shirt: string
  shorts: string
  /** Para onde o boneco olha quando está parado (ângulo da visão); se não vier, olha para a bola. */
  faceYaw?: (() => number) | null
  tall?: boolean
  /** Brilho na camisa: companheiro numa boa linha de passe. */
  glow?: string | null
  /** Anel no chão (cor) e se ele pulsa. */
  ring?: { color: string; pulse?: boolean } | null
  /** Fantasma: o boneco fica transparente (mostra o que devia ter sido feito). */
  ghost?: boolean
  onClick?: () => void
}

/** Boneco simples de jogador: corre para onde se move; parado, olha para a bola e balança. */
export function Figure({ look, at, ball, shirt, shorts, faceYaw, tall, glow, ring, ghost, onClick }: FigureProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const target = useRef({ at, ball, faceYaw, ringPulse: !!ring?.pulse })
  target.current = { at, ball, faceYaw, ringPulse: !!ring?.pulse }
  const motion = useRef({ x: at[0], z: at[1], speed: 0, heading: Math.PI, phase: hash(look) % 7 })
  const skin = SKIN[hash(look) % SKIN.length]!
  const hair = HAIR[hash(look + 'h') % HAIR.length]!
  const material = useMemo(
    () => (ghost ? { transparent: true, opacity: 0.38, depthWrite: false } : {}),
    [ghost],
  )

  useFrame((state, dt) => {
    const m = motion.current
    const { at: p, ball: b, faceYaw: fy, ringPulse } = target.current
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
    else if (fy) {
      // Ângulo da visão (0 = gol adversário) para a rotação do boneco (frente em +z).
      want = Math.PI - fy()
    } else {
      const bx = b[0] - p[0]
      const bz = b[1] - p[1]
      if (Math.hypot(bx, bz) > 0.5) want = Math.atan2(bx, bz)
    }
    const diff = Math.atan2(Math.sin(want - m.heading), Math.cos(want - m.heading))
    m.heading += diff * Math.min(1, step * 9)

    const run = Math.min(1, m.speed / 4.5)
    m.phase += step * (4 + m.speed * 2.2)
    const swing = Math.sin(m.phase) * 0.75 * run
    const t = state.clock.elapsedTime
    // Parado, o corpo "respira": um balanço leve de um pé para o outro.
    const idle = (1 - run) * Math.sin(t * 2.1 + m.phase) * 0.05
    root.current?.position.set(p[0], 0, p[1])
    if (root.current) root.current.rotation.y = m.heading
    if (body.current) {
      body.current.position.y = Math.abs(Math.sin(m.phase)) * 0.06 * run
      body.current.rotation.z = idle
    }
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing * 0.8
    if (armR.current) armR.current.rotation.x = swing * 0.8
    ringRef.current?.scale.setScalar(ringPulse ? 1 + 0.15 * Math.sin(t * 5) : 1)
  })

  const limb = (r: number, len: number, color: string) => (
    <mesh position={[0, -(len / 2 + r), 0]}>
      <capsuleGeometry args={[r, len, 4, 8]} />
      <meshStandardMaterial color={color} roughness={0.6} {...material} />
    </mesh>
  )
  const shirtMat = (
    <meshStandardMaterial
      color={shirt}
      roughness={0.6}
      emissive={glow ?? '#000000'}
      emissiveIntensity={glow ? 0.55 : 0}
      {...material}
    />
  )

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
      <group ref={body} scale={tall ? TALL_SCALE : 1}>
        <group ref={legL} position={[-0.11, HIP, 0]}>
          {limb(0.085, 0.5, skin)}
        </group>
        <group ref={legR} position={[0.11, HIP, 0]}>
          {limb(0.085, 0.5, skin)}
        </group>
        <mesh position={[0, HIP + 0.02, 0]}>
          <cylinderGeometry args={[0.21, 0.2, 0.24, 14]} />
          <meshStandardMaterial color={shorts} {...material} />
        </mesh>
        <mesh position={[0, HIP + 0.36, 0]}>
          <capsuleGeometry args={[0.2, 0.3, 4, 12]} />
          {shirtMat}
        </mesh>
        <group ref={armL} position={[-0.27, SHOULDER, 0]}>
          {limb(0.065, 0.38, shirt)}
        </group>
        <group ref={armR} position={[0.27, SHOULDER, 0]}>
          {limb(0.065, 0.38, shirt)}
        </group>
        <mesh position={[0, 1.6, 0]}>
          <sphereGeometry args={[0.16, 16, 12]} />
          <meshStandardMaterial color={skin} {...material} />
        </mesh>
        <mesh position={[0, 1.62, 0]}>
          <sphereGeometry args={[0.168, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={hair} {...material} />
        </mesh>
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
