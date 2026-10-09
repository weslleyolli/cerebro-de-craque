import { describe, expect, it } from 'vitest'

import type { Category, Scenario, Stats } from '../api/types'
import { buildQueue, closingMessage, isMode, MIX_SIZE, summarize } from './session'

const make = (id: string, category: Category, sort_order: number) =>
  ({ id, category, sort_order }) as Scenario

const scenarios = [
  make('a1', 'ataque', 1),
  make('a2', 'ataque', 2),
  make('a3', 'ataque', 3),
  make('d1', 'defesa', 4),
  make('d2', 'defesa', 5),
  make('d3', 'defesa', 6),
  make('t1', 'transicao', 7),
  make('t2', 'transicao', 8),
  make('t3', 'transicao', 9),
]

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

describe('sessão', () => {
  it('reconhece os modos válidos', () => {
    expect(isMode('defesa')).toBe(true)
    expect(isMode('misturado')).toBe(true)
    expect(isMode('goleiro')).toBe(false)
    expect(isMode(undefined)).toBe(false)
  })

  it('treino por categoria segue a ordem do app', () => {
    const shuffled = [...scenarios].reverse()
    expect(buildQueue('defesa', shuffled, undefined)).toEqual(['d1', 'd2', 'd3'])
  })

  it('treino misturado prioriza lances ainda não dominados', () => {
    const masteredIds = ['a1', 'a2', 'a3', 'd1', 'd2']
    const stats = {
      scenarios: scenarios.map((s) => ({ scenario_id: s.id, mastered: masteredIds.includes(s.id) })),
    } as Stats
    for (let seed = 1; seed < 20; seed++) {
      const q = buildQueue('misturado', scenarios, stats, seeded(seed))
      expect(q).toHaveLength(MIX_SIZE)
      expect(new Set(q).size).toBe(MIX_SIZE)
      for (const id of ['d3', 't1', 't2', 't3']) expect(q).toContain(id)
    }
  })

  it('resume pontos, acertos e tempo médio', () => {
    const r = summarize([
      { scenarioId: 'a1', grade: 'best', ms: 2000 },
      { scenarioId: 'a2', grade: 'ok', ms: 4000 },
      { scenarioId: 'a3', grade: 'late', ms: null },
    ])
    expect(r).toEqual({ points: 4, best: 1, avgMs: 3000 })
    expect(closingMessage(3, 3)).toBe('Leitura perfeita!')
    expect(closingMessage(0, 3)).toBe('Todo craque começa assim.')
  })
})
