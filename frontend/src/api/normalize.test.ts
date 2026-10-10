import { describe, expect, it } from 'vitest'

import { normalizeScenario, type ScenarioPayload } from './normalize'

// Jogada como uma API de antes do escaneamento mandava: sem threats, ai, tall,
// aware nem o texto curto das opções.
const old = {
  id: '2x1',
  category: 'ataque',
  concept: '2 contra 1',
  title: 'Contra-ataque 2 contra 1',
  sort_order: 1,
  setup: '',
  ask: '',
  lesson: '',
  view: { top: 0, bottom: 30 },
  start: { positions: { v: [5, 20] }, ball: 'v' },
  intro: [{ ms: 500, moves: {}, ball: null }],
  options: [
    { type: 'passe', label: 'Tocar', grade: 'best', result: '', kind: 'gol', why: '', frames: [] },
    { type: 'chute', label: 'Chutar', grade: 'bad', result: '', kind: 'perde', why: '', frames: [] },
  ],
} as unknown as ScenarioPayload

describe('normalizeScenario', () => {
  it('completa os campos que faltam com os padrões da API', () => {
    const s = normalizeScenario(old)
    expect(s.threats).toEqual([])
    expect(s.ai).toEqual({})
    expect(s.tall).toEqual([])
    expect(s.aware).toBeNull()
    expect(s.tags).toEqual({})
    expect(s.face).toEqual({})
    expect(s.options.map((o) => [o.short, o.target, o.hint])).toEqual([
      [null, null, null],
      [null, null, null],
    ])
    // A visão 3D faz Object.keys(scenario.ai) e new Set(scenario.tall).
    expect(() => Object.keys(s.ai)).not.toThrow()
  })

  it('mantém o que a API mandou', () => {
    const s = normalizeScenario({
      ...old,
      threats: ['o2'],
      ai: { o3: 'cercar' },
      tall: ['o4'],
      aware: { see: 'a1', label: 'o pivô livre' },
    })
    expect(s.threats).toEqual(['o2'])
    expect(s.ai).toEqual({ o3: 'cercar' })
    expect(s.tall).toEqual(['o4'])
    expect(s.aware).toEqual({ see: 'a1', label: 'o pivô livre' })
    expect(s.title).toBe('Contra-ataque 2 contra 1')
  })
})
