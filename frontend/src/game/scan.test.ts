import { describe, expect, it } from 'vitest'

import {
  ScanTracker,
  VISION_FOV,
  VISION_HFOV,
  angleDiff,
  applyAI,
  directionWord,
  dirFromYaw,
  horizontalFov,
  inView,
  laneClear,
  memoryOpacity,
  occludedBy,
  seenRecently,
  yawTo,
} from './scan'

const deg = (d: number) => (d * Math.PI) / 180

describe('visão do jogador', () => {
  it('mede direções: 0 é o gol adversário, positivo é para a direita', () => {
    expect(yawTo([10, 20], [10, 0])).toBeCloseTo(0)
    expect(yawTo([10, 20], [20, 20])).toBeCloseTo(Math.PI / 2)
    expect(yawTo([10, 20], [0, 20])).toBeCloseTo(-Math.PI / 2)
    expect(Math.abs(yawTo([10, 20], [10, 40]))).toBeCloseTo(Math.PI)
    const [x, y] = dirFromYaw(Math.PI / 2)
    expect(x).toBeCloseTo(1)
    expect(y).toBeCloseTo(0)
  })

  it('normaliza diferenças de ângulo', () => {
    expect(angleDiff(deg(170), deg(-170))).toBeCloseTo(deg(20))
    expect(angleDiff(deg(-170), deg(170))).toBeCloseTo(deg(-20))
  })

  it('sabe o que está dentro do campo de visão', () => {
    const hfov = horizontalFov(70, 0.8) // tela de celular em pé: ~59°
    expect(hfov).toBeGreaterThan(deg(55))
    expect(hfov).toBeLessThan(deg(62))
    expect(inView([10, 20], 0, hfov, [11, 10])).toBe(true)
    expect(inView([10, 20], 0, hfov, [20, 20])).toBe(false) // do lado
    expect(inView([10, 20], 0, hfov, [10, 30])).toBe(false) // nas costas
  })

  it('usa a mesma abertura para o que foi visto em qualquer formato de tela', () => {
    // A do celular em pé (~58,5°), e não a da tela: deitado (caixa 800x265), a câmera mostra ~129°.
    expect(VISION_HFOV).toBeCloseTo(horizontalFov(VISION_FOV, 0.8))
    expect(VISION_HFOV).toBeCloseTo(deg(58.5), 2)
    expect(horizontalFov(VISION_FOV, 800 / 265)).toBeGreaterThan(deg(120))
    // Algo a 40° da direção do olhar: fora da visão, mesmo que a tela deitada o mostre.
    const at: [number, number] = [10 + 10 * Math.sin(deg(40)), 20 - 10 * Math.cos(deg(40))]
    expect(inView([10, 20], 0, VISION_HFOV, at)).toBe(false)
  })

  it('percebe quando alguém tapa a visão, e o passo para o lado resolve', () => {
    const blockers = [{ id: 'o3', at: [13.3, 21.4] as [number, number], radius: 0.4 }]
    expect(occludedBy([12.4, 25], [14.6, 16], blockers)).toBe('o3')
    expect(occludedBy([11.4, 25], [14.6, 16], blockers)).toBeNull()
  })

  it('diz se a linha de passe está livre', () => {
    expect(laneClear([3, 20], [6, 8], [[11, 9]])).toBe(true)
    expect(laneClear([3, 20], [6, 8], [[4.6, 14]])).toBe(false)
  })

  it('faz o balanço defensivo acompanhando a bola, com limite', () => {
    const out = applyAI({ o3: [15, 19], o1: [10, 8] }, [3, 20], { o3: 'cercar' })
    expect(out.o3![0]).toBeLessThan(15)
    expect(out.o3![0]).toBeGreaterThanOrEqual(15 - 1.2)
    expect(out.o3![1]).toBe(19)
    expect(out.o1).toEqual([10, 8])
  })

  it('conta uma olhada por vez que tira os olhos da bola', () => {
    const t = new ScanTracker()
    const ball = 0
    t.update(0, 0, ball)
    t.update(100, deg(120), ball)
    expect(t.count).toBe(0) // ainda não ficou tempo suficiente
    t.update(300, deg(120), ball)
    expect(t.count).toBe(1)
    t.update(600, deg(150), ball) // continua olhando para trás: não conta de novo
    expect(t.count).toBe(1)
    t.update(800, deg(10), ball) // voltou para a bola
    t.update(900, deg(-100), ball)
    t.update(1100, deg(-100), ball)
    expect(t.count).toBe(2)
  })

  it('descreve onde está o que importava', () => {
    expect(directionWord(0, [10, 20], [10, 10])).toBe('na sua frente')
    expect(directionWord(0, [10, 20], [10, 30])).toBe('nas suas costas')
    expect(directionWord(0, [10, 20], [18, 19])).toBe('à sua direita')
    expect(directionWord(0, [10, 20], [2, 19])).toBe('à sua esquerda')
  })

  it('apaga as lembranças com o tempo', () => {
    expect(memoryOpacity(500)).toBe(1)
    expect(memoryOpacity(2250)).toBeCloseTo(0.5)
    expect(memoryOpacity(4000)).toBe(0)
    expect(seenRecently(1000, 3000)).toBe(true)
    expect(seenRecently(1000, 6000)).toBe(false)
    expect(seenRecently(undefined, 6000)).toBe(false)
  })
})
