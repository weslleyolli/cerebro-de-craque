/**
 * "Seu craque": o jogador da criança em pose de ação, no estilo anime
 * cel-shaded, com luz dramática, linhas de foco de mangá atrás e linhas de
 * velocidade (o "borrão de movimento" do desenho). Em loop: prepara o chute,
 * segura, bate e volta. Com "reduzir movimento", fica parado na pose.
 */
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

import { AnimeBody, HERO_KIT, IDLE, KICK_STRIKE, KICK_WINDUP, applyPose, blendPose, toonGradient } from './three/anime'
import type { Pose, Rig } from './three/anime'

const SKIN = '#d9a47a'
const HAIR = '#1d2340'

/** Pose de vitrine: um pouco mais dramática que a do jogo. */
const SHOWCASE_WINDUP: Pose = {
  ...KICK_WINDUP,
  hipR: 0.95,
  kneeR: 1.85,
  torso: [0.3, 0.12],
  head: [0.3, -0.18],
  shoulderL: [-0.55, 1.2],
  shoulderR: [0.45, -0.75],
}

// Ciclo (ms): preparar, segurar, bater, voltar ao repouso.
const T_WINDUP = 700
const T_HOLD = 1400
const T_STRIKE = 220
const T_BACK = 900
const CYCLE = T_WINDUP + T_HOLD + T_STRIKE + T_BACK

function poseAt(ms: number): { pose: Pose; strike: number } {
  const t = ms % CYCLE
  if (t < T_WINDUP) return { pose: blendPose(IDLE, SHOWCASE_WINDUP, ease(t / T_WINDUP)), strike: 0 }
  if (t < T_WINDUP + T_HOLD) return { pose: SHOWCASE_WINDUP, strike: 0 }
  if (t < T_WINDUP + T_HOLD + T_STRIKE) {
    const k = (t - T_WINDUP - T_HOLD) / T_STRIKE
    return { pose: blendPose(SHOWCASE_WINDUP, KICK_STRIKE, k), strike: k }
  }
  const k = (t - T_WINDUP - T_HOLD - T_STRIKE) / T_BACK
  return { pose: blendPose(KICK_STRIKE, IDLE, ease(k)), strike: 1 + k }
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/** Linhas de foco de mangá: raios saindo do centro, desenhados num canvas. */
function focusLinesTexture(): THREE.Texture {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')!
  const cx = size / 2
  let seed = 7
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < 220; i++) {
    const a = rand() * Math.PI * 2
    const r0 = size * (0.2 + rand() * 0.14)
    const w = 0.004 + rand() * 0.012
    c.fillStyle = `rgba(255,255,255,${0.1 + rand() * 0.28})`
    c.beginPath()
    c.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0)
    c.lineTo(cx + Math.cos(a - w) * size * 0.75, cx + Math.sin(a - w) * size * 0.75)
    c.lineTo(cx + Math.cos(a + w) * size * 0.75, cx + Math.sin(a + w) * size * 0.75)
    c.closePath()
    c.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function Scene({ still }: { still: boolean }) {
  const rig = useRef<Rig | null>(null)
  const ball = useRef<THREE.Mesh>(null)
  const lines = useRef<THREE.Group>(null)
  const focus = useRef<THREE.Mesh>(null)
  const focusTex = useMemo(focusLinesTexture, [])
  const grad = toonGradient()
  const speed = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        y: 0.15 + ((i * 37) % 100) / 100 * 1.4,
        x: -0.9 + ((i * 53) % 100) / 100 * 1.8,
        len: 0.5 + ((i * 29) % 100) / 100 * 0.9,
        phase: (i * 0.137) % 1,
      })),
    [],
  )

  useFrame((state) => {
    const ms = still ? T_WINDUP + 200 : state.clock.elapsedTime * 1000
    const { pose, strike } = poseAt(ms)
    if (rig.current) applyPose(rig.current, pose)
    // A bola sai voando depois do chute.
    if (ball.current) {
      const f = Math.max(0, strike)
      ball.current.position.set(-0.05 - f * 1.4, 0.11 + f * 0.9, 0.42 + f * 4.3)
      ball.current.visible = f < 1.2
      ball.current.rotation.x += still ? 0 : 0.02 + f * 0.4
    }
    // Linhas de velocidade passando por trás; mais fortes perto da batida.
    const t = still ? 0.35 : state.clock.elapsedTime
    lines.current?.children.forEach((m, i) => {
      const s = speed[i]!
      const k = (t * 0.9 + s.phase) % 1
      m.position.set(s.x, s.y, -0.6 - k * 2.2)
      const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial
      mat.opacity = Math.sin(k * Math.PI) * 0.55
    })
    if (focus.current && !still) focus.current.rotation.z = state.clock.elapsedTime * 0.05
    // Câmera de frente pelo lado direito dele (onde a perna arma o chute), um
    // pouco de baixo (ângulo heroico), girando devagar.
    const a = still ? -0.62 : -0.6 + Math.sin(state.clock.elapsedTime * 0.25) * 0.28
    state.camera.position.set(Math.sin(a) * 3.9, 0.62, Math.cos(a) * 3.9)
    state.camera.lookAt(0, 0.86, 0)
  })

  return (
    <>
      <ambientLight intensity={0.35} />
      {/* Luz principal quente, de frente e de lado. */}
      <directionalLight position={[2.5, 3.5, 3]} intensity={2.2} color="#fff2d6" />
      {/* Recorte frio por trás: a borda brilhante do anime. */}
      <directionalLight position={[-2.5, 2.5, -3]} intensity={2.4} color="#5fe3ff" />
      <pointLight position={[0, 0.4, 1.2]} intensity={1.2} distance={3} color="#ffd23f" />

      <mesh ref={focus} position={[0, 1.05, -1.6]}>
        <planeGeometry args={[7, 7]} />
        <meshBasicMaterial map={focusTex} transparent depthWrite={false} />
      </mesh>

      <group ref={lines}>
        {speed.map((s, i) => (
          <mesh key={i} position={[s.x, s.y, -1]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.012, 0.012, s.len]} />
            <meshBasicMaterial color="#e8fbff" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* Piso com um círculo de luz. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[1.6, 48]} />
        <meshToonMaterial color="#1d6f80" gradientMap={grad} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[1.52, 1.6, 64]} />
        <meshBasicMaterial color="#e8f6f7" />
      </mesh>

      <group rotation={[0, -0.22, 0]}>
        <AnimeBody kit={HERO_KIT} skin={SKIN} hair={HAIR} detail="hero" iris="#ffb000" rigRef={rig} />
      </group>

      <mesh ref={ball} position={[-0.05, 0.11, 0.42]}>
        <icosahedronGeometry args={[0.11, 1]} />
        <meshToonMaterial color="#ffffff" gradientMap={grad} />
      </mesh>
    </>
  )
}

export default function CraqueShowcase({ name, still = false }: { name: string; still?: boolean }) {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_40%,#2b3c6b_0%,#121a33_55%,#070a14_100%)]"
      role="img"
      aria-label={`${name}, o seu craque, em pose de chute com uniforme amarelo e branco número 10`}
    >
      <Canvas dpr={[1, 2]} camera={{ fov: 36, near: 0.05, far: 50 }} gl={{ antialias: true, alpha: true }}>
        <Scene still={still} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
        <span className="rounded-md bg-black/40 px-2 py-1 font-display text-lg leading-none text-you">{name}</span>
        <span className="font-display text-3xl leading-none text-white/90 [text-shadow:0_2px_0_#000]">10</span>
      </div>
    </div>
  )
}
