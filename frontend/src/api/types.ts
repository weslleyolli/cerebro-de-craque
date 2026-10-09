// Espelho dos schemas da API (backend/app/schemas.py).

export type Category = 'ataque' | 'defesa' | 'transicao'
export type Grade = 'best' | 'ok' | 'bad' | 'late'
export type OptionGrade = Exclude<Grade, 'late'>
export type OptionType = 'passe' | 'chute' | 'drible' | 'proteger' | 'posicao' | 'pressao' | 'atitude'
export type OutcomeKind = 'gol' | 'golcontra' | 'recupera' | 'posse' | 'perde' | 'neutro'

/** Ponto na quadra em metros: x de 0 a 20, y de 0 (gol adversário) a 40 (nosso gol). */
export type Point = [number, number]

export interface Frame {
  ms: number
  moves: Record<string, Point>
  /** Quem fica com a bola, um ponto da quadra, ou null para manter como está. */
  ball: string | Point | null
}

export interface ScenarioOption {
  type: OptionType
  label: string
  target: string | null
  hint: Point | null
  grade: OptionGrade
  result: string
  kind: OutcomeKind
  why: string
  frames: Frame[]
}

export interface Scenario {
  id: string
  category: Category
  concept: string
  title: string
  sort_order: number
  setup: string
  ask: string
  lesson: string
  view: { top: number; bottom: number }
  tags: Record<string, string>
  face: Record<string, 'up' | 'down'>
  start: { positions: Record<string, Point>; ball: string }
  intro: Frame[]
  options: ScenarioOption[]
}

export interface User {
  id: number
  name: string
  email: string
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  user: User
}

export interface PlayerSettings {
  timed: boolean
  slow: boolean
}

export interface Player {
  id: number
  name: string
  settings: PlayerSettings
  created_at: string
}

export interface Medal {
  id: string
  abbr: string
  name: string
  description: string
  earned: boolean
  earned_at: string | null
}

export interface AttemptResult {
  id: number
  scenario_id: string
  option_index: number | null
  grade: Grade
  points: number
  decision_ms: number
  created_at: string
  new_medals: Medal[]
}

export interface CategoryStats {
  category: Category
  attempts: number
  best: number
  ok: number
  bad: number
  timeouts: number
  avg_decision_ms: number | null
}

export interface ScenarioStats {
  scenario_id: string
  category: Category
  attempts: number
  best: number
  last_grade: Grade | null
  mastered: boolean
}

export interface Diagnosis {
  strongest: Category | null
  weakest: Category | null
  weakest_scenario_id: string | null
  unplayed: Category[]
}

export interface RecentAttempt {
  id: number
  scenario_id: string
  option_index: number | null
  grade: Grade
  decision_ms: number
  created_at: string
}

export interface Stats {
  player_id: number
  total_attempts: number
  best_count: number
  points: number
  avg_decision_ms: number | null
  best_streak: number
  categories: CategoryStats[]
  scenarios: ScenarioStats[]
  medals: Medal[]
  diagnosis: Diagnosis | null
  recent: RecentAttempt[]
}
