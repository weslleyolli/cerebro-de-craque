import type { Category, Grade, OptionType, OutcomeKind } from '../api/types'

export const CATEGORY_ORDER: Category[] = ['ataque', 'defesa', 'transicao']

export const CATEGORIES: Record<Category, { name: string; blurb: string; tip: string }> = {
  ataque: {
    name: 'Ataque',
    blurb: 'Receber na ala: tocar de primeira, girar e arrancar ou proteger a bola.',
    tip: 'No jogo, repare se a criança olha para os companheiros antes de receber. Quem já olhou decide mais rápido.',
  },
  defesa: {
    name: 'Defesa',
    blurb: 'Defender na ala sem perder quem corre nas suas costas.',
    tip: 'Depois do jogo, pergunte: quem passou nas suas costas naquele lance? Falar sobre o lance fixa o hábito de olhar para trás.',
  },
  transicao: {
    name: 'Transição',
    blurb: 'Os segundos depois de roubar ou recuperar a bola na ala.',
    tip: 'Combinem uma pergunta para a hora de roubar a bola: "quem está livre na frente?". Ela vira hábito e a criança passa a olhar antes de receber.',
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
  conducao: 'Condução',
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

/** Maior tempo de decisão guardado (o mesmo limite da API). */
export const MAX_DECISION_MS = 120_000
