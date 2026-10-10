/**
 * Jogador em estilo anime "cel-shaded": sombras em faixas (MeshToonMaterial),
 * contorno preto (casco invertido), cabelo espetado, rosto desenhado em textura
 * e uniforme com textura própria. Tudo feito em código, sem modelos externos.
 *
 * O corpo tem articulações (quadril, joelho, ombro, cotovelo, tronco e cabeça)
 * expostas num Rig, para quem anima (corrida, chute, pose de vitrine).
 *
 * O boneco olha para +z, com os pés em y = 0. A esquerda dele é +x.
 */
import { useMemo } from 'react'
import type { Ref } from 'react'
import * as THREE from 'three'

// ---------- Uniformes ----------

export interface Kit {
  shirt: string
  trim: string
  shorts: string
  shortsTrim: string
  socks: string
  boots: string
  sole: string
  number: string
  numberColor: string
}

/** Uniforme da criança: amarelo e branco, de alta tecnologia, com o 10 nas costas. */
export const HERO_KIT: Kit = {
  shirt: '#ffd23f',
  trim: '#ffffff',
  shorts: '#ffffff',
  shortsTrim: '#ffd23f',
  socks: '#ffd23f',
  boots: '#1b1f2a',
  sole: '#39ff88',
  number: '10',
  numberColor: '#ffffff',
}

export function teamKit(color: string, number: string): Kit {
  return {
    shirt: color,
    trim: '#ffffff',
    shorts: '#22262b',
    shortsTrim: color,
    socks: color,
    boots: '#1b1f2a',
    sole: '#ffffff',
    number,
    numberColor: '#ffffff',
  }
}

export function rivalKit(color: string, number: string): Kit {
  return {
    shirt: color,
    trim: '#f2f4f5',
    shorts: '#f2f4f5',
    shortsTrim: color,
    socks: color,
    boots: '#111111',
    sole: '#f2f4f5',
    number,
    numberColor: '#f2f4f5',
  }
}

// ---------- Texturas e materiais (criados uma vez) ----------

const textureCache = new Map<string, THREE.Texture>()

function canvasTexture(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const hit = textureCache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  textureCache.set(key, tex)
  return tex
}

/** Três faixas de luz: o "cel-shading". */
let gradient: THREE.DataTexture | null = null
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255])
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.generateMipmaps = false
  gradient.needsUpdate = true
  return gradient
}

/**
 * Camisa: cor base, painéis laterais, barra, gola em V, número nas costas e um
 * padrão diagonal discreto ("tecido técnico"). No cilindro do tronco, u = 0 é a
 * frente, 0,25 o lado esquerdo, 0,5 as costas e 0,75 o lado direito.
 */
function jerseyTexture(kit: Kit) {
  return canvasTexture(`jersey:${kit.shirt}:${kit.trim}:${kit.number}`, 512, 256, (c) => {
    const W = 512
    const H = 256
    c.fillStyle = kit.shirt
    c.fillRect(0, 0, W, H)
    // Padrão técnico: listras diagonais finas, um pouco mais claras.
    c.strokeStyle = 'rgba(255,255,255,0.10)'
    c.lineWidth = 3
    for (let x = -H; x < W; x += 14) {
      c.beginPath()
      c.moveTo(x, H)
      c.lineTo(x + H, 0)
      c.stroke()
    }
    // Painéis laterais.
    c.fillStyle = kit.trim
    for (const u of [0.25, 0.75]) c.fillRect(u * W - 18, 0, 36, H)
    c.fillStyle = kit.shirt
    for (const u of [0.25, 0.75]) c.fillRect(u * W - 5, 0, 10, H)
    // Barra.
    c.fillStyle = kit.trim
    c.fillRect(0, H - 14, W, 14)
    // Gola em V na frente (a frente fica nas duas bordas da textura).
    c.lineWidth = 9
    c.strokeStyle = kit.trim
    for (const cx of [0, W]) {
      c.beginPath()
      c.moveTo(cx - 20, 0)
      c.lineTo(cx, 30)
      c.lineTo(cx + 20, 0)
      c.stroke()
    }
    // Número nas costas, com contorno.
    c.font = 'bold 120px "Bowlby One", "Arial Black", Impact, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.lineWidth = 10
    c.strokeStyle = 'rgba(0,0,0,0.55)'
    c.strokeText(kit.number, W / 2, H * 0.5)
    c.fillStyle = kit.numberColor
    c.fillText(kit.number, W / 2, H * 0.5)
    // Escudo pequeno no peito esquerdo.
    c.fillStyle = kit.trim
    c.beginPath()
    c.arc(W * 0.07, H * 0.3, 7, 0, Math.PI * 2)
    c.fill()
  })
}

/**
 * Rosto: olhos afiados de anime (íris com brilho), sobrancelhas inclinadas para
 * o centro (concentração intensa), nariz e boca em traço. Fundo transparente:
 * a pele aparece por baixo.
 */
function faceTexture(iris: string) {
  return canvasTexture(`face:${iris}`, 256, 128, (c) => {
    const W = 256
    const H = 128
    const ink = '#1a1020'
    for (const side of [-1, 1]) {
      const cx = W / 2 + side * 0.17 * W
      const cy = H * 0.32
      // Esclera em amêndoa.
      c.fillStyle = '#ffffff'
      c.beginPath()
      c.moveTo(cx - side * 22, cy + 4)
      c.quadraticCurveTo(cx, cy - 16, cx + side * 22, cy - 6)
      c.quadraticCurveTo(cx + side * 4, cy + 14, cx - side * 22, cy + 4)
      c.fill()
      // Íris com brilho (o olhar "aceso" de quem está concentrado).
      const g = c.createRadialGradient(cx, cy, 2, cx, cy, 11)
      g.addColorStop(0, '#fff6c2')
      g.addColorStop(0.35, iris)
      g.addColorStop(1, '#7a3b00')
      c.fillStyle = g
      c.beginPath()
      c.arc(cx + side * 2, cy - 1, 10, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = ink
      c.beginPath()
      c.arc(cx + side * 2, cy - 1, 4, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#ffffff'
      c.beginPath()
      c.arc(cx + side * 5, cy - 5, 2.6, 0, Math.PI * 2)
      c.fill()
      // Pálpebra de cima grossa, descendo para o centro.
      c.strokeStyle = ink
      c.lineWidth = 6
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(cx - side * 24, cy + 6)
      c.quadraticCurveTo(cx, cy - 17, cx + side * 24, cy - 8)
      c.stroke()
      // Sobrancelha inclinada (franzida).
      c.lineWidth = 7
      c.beginPath()
      c.moveTo(cx - side * 24, cy - 16)
      c.lineTo(cx + side * 22, cy - 30)
      c.stroke()
    }
    // Nariz e boca.
    c.strokeStyle = 'rgba(26,16,32,0.6)'
    c.lineWidth = 3
    c.beginPath()
    c.moveTo(W / 2 + 2, H * 0.55)
    c.lineTo(W / 2 - 3, H * 0.66)
    c.stroke()
    c.strokeStyle = ink
    c.lineWidth = 4
    c.beginPath()
    c.moveTo(W / 2 - 12, H * 0.86)
    c.quadraticCurveTo(W / 2, H * 0.83, W / 2 + 12, H * 0.87)
    c.stroke()
  })
}

// ---------- Geometrias (compartilhadas por todos os bonecos) ----------

type Geo = THREE.BufferGeometry
let geoCache: Record<string, Geo> | null = null

function geos(): Record<string, Geo> {
  if (geoCache) return geoCache
  const g: Record<string, Geo> = {
    thigh: new THREE.CapsuleGeometry(0.075, 0.3, 6, 18),
    shinSkin: new THREE.CapsuleGeometry(0.058, 0.12, 6, 16),
    sock: new THREE.CylinderGeometry(0.066, 0.06, 0.24, 18),
    boot: new THREE.CapsuleGeometry(0.058, 0.13, 6, 14),
    sole: new THREE.BoxGeometry(0.11, 0.022, 0.26),
    waist: new THREE.CylinderGeometry(0.14, 0.168, 0.12, 24),
    shortLeg: new THREE.CylinderGeometry(0.1, 0.108, 0.22, 20),
    shortsStripe: new THREE.BoxGeometry(0.02, 0.2, 0.05),
    torso: new THREE.CylinderGeometry(0.2, 0.152, 0.4, 36, 1, false),
    shoulders: new THREE.CapsuleGeometry(0.075, 0.3, 6, 18),
    neck: new THREE.CylinderGeometry(0.045, 0.05, 0.07, 10),
    head: new THREE.SphereGeometry(0.138, 28, 20),
    face: new THREE.SphereGeometry(0.1405, 28, 16, Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.25, 0.75),
    ear: new THREE.SphereGeometry(0.027, 8, 8),
    hairCap: new THREE.SphereGeometry(0.148, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    spike: new THREE.ConeGeometry(0.052, 0.16, 7),
    sleeve: new THREE.CylinderGeometry(0.064, 0.06, 0.13, 18),
    upperArm: new THREE.CapsuleGeometry(0.046, 0.15, 6, 14),
    foreArm: new THREE.CapsuleGeometry(0.041, 0.17, 6, 14),
    hand: new THREE.SphereGeometry(0.046, 14, 10),
  }
  geoCache = g
  return g
}

/** Direções dos espetos do cabelo, a partir do centro da cabeça. */
const SPIKES_HERO: [number, number, number][] = [
  [0, 1, -0.05],
  [0.45, 0.85, -0.25],
  [-0.45, 0.85, -0.25],
  [0, 0.65, -0.8],
  [0.6, 0.45, -0.65],
  [-0.6, 0.45, -0.65],
  [0.85, 0.4, -0.1],
  [-0.85, 0.4, -0.1],
  // Franja caindo na testa.
  [0.28, 0.45, 0.85],
  [-0.22, 0.5, 0.84],
  [0.02, 0.62, 0.78],
]
const SPIKES_CROWD = SPIKES_HERO.filter((_, i) => i % 3 === 0)

// ---------- Peça com contorno ----------

const OUTLINE = new THREE.MeshBasicMaterial({ color: '#0d0d14', side: THREE.BackSide })

interface PartProps {
  geo: Geo
  color: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
  map?: THREE.Texture
  outline?: number
  emissive?: string | null
  ghost?: boolean
  transparentMap?: boolean
}

function Part({ geo, color, position, rotation, scale, map, outline = 1.07, emissive, ghost, transparentMap }: PartProps) {
  const grad = toonGradient()
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh geometry={geo}>
        <meshToonMaterial
          color={map && !transparentMap ? '#ffffff' : color}
          map={map ?? null}
          gradientMap={grad}
          emissive={emissive ?? '#000000'}
          emissiveIntensity={emissive ? 0.45 : 0}
          transparent={ghost || transparentMap}
          opacity={ghost ? 0.38 : 1}
          alphaTest={transparentMap ? 0.4 : 0}
          depthWrite={!ghost}
        />
      </mesh>
      {outline > 1 && !ghost && <mesh geometry={geo} material={OUTLINE} scale={outline} />}
    </group>
  )
}

// ---------- Corpo com articulações ----------

export interface Rig {
  body: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  hipL: THREE.Group
  hipR: THREE.Group
  kneeL: THREE.Group
  kneeR: THREE.Group
  shoulderL: THREE.Group
  shoulderR: THREE.Group
  elbowL: THREE.Group
  elbowR: THREE.Group
}

export interface AnimeBodyProps {
  kit: Kit
  skin: string
  hair: string
  /** "hero": rosto, cabelo completo e detalhes; "crowd": versão leve para os outros. */
  detail?: 'hero' | 'crowd'
  iris?: string
  ghost?: boolean
  glow?: string | null
  rigRef?: Ref<Rig | null>
}

const HIP_Y = 0.88
const THIGH = 0.43

/** Monta o boneco anime e entrega as articulações em `rigRef`. */
export function AnimeBody({ kit, skin, hair, detail = 'crowd', iris = '#ffb000', ghost, glow, rigRef }: AnimeBodyProps) {
  const g = geos()
  const hero = detail === 'hero'
  const jersey = useMemo(() => jerseyTexture(kit), [kit])
  const face = useMemo(() => (hero ? faceTexture(iris) : null), [hero, iris])
  const spikes = hero ? SPIKES_HERO : SPIKES_CROWD
  const shirtGlow = glow ?? null
  // Nos outros jogadores, as peças pequenas ficam sem contorno: menos desenho por quadro no celular.
  const small = hero ? undefined : 1

  // As articulações são capturadas pelos callbacks de ref e entregues juntas.
  const parts = useMemo(() => ({}) as Partial<Rig>, [])
  const set = (k: keyof Rig) => (el: THREE.Group | null) => {
    if (el) parts[k] = el
    const all = (
      ['body', 'torso', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR'] as const
    ).every((n) => parts[n])
    if (all && rigRef) {
      if (typeof rigRef === 'function') rigRef(parts as Rig)
      else (rigRef as { current: Rig | null }).current = parts as Rig
    }
  }

  const leg = (side: 1 | -1) => (
    <group ref={set(side > 0 ? 'hipL' : 'hipR')} position={[side * 0.095, 0, 0]}>
      <Part geo={g.thigh!} color={skin} position={[0, -0.225, 0]} ghost={ghost} />
      {/* Calção: uma perna por coxa, que acompanha o movimento. */}
      <Part geo={g.shortLeg!} color={kit.shorts} position={[0, -0.09, 0]} ghost={ghost} />
      <Part geo={g.shortsStripe!} color={kit.shortsTrim} position={[side * 0.1, -0.09, 0]} outline={1} ghost={ghost} />
      <group ref={set(side > 0 ? 'kneeL' : 'kneeR')} position={[0, -THIGH, 0]}>
        <Part geo={g.shinSkin!} color={skin} position={[0, -0.08, 0]} outline={small} ghost={ghost} />
        <Part geo={g.sock!} color={kit.socks} position={[0, -0.26, 0]} ghost={ghost} />
        <Part geo={g.boot!} color={kit.boots} position={[0, -0.405, 0.045]} rotation={[Math.PI / 2, 0, 0]} outline={small} ghost={ghost} />
        {hero && <Part geo={g.sole!} color={kit.sole} position={[0, -0.452, 0.045]} outline={1} emissive={kit.sole} ghost={ghost} />}
      </group>
    </group>
  )

  const arm = (side: 1 | -1) => (
    <group ref={set(side > 0 ? 'shoulderL' : 'shoulderR')} position={[side * 0.235, 0.345, 0]}>
      <Part geo={g.sleeve!} color={kit.trim} position={[0, -0.05, 0]} outline={small} ghost={ghost} />
      <Part geo={g.upperArm!} color={skin} position={[0, -0.17, 0]} outline={small} ghost={ghost} />
      <group ref={set(side > 0 ? 'elbowL' : 'elbowR')} position={[0, -0.28, 0]}>
        <Part geo={g.foreArm!} color={skin} position={[0, -0.13, 0]} outline={small} ghost={ghost} />
        <Part geo={g.hand!} color={skin} position={[0, -0.27, 0]} outline={small} ghost={ghost} />
      </group>
    </group>
  )

  return (
    <group ref={set('body')}>
      <group position={[0, HIP_Y, 0]}>
        {leg(1)}
        {leg(-1)}
        <Part geo={g.waist!} color={kit.shorts} position={[0, -0.02, 0]} ghost={ghost} />
        <group ref={set('torso')} position={[0, 0.05, 0]}>
          <Part geo={g.torso!} color={kit.shirt} map={jersey} position={[0, 0.2, 0]} emissive={shirtGlow} ghost={ghost} />
          <Part geo={g.shoulders!} color={kit.shirt} position={[0, 0.37, -0.005]} rotation={[0, 0, Math.PI / 2]} emissive={shirtGlow} ghost={ghost} />
          {arm(1)}
          {arm(-1)}
          <Part geo={g.neck!} color={skin} position={[0, 0.43, 0]} outline={small} ghost={ghost} />
          <group ref={set('head')} position={[0, 0.46, 0]}>
            <group position={[0, 0.14, 0.005]} scale={[1, 1.08, 1.02]}>
              <Part geo={g.head!} color={skin} ghost={ghost} />
              {face && <Part geo={g.face!} color={skin} map={face} transparentMap outline={1} ghost={ghost} />}
              {hero &&
                [1, -1].map((s) => <Part key={s} geo={g.ear!} color={skin} position={[s * 0.136, -0.005, -0.01]} ghost={ghost} />)}
              <Part geo={g.hairCap!} color={hair} position={[0, 0.012, -0.012]} ghost={ghost} />
              {spikes.map(([x, y, z], i) => {
                const dir = new THREE.Vector3(x, y, z).normalize()
                const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
                const e = new THREE.Euler().setFromQuaternion(q)
                const base = dir.clone().multiplyScalar(0.128)
                return (
                  <Part
                    key={i}
                    geo={g.spike!}
                    color={hair}
                    position={[base.x, base.y + 0.01, base.z - 0.005]}
                    rotation={[e.x, e.y, e.z]}
                    outline={1.09}
                    ghost={ghost}
                  />
                )
              })}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

// ---------- Poses ----------

export interface Pose {
  hipL: number
  hipR: number
  kneeL: number
  kneeR: number
  /** Ombros: [para a frente/trás, abrir para o lado]. */
  shoulderL: [number, number]
  shoulderR: [number, number]
  elbowL: number
  elbowR: number
  /** Tronco: [inclinação para a frente, giro]. */
  torso: [number, number]
  /** Cabeça: [olhar para baixo, giro]. */
  head: [number, number]
  /** Altura extra do corpo (pulo no passo da corrida). */
  lift: number
}

export const IDLE: Pose = {
  hipL: -0.05,
  hipR: 0.05,
  kneeL: 0.12,
  kneeR: 0.12,
  shoulderL: [0.05, 0.12],
  shoulderR: [0.05, -0.12],
  elbowL: -0.25,
  elbowR: -0.25,
  torso: [0.08, 0],
  head: [0.05, 0],
  lift: 0,
}

/** Perna direita atrás, joelho dobrado, braço esquerdo aberto: o instante antes do chute. */
export const KICK_WINDUP: Pose = {
  hipL: -0.28,
  hipR: 0.75,
  kneeL: 0.35,
  kneeR: 1.65,
  shoulderL: [-0.35, 1.15],
  shoulderR: [0.55, -0.55],
  elbowL: -0.35,
  elbowR: -0.7,
  torso: [0.32, 0.38],
  head: [0.42, 0.18],
  lift: -0.03,
}

/** A perna atravessa e bate na bola. */
export const KICK_STRIKE: Pose = {
  hipL: -0.1,
  hipR: -1.15,
  kneeL: 0.25,
  kneeR: 0.15,
  shoulderL: [0.35, 0.9],
  shoulderR: [-0.6, -0.5],
  elbowL: -0.3,
  elbowR: -0.5,
  torso: [0.18, -0.35],
  head: [0.32, -0.1],
  lift: 0.02,
}

/** Passada de corrida; `run` vai de 0 (parado) a 1 (correndo). */
export function runPose(phase: number, run: number): Pose {
  const s = Math.sin(phase)
  const c = Math.cos(phase)
  const amp = 0.75 * run
  return {
    hipL: s * amp - 0.05,
    hipR: -s * amp + 0.05,
    kneeL: 0.12 + Math.max(0, -c) * 1.2 * run,
    kneeR: 0.12 + Math.max(0, c) * 1.2 * run,
    shoulderL: [-s * 0.7 * run + 0.05, 0.12],
    shoulderR: [s * 0.7 * run + 0.05, -0.12],
    elbowL: -0.25 - 0.9 * run,
    elbowR: -0.25 - 0.9 * run,
    torso: [0.08 + 0.18 * run, 0],
    head: [0.05, 0],
    lift: Math.abs(s) * 0.05 * run,
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function blendPose(a: Pose, b: Pose, t: number): Pose {
  return {
    hipL: lerp(a.hipL, b.hipL, t),
    hipR: lerp(a.hipR, b.hipR, t),
    kneeL: lerp(a.kneeL, b.kneeL, t),
    kneeR: lerp(a.kneeR, b.kneeR, t),
    shoulderL: [lerp(a.shoulderL[0], b.shoulderL[0], t), lerp(a.shoulderL[1], b.shoulderL[1], t)],
    shoulderR: [lerp(a.shoulderR[0], b.shoulderR[0], t), lerp(a.shoulderR[1], b.shoulderR[1], t)],
    elbowL: lerp(a.elbowL, b.elbowL, t),
    elbowR: lerp(a.elbowR, b.elbowR, t),
    torso: [lerp(a.torso[0], b.torso[0], t), lerp(a.torso[1], b.torso[1], t)],
    head: [lerp(a.head[0], b.head[0], t), lerp(a.head[1], b.head[1], t)],
    lift: lerp(a.lift, b.lift, t),
  }
}

/** Chute em três tempos: preparar, bater, voltar. `t` de 0 a 1. */
export function kickPose(t: number, base: Pose): Pose {
  if (t < 0.4) return blendPose(base, KICK_WINDUP, t / 0.4)
  if (t < 0.65) return blendPose(KICK_WINDUP, KICK_STRIKE, (t - 0.4) / 0.25)
  return blendPose(KICK_STRIKE, base, (t - 0.65) / 0.35)
}

export function applyPose(rig: Rig, p: Pose) {
  rig.hipL.rotation.x = p.hipL
  rig.hipR.rotation.x = p.hipR
  rig.kneeL.rotation.x = p.kneeL
  rig.kneeR.rotation.x = p.kneeR
  rig.shoulderL.rotation.set(p.shoulderL[0], 0, p.shoulderL[1])
  rig.shoulderR.rotation.set(p.shoulderR[0], 0, p.shoulderR[1])
  rig.elbowL.rotation.x = p.elbowL
  rig.elbowR.rotation.x = p.elbowR
  rig.torso.rotation.set(p.torso[0], p.torso[1], 0)
  rig.head.rotation.set(p.head[0], p.head[1], 0)
  rig.body.position.y = p.lift
}
