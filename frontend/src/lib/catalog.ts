import type { Category, Grade, OptionType, OutcomeKind } from '../api/types'

export const CATEGORY_ORDER: Category[] = ['ataque', 'defesa', 'transicao']

export const CATEGORIES: Record<Category, { name: string; blurb: string; tip: string }> = {
  ataque: {
    name: 'Ataque',
    blurb: 'Contra-ataque, tabela e jogo de pivô.',
    tip: 'No jogo, repare se a criança olha para os companheiros antes de receber. Quem já olhou decide mais rápido.',
  },
  defesa: {
    name: 'Defesa',
    blurb: 'Cobertura, linha de passe e marcação 1 contra 1.',
    tip: 'Depois do jogo, pergunte: onde estava a bola, onde estava o seu jogador e quem fazia a cobertura? Falar sobre o lance fixa a leitura.',
  },
  transicao: {
    name: 'Transição',
    blurb: 'Os segundos depois de perder ou de roubar a bola.',
    tip: 'Combinem uma palavra-gatilho, como "perdeu, aperta". Ela ajuda a reagir sem parar para pensar.',
  },
}

export type Tone = 'good' | 'ok' | 'bad'

export const GRADES: Record<Grade, { label: string; points: number; tone: Tone }> = {
  best: { label: 'Ótima leitura', points: 3, tone: 'good' },
  ok: { label: 'Dá para melhorar', points: 1, tone: 'ok' },
  bad: { label: 'Escolha arriscada', points: 0, tone: 'bad' },
  late: { label: 'O tempo acabou', points: 0, tone: 'bad' },
}

export const OPTION_TYPES: Record<OptionType, string> = {
  passe: 'Passe',
  chute: 'Chute',
  drible: 'Drible',
  proteger: 'Proteger',
  posicao: 'Posição',
  pressao: 'Pressão',
  atitude: 'Atitude',
}

export const LETTERS = ['A', 'B', 'C', 'D'] as const

export const OUTCOME_STYLE: Record<OutcomeKind, string> = {
  gol: 'bg-you text-you-ink text-4xl sm:text-5xl',
  golcontra: 'bg-bad text-white',
  recupera: 'bg-good text-white',
  posse: 'bg-surface text-ink',
  perde: 'bg-surface text-ink',
  neutro: 'bg-surface text-ink',
}

/** Tempo para decidir no modo "pausa com tempo". */
export const TIME_LIMIT_MS = 8000
