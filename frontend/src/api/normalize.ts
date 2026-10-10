import type { Scenario, ScenarioOption } from './types'

// Campos que a API completa com um padrão. Uma API mais antiga (ou a lista que o
// PWA guardou antes de um deploy) pode não mandar os campos que vieram depois.
type Loose<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
type OptionPayload = Loose<ScenarioOption, 'short' | 'target' | 'hint'>
export type ScenarioPayload = Loose<
  Omit<Scenario, 'options'>,
  'tags' | 'face' | 'threats' | 'ai' | 'tall' | 'aware'
> & { options: OptionPayload[] }

/** Jogada com os mesmos padrões da API: um campo faltando não pode derrubar a visão 3D. */
export function normalizeScenario(s: ScenarioPayload): Scenario {
  return {
    ...s,
    tags: s.tags ?? {},
    face: s.face ?? {},
    threats: s.threats ?? [],
    ai: s.ai ?? {},
    tall: s.tall ?? [],
    aware: s.aware ?? null,
    options: s.options.map((o) => ({
      ...o,
      short: o.short ?? null,
      target: o.target ?? null,
      hint: o.hint ?? null,
    })),
  }
}
