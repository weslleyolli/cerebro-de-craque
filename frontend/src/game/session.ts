import type { Category, Grade, Scenario, Stats } from '../api/types'
import { CATEGORIES, GRADES } from '../lib/catalog'

export type Mode = Category | 'misturado'

export const MIX_SIZE = 5

export function isMode(value: string | undefined): value is Mode {
  return value === 'misturado' || (value !== undefined && value in CATEGORIES)
}

export function sessionLabel(mode: Mode): string {
  return mode === 'misturado' ? 'Treino misturado' : `Treino de ${CATEGORIES[mode].name.toLowerCase()}`
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/**
 * Lances da sessão. Numa categoria, todos na ordem do app. No treino
 * misturado, cinco ao acaso, priorizando os que a criança ainda não dominou.
 */
export function buildQueue(
  mode: Mode,
  scenarios: Scenario[],
  stats: Stats | undefined,
  random: () => number = Math.random,
): string[] {
  if (mode !== 'misturado') {
    return scenarios
      .filter((s) => s.category === mode)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => s.id)
  }
  const mastered = new Set(stats?.scenarios.filter((s) => s.mastered).map((s) => s.scenario_id))
  const mixed = shuffle(scenarios, random)
  const ordered = [...mixed.filter((s) => !mastered.has(s.id)), ...mixed.filter((s) => mastered.has(s.id))]
  return shuffle(ordered.slice(0, MIX_SIZE), random).map((s) => s.id)
}

export interface SessionResult {
  scenarioId: string
  grade: Grade
  /** Tempo de decisão; null quando o tempo acabou. */
  ms: number | null
}

export function summarize(results: SessionResult[]) {
  const times = results.flatMap((r) => (r.ms == null ? [] : [r.ms]))
  return {
    points: results.reduce((n, r) => n + GRADES[r.grade].points, 0),
    best: results.filter((r) => r.grade === 'best').length,
    avgMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
  }
}

export function closingMessage(best: number, total: number): string {
  if (total > 0 && best === total) return 'Leitura perfeita!'
  if (best >= total / 2) return 'Bom treino!'
  return 'Todo craque começa assim.'
}
