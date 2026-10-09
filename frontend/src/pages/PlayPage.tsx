import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'

import { useRecordAttempt, useScenarios, useStats } from '../api/queries'
import type { Medal, Player, Scenario, ScenarioOption } from '../api/types'
import { useActivePlayer } from '../auth/PlayerProvider'
import { Button, ErrorNote, GradeChip, Loading, MedalCard, Verdict } from '../components/ui'
import { Court } from '../game/Court'
import { arrowsFor, bestOptionIndex, initialState } from '../game/engine'
import type { BoardState } from '../game/engine'
import { buildQueue, closingMessage, isMode, sessionLabel, summarize } from '../game/session'
import type { Mode, SessionResult } from '../game/session'
import { useBoardAnimation } from '../game/useBoardAnimation'
import { CATEGORIES, GRADES, LETTERS, OPTION_TYPES, OUTCOME_STYLE, TIME_LIMIT_MS } from '../lib/catalog'
import { seconds } from '../lib/format'

export function PlayPage() {
  const { mode } = useParams()
  const player = useActivePlayer()
  const scenarios = useScenarios()
  const stats = useStats(player.id)
  const [run, setRun] = useState(0)

  if (!isMode(mode)) return <Navigate to="/" replace />
  if (scenarios.isPending || stats.isPending) return <Loading label="Preparando a quadra…" />
  if (scenarios.isError) return <ErrorNote error={scenarios.error} onRetry={() => scenarios.refetch()} />

  return (
    <Session
      key={`${mode}-${player.id}-${run}`}
      mode={mode}
      player={player}
      scenarios={scenarios.data}
      queue={buildQueue(mode, scenarios.data, stats.data)}
      onRestart={() => setRun((n) => n + 1)}
    />
  )
}

type Phase = 'intro' | 'ask' | 'outcome' | 'feedback'
type Showing = 'choice' | 'late' | 'replay'

interface Feedback {
  option: ScenarioOption
  ms: number | null
  showing: Showing
}

function Session({
  mode,
  player,
  scenarios,
  queue: initialQueue,
  onRestart,
}: {
  mode: Mode
  player: Player
  scenarios: Scenario[]
  queue: string[]
  onRestart: () => void
}) {
  // A sessão congela a lista de lances e as jogadas do começo ao fim, mesmo
  // que os dados sejam atualizados em segundo plano.
  const [queue] = useState(initialQueue)
  const [byId] = useState(() => new Map(scenarios.map((s) => [s.id, s])))
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('intro')
  const [showing, setShowing] = useState<Showing>('choice')
  const [chosen, setChosen] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [results, setResults] = useState<SessionResult[]>([])
  const [newMedals, setNewMedals] = useState<Medal[]>([])
  const [saveFailed, setSaveFailed] = useState(false)
  const [finished, setFinished] = useState(false)

  const phaseRef = useRef<Phase>('intro')
  const freezeRef = useRef<BoardState | null>(null)
  const askedAt = useRef(0)
  const navigate = useNavigate()
  const { mutate: recordAttempt } = useRecordAttempt(player.id)
  const { snapshot, reset, play, wait, cancel, current } = useBoardAnimation(player.settings.slow ? 1.7 : 1)

  const sc = byId.get(queue[index]!)!
  const bestIndex = bestOptionIndex(sc)
  const best = sc.options[bestIndex]!

  const go = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  // Cada lance: posiciona as peças, roda a jogada e congela na pausa tática.
  useEffect(() => {
    reset(initialState(sc))
    let alive = true
    ;(async () => {
      if (!(await wait(700)) || !alive) return
      if (!(await play(sc.intro)) || !alive) return
      freezeRef.current = current()
      askedAt.current = performance.now()
      go('ask')
    })()
    return () => {
      alive = false
      cancel()
    }
  }, [sc, reset, wait, play, current, cancel, go])

  const save = useCallback(
    (optionIndex: number | null, ms: number) =>
      recordAttempt(
        { scenario_id: sc.id, option_index: optionIndex, decision_ms: Math.round(ms) },
        {
          onSuccess: (r) => {
            if (r.new_medals.length) setNewMedals((m) => [...m, ...r.new_medals])
          },
          onError: () => setSaveFailed(true),
        },
      ),
    [recordAttempt, sc.id],
  )

  const choose = useCallback(
    async (i: number) => {
      if (phaseRef.current !== 'ask') return
      const option = sc.options[i]
      if (!option) return
      const ms = performance.now() - askedAt.current
      go('outcome')
      setShowing('choice')
      setChosen(i)
      setResults((r) => [...r, { scenarioId: sc.id, grade: option.grade, ms }])
      save(i, ms)
      if (!(await play(option.frames))) return
      setFeedback({ option, ms, showing: 'choice' })
      go('feedback')
    },
    [sc, go, save, play],
  )

  const timeUp = useCallback(async () => {
    if (phaseRef.current !== 'ask') return
    go('outcome')
    setShowing('late')
    setResults((r) => [...r, { scenarioId: sc.id, grade: 'late', ms: null }])
    save(null, TIME_LIMIT_MS)
    if (!(await play(best.frames))) return
    setFeedback({ option: best, ms: null, showing: 'late' })
    go('feedback')
  }, [sc.id, best, go, save, play])

  const watchBest = async () => {
    if (!freezeRef.current) return
    reset(freezeRef.current)
    go('outcome')
    setShowing('replay')
    setFeedback(null)
    if (!(await wait(500))) return
    if (!(await play(best.frames))) return
    setFeedback({ option: best, ms: null, showing: 'replay' })
    go('feedback')
  }

  const next = () => {
    if (index + 1 >= queue.length) {
      cancel()
      setFinished(true)
      return
    }
    phaseRef.current = 'intro'
    setPhase('intro')
    setChosen(null)
    setFeedback(null)
    setIndex(index + 1)
  }

  // Pausa com tempo.
  useEffect(() => {
    if (phase !== 'ask' || !player.settings.timed) return
    const id = setTimeout(timeUp, TIME_LIMIT_MS)
    return () => clearTimeout(id)
  }, [phase, player.settings.timed, timeUp])

  // Teclas A–D ou 1–4 escolhem na pausa.
  useEffect(() => {
    if (phase !== 'ask') return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toUpperCase()
      const i = '1234'.includes(k) ? Number(k) - 1 : LETTERS.indexOf(k as (typeof LETTERS)[number])
      if (i >= 0 && i < sc.options.length) {
        e.preventDefault()
        void choose(i)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, sc.options.length, choose])

  const arrows = useMemo(
    () => (phase === 'ask' && freezeRef.current ? arrowsFor(sc, freezeRef.current) : []),
    [phase, sc],
  )

  if (finished)
    return (
      <Summary
        label={sessionLabel(mode)}
        results={results}
        scenarios={byId}
        newMedals={newMedals}
        saveFailed={saveFailed}
        onRestart={onRestart}
      />
    )

  const isLast = index + 1 >= queue.length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className="rounded-full bg-ink px-2.5 py-1 text-bg">{CATEGORIES[sc.category].name}</span>
          <span className="rounded-full border border-line bg-surface px-2.5 py-1">{sc.concept}</span>
          <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-mono">
            Lance {index + 1} de {queue.length}
          </span>
        </div>
        <Button variant="ghost" className="min-h-9 px-3 py-1.5 text-sm" onClick={() => navigate('/')}>
          Sair do treino
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <div className="relative overflow-hidden rounded-2xl bg-court-out p-2">
            {snapshot && (
              <Court
                scenario={sc}
                snapshot={snapshot}
                arrows={arrows}
                asking={phase === 'ask'}
                onPick={(i) => void choose(i)}
              />
            )}
            {phase === 'feedback' && feedback && (
              <div
                className={`absolute top-4 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 font-display text-2xl whitespace-nowrap shadow-lg sm:text-3xl ${OUTCOME_STYLE[feedback.option.kind]}`}
              >
                <div className="animate-pop motion-reduce:animate-none">{feedback.option.result}</div>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-you" />Você</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-us" />Seu time</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-them ring-1 ring-muted" />Adversário</span>
            <span>Seu time ataca para cima</span>
          </div>
        </div>

        <section className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-live="polite">
          {phase === 'intro' && (
            <>
              <div className="eyebrow">{sessionLabel(mode)}</div>
              <h2 className="font-display text-2xl leading-tight">{sc.title}</h2>
              <p>{sc.setup}</p>
              <p className="flex items-center gap-2.5 text-muted">
                <span className="size-2.5 animate-blink rounded-full bg-us motion-reduce:animate-none" />
                Observe a jogada. Ela vai parar no momento da sua decisão.
              </p>
            </>
          )}

          {(phase === 'ask' || (phase === 'outcome' && showing === 'choice')) && (
            <>
              <div className="font-display text-base text-us">PAUSA TÁTICA</div>
              <p className="text-xl leading-snug font-bold">{sc.ask}</p>
              {player.settings.timed && phase === 'ask' && (
                <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div
                    className="h-full origin-left bg-us"
                    style={{ animation: `timer ${TIME_LIMIT_MS}ms linear forwards` }}
                  />
                </div>
              )}
              <div className="grid gap-2">
                {sc.options.map((o, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={phase !== 'ask'}
                    onClick={() => void choose(i)}
                    className={`flex min-h-14 items-center gap-3 rounded-2xl border-2 bg-bg px-3 py-2.5 text-left transition hover:border-us disabled:cursor-default ${
                      chosen === i ? 'border-ink' : 'border-line disabled:opacity-55'
                    }`}
                  >
                    <span className="grid size-8 flex-none place-items-center rounded-full bg-you font-bold text-you-ink">
                      {LETTERS[i]}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight font-semibold">
                      {o.label}
                      <span className="mt-0.5 block text-[11px] font-semibold tracking-wider text-muted uppercase">
                        {OPTION_TYPES[o.type]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {phase === 'ask' && (
                <p className="text-sm text-muted">
                  Toque numa opção{sc.options.some((o) => o.target) ? ' ou no companheiro destacado na quadra' : ''}.
                </p>
              )}
            </>
          )}

          {phase === 'outcome' && showing === 'late' && (
            <>
              <Verdict tone="bad">O tempo acabou</Verdict>
              <p className="text-lg">
                No jogo, a decisão tem que vir rápido. Veja a melhor opção: <b>{best.label}</b>.
              </p>
            </>
          )}

          {phase === 'outcome' && showing === 'replay' && (
            <p className="flex items-center gap-2.5 text-muted">
              <span className="size-2.5 animate-blink rounded-full bg-us motion-reduce:animate-none" />
              Melhor jogada: {best.label}
            </p>
          )}

          {phase === 'feedback' && feedback && (
            <FeedbackPanel
              scenario={sc}
              feedback={feedback}
              best={best}
              isLast={isLast}
              onWatchBest={watchBest}
              onNext={next}
            />
          )}

          {saveFailed && (
            <p className="text-sm text-bad">
              Não consegui salvar uma das decisões. O treino continua, mas ela não vai aparecer nas estatísticas.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function FeedbackPanel({
  scenario,
  feedback,
  best,
  isLast,
  onWatchBest,
  onNext,
}: {
  scenario: Scenario
  feedback: Feedback
  best: ScenarioOption
  isLast: boolean
  onWatchBest: () => void
  onNext: () => void
}) {
  const { option, ms, showing } = feedback
  const g = GRADES[option.grade]
  const missed = showing === 'choice' && option.grade !== 'best'
  const nextRef = useRef<HTMLButtonElement>(null)
  useEffect(() => nextRef.current?.focus({ preventScroll: true }), [])

  return (
    <>
      {showing === 'late' && <Verdict tone="bad">O tempo acabou · 0 pontos</Verdict>}
      {showing === 'replay' && <Verdict tone="good">A melhor jogada</Verdict>}
      {showing === 'choice' && (
        <Verdict tone={g.tone}>
          {g.label} · +{g.points} {g.points === 1 ? 'ponto' : 'pontos'}
        </Verdict>
      )}
      <h2 className="font-display text-2xl leading-tight">{option.result}</h2>
      <p className="text-lg leading-relaxed">{option.why}</p>
      {ms != null && (
        <p className="text-sm text-muted">
          Você decidiu em <span className="font-mono">{seconds(ms)}</span>.
        </p>
      )}
      {missed && (
        <p className="text-sm text-muted">
          Melhor opção: <b className="text-ink">{best.label}</b>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {missed && (
          <Button variant="outline" onClick={onWatchBest}>
            Ver a melhor jogada
          </Button>
        )}
        <Button ref={nextRef} onClick={onNext}>
          {isLast ? 'Ver resultado' : 'Próximo lance'}
        </Button>
      </div>
      <p className="border-t border-line pt-3 text-sm text-muted">
        <b className="text-ink">Conceito: {scenario.concept}.</b> {scenario.lesson}
      </p>
    </>
  )
}

function Summary({
  label,
  results,
  scenarios,
  newMedals,
  saveFailed,
  onRestart,
}: {
  label: string
  results: SessionResult[]
  scenarios: Map<string, Scenario>
  newMedals: Medal[]
  saveFailed: boolean
  onRestart: () => void
}) {
  const s = summarize(results)
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="eyebrow">{label} · fim do treino</div>
      <h1 className="font-display text-4xl leading-tight">{closingMessage(s.best, results.length)}</h1>
      <div className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {[
          [s.points, 'pontos de leitura'],
          [`${s.best}/${results.length}`, 'ótimas leituras'],
          [seconds(s.avgMs), 'tempo médio'],
        ].map(([value, text]) => (
          <div key={text} className="flex flex-col-reverse px-3.5 py-2.5">
            <span className="text-xs text-muted">{text}</span>
            <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {results.map((r, i) => {
          const sc = scenarios.get(r.scenarioId)
          return (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <b>{sc?.title}</b>
                <span className="block text-sm text-muted">{sc?.concept}</span>
              </span>
              <GradeChip grade={r.grade} />
            </li>
          )
        })}
      </ul>
      {newMedals.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-2xl">{newMedals.length === 1 ? 'Medalha nova!' : 'Medalhas novas!'}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
            {newMedals.map((m) => (
              <MedalCard key={m.id} medal={m} />
            ))}
          </div>
        </section>
      )}
      {saveFailed && (
        <ErrorNote error={new Error('Algumas decisões não foram salvas por falta de conexão.')} />
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="accent" onClick={onRestart}>
          Treinar de novo
        </Button>
        <Link to="/" className="inline-flex min-h-11 items-center rounded-xl border-2 border-ink px-4 font-bold">
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
