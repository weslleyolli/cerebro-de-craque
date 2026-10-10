import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'

import { useRecordAttempt, useScenarios, useStats } from '../api/queries'
import type { Medal, Player, Scenario, ScenarioOption } from '../api/types'
import { useActivePlayer } from '../auth/PlayerProvider'
import { Button, ErrorNote, GradeChip, Loading, MedalCard, Verdict } from '../components/ui'
import { Court } from '../game/Court'
import { PlayerView } from '../game/CourtView'
import { arrowsFor, ballPoint, bestOptionIndex, initialState } from '../game/engine'
import type { BoardState } from '../game/engine'
import { buildQueue, closingMessage, isMode, sessionLabel, summarize } from '../game/session'
import type { Mode, SessionResult } from '../game/session'
import { directionWord, seenRecently, yawTo } from '../game/scan'
import { useBoardAnimation } from '../game/useBoardAnimation'
import { AWARE_WINDOW_MS, applyStep, awareTarget, newVision, optionAnchor } from '../game/vision'
import type { ScanMode, Vision } from '../game/vision'
import {
  CATEGORIES,
  GRADES,
  LETTERS,
  MAX_DECISION_MS,
  OPTION_TYPES,
  OUTCOME_STYLE,
  TIME_LIMIT_MS,
} from '../lib/catalog'
import { seconds } from '../lib/format'

export function PlayPage() {
  const { mode } = useParams()
  const player = useActivePlayer()
  const scenarios = useScenarios()
  const stats = useStats(player.id)
  const [run, setRun] = useState(0)

  if (!isMode(mode)) return <Navigate to="/" replace />
  if (!scenarios.data && scenarios.isError)
    return <ErrorNote error={scenarios.error} onRetry={() => scenarios.refetch()} />
  // As estatísticas só ajudam a escolher os lances do treino misturado; sem elas, o treino segue.
  if (!scenarios.data || stats.isPending) return <Loading label="Preparando a quadra…" />

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

/** O que a visão 3D registrou até a pausa: olhadas e se viu o que importava. */
interface ScanReport {
  scans: number
  aware: boolean
  /** Olhou na direção certa, mas um adversário tapava a visão. */
  blocked: boolean
  /** Onde estava o que importava, em relação a quem olha para a bola ("nas suas costas"). */
  where: string | null
}

const GHOST_TURN_MS = 1800

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
  // Visão do jogador (3D) ou prancheta: a prancheta é para entender o lance depois,
  // ou o caminho quando o aparelho não abre o 3D.
  const [no3d, setNo3d] = useState(false)
  // A visão 3D já abriu (o 3D é baixado na primeira vez e pode demorar).
  const [view3dReady, setView3dReady] = useState(false)
  const [topView, setTopView] = useState(false)
  const [found, setFound] = useState<number[]>([])
  const [liveScans, setLiveScans] = useState(0)
  const [report, setReport] = useState<ScanReport | null>(null)
  const [ghostYaw, setGhostYaw] = useState<number | null>(null)

  const phaseRef = useRef<Phase>('intro')
  const freezeRef = useRef<BoardState | null>(null)
  const reportRef = useRef<ScanReport | null>(null)
  const vision = useRef<Vision>(newVision())
  const askedAt = useRef(0)
  const navigate = useNavigate()
  const { mutateAsync: recordAttempt } = useRecordAttempt(player.id)
  const resultsRef = useRef<SessionResult[]>([])
  const { snapshot, slowMo, reset, play, wait, cancel, current } = useBoardAnimation(
    player.settings.slow ? 1.7 : 1,
  )

  const sc = byId.get(queue[index]!)!
  const bestIndex = bestOptionIndex(sc)
  const best = sc.options[bestIndex]!
  const use3d = !no3d
  const hints = player.settings.hints ?? true

  const go = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  // Cada lance: posiciona as peças e zera a memória da visão antes do primeiro
  // quadro do lance novo (a visão 3D não pode contar nada do lance anterior).
  useLayoutEffect(() => {
    vision.current = newVision()
    reset(initialState(sc))
  }, [sc, reset])

  // Roda a jogada (a criança olha em volta) e congela. Com o 3D, só depois que a
  // visão abriu: antes disso a criança não vê a jogada e nada seria contado.
  const canRun = !use3d || view3dReady
  useEffect(() => {
    if (!canRun) return
    let alive = true
    ;(async () => {
      if (!(await wait(900)) || !alive) return
      if (!(await play(sc.intro)) || !alive) return
      // Incorpora o passo para o lado ao lance (a bola que chega vai junto).
      const s0 = current()
      if (!s0) return
      const s = applyStep(s0, vision.current.offset)
      vision.current.offset = [0, 0]
      reset(s)
      freezeRef.current = s

      const now = performance.now()
      const target = awareTarget(sc, s.positions)
      const v = s.positions.v
      const ball = ballPoint(s)
      const aware = target ? seenRecently(vision.current.lastSeen.get(target.key), now, AWARE_WINDOW_MS) : false
      const r: ScanReport = {
        scans: vision.current.scans,
        aware,
        blocked:
          !aware && !!target && seenRecently(vision.current.lastBlocked.get(target.key), now, AWARE_WINDOW_MS),
        where: target && v ? directionWord(yawTo(v, ball), v, target.at) : null,
      }
      reportRef.current = r
      setReport(r)
      askedAt.current = now
      go('ask')
    })()
    return () => {
      alive = false
      cancel()
    }
  }, [sc, canRun, reset, wait, play, current, cancel, go])

  // Contador de olhadas na tela enquanto a jogada roda.
  useEffect(() => {
    if (phase !== 'intro') return
    const id = setInterval(() => setLiveScans(vision.current.scans), 200)
    return () => clearInterval(id)
  }, [phase])

  /**
   * Guarda a decisão na sessão e no servidor. Cada envio tem a própria promessa,
   * então a medalha ou o erro de uma decisão não se perde quando a próxima já começou.
   * A nota que vale é a do servidor.
   */
  const save = useCallback(
    (optionIndex: number | null, ms: number, localGrade: SessionResult['grade']) => {
      const index = resultsRef.current.length
      const r = use3d ? reportRef.current : null
      resultsRef.current = [
        ...resultsRef.current,
        { scenarioId: sc.id, grade: localGrade, ms: optionIndex === null ? null : ms, scans: r?.scans ?? null },
      ]
      setResults(resultsRef.current)
      recordAttempt({
        scenario_id: sc.id,
        option_index: optionIndex,
        decision_ms: Math.min(Math.round(ms), MAX_DECISION_MS),
        scans: r ? r.scans : null,
        aware: r ? r.aware : null,
      })
        .then((res) => {
          if (res.new_medals.length) setNewMedals((m) => [...m, ...res.new_medals])
          if (res.grade !== localGrade) {
            resultsRef.current = resultsRef.current.map((x, i) => (i === index ? { ...x, grade: res.grade } : x))
            setResults(resultsRef.current)
          }
        })
        .catch(() => setSaveFailed(true))
    },
    [recordAttempt, sc.id, use3d],
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
      save(i, ms, option.grade)
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
    save(null, TIME_LIMIT_MS, 'late')
    if (!(await play(best.frames))) return
    setFeedback({ option: best, ms: null, showing: 'late' })
    go('feedback')
  }, [best, go, save, play])

  /** Fantasma: volta à pausa, vira a câmera para o que importava e mostra a melhor jogada. */
  const watchBest = async () => {
    const s = freezeRef.current
    if (!s) return
    reset(s)
    setTopView(false)
    go('outcome')
    setShowing('replay')
    setFeedback(null)
    const v = s.positions.v
    const target = awareTarget(sc, s.positions) ?? null
    const anchor = optionAnchor(sc, bestIndex, s.positions)
    const look = target?.at ?? anchor
    setGhostYaw(v && look ? yawTo(v, look) : null)
    if (!(await wait(use3d ? GHOST_TURN_MS : 400))) return
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
    setFound([])
    setLiveScans(0)
    setReport(null)
    reportRef.current = null
    setGhostYaw(null)
    setTopView(false)
    setIndex(index + 1)
    // O lance novo começa lá em cima, com a quadra inteira na tela.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Pausa com tempo.
  useEffect(() => {
    if (phase !== 'ask' || !player.settings.timed) return
    const id = setTimeout(timeUp, TIME_LIMIT_MS)
    return () => clearTimeout(id)
  }, [phase, player.settings.timed, timeUp])

  // Na visão 3D, só dá para escolher o que já foi encontrado olhando em volta.
  const available = useMemo(
    () => (use3d ? found : sc.options.map((_, i) => i)),
    [use3d, found, sc.options],
  )

  // Teclas A–D ou 1–4 escolhem na pausa (entre as opções encontradas).
  useEffect(() => {
    if (phase !== 'ask') return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toUpperCase()
      const i = '1234'.includes(k) ? Number(k) - 1 : LETTERS.indexOf(k as (typeof LETTERS)[number])
      if (i >= 0 && available.includes(i)) {
        e.preventDefault()
        void choose(i)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, available, choose])

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
  const scanMode: ScanMode =
    phase === 'intro'
      ? 'live'
      : phase === 'ask'
        ? 'frozen'
        : showing === 'replay'
          ? 'ghost'
          : phase === 'outcome'
            ? 'follow'
            : 'frozen'
  const show2d = !use3d || topView

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
          <div className="relative overflow-hidden rounded-2xl bg-court-out p-1.5">
            {snapshot && (
              <>
                {use3d && (
                  // Sempre 4:5, centralizada: a tela mostra a mesma abertura que conta como
                  // visto (VISION_HFOV). Com o celular deitado, sobra espaço dos lados.
                  <div
                    className={`mx-auto aspect-[4/5] w-full max-w-[calc(68vh*4/5)] overflow-hidden rounded-xl ${show2d ? 'hidden' : ''}`}
                  >
                    <PlayerView
                      scenario={sc}
                      snapshot={snapshot}
                      mode={scanMode}
                      vision={vision}
                      hints={hints}
                      showOptions={phase === 'ask'}
                      slowMo={slowMo}
                      canStep={phase === 'intro'}
                      ghostYaw={ghostYaw}
                      onFound={setFound}
                      onPick={(i) => void choose(i)}
                      onReady={() => setView3dReady(true)}
                      onUnavailable={() => setNo3d(true)}
                    />
                  </div>
                )}
                {show2d && (
                  <Court
                    scenario={sc}
                    snapshot={snapshot}
                    arrows={arrows}
                    asking={phase === 'ask'}
                    onPick={(i) => void choose(i)}
                  />
                )}
              </>
            )}
            {phase === 'feedback' && feedback && (
              <div
                className={`pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 font-display text-2xl whitespace-nowrap shadow-lg sm:text-3xl ${OUTCOME_STYLE[feedback.option.kind]}`}
              >
                <div className="animate-pop motion-reduce:animate-none">{feedback.option.result}</div>
              </div>
            )}
            {phase === 'outcome' && showing === 'replay' && use3d && report?.where && sc.aware && (
              <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-center">
                <span className="rounded-xl bg-cyan-500/85 px-3 py-2 text-center text-sm font-bold text-white shadow-lg">
                  {report.blocked
                    ? `Fantasma: um passo para o lado e dava para ver ${sc.aware.label}.`
                    : `Fantasma: olhe ${report.where}. Ali estava ${sc.aware.label}.`}
                </span>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-you" />Você</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-us" />Seu time</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-them ring-1 ring-muted" />Adversário</span>
            {use3d && phase === 'feedback' && (
              <button type="button" onClick={() => setTopView((t) => !t)} className="ml-auto rounded-full border border-line bg-surface px-3 py-1 font-semibold text-ink">
                {topView ? 'Voltar à visão do jogador' : 'Ver de cima'}
              </button>
            )}
          </div>
          {no3d && (
            <p className="mt-1 text-xs text-muted">Este aparelho não abriu o 3D. Mostrando a prancheta.</p>
          )}
        </div>

        <section className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-live="polite">
          {phase === 'intro' && (
            <>
              <div className="eyebrow">{sessionLabel(mode)}</div>
              <h2 className="font-display text-2xl leading-tight">{sc.title}</h2>
              <p>{sc.setup}</p>
              {use3d ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-bg px-3 py-2.5">
                  <p className="text-sm text-muted">
                    Arraste a tela para virar a cabeça. Olhe em volta antes de a bola chegar.
                  </p>
                  <span className="flex-none text-center">
                    <span className="block font-mono text-2xl font-semibold tabular-nums">{liveScans}</span>
                    <span className="block text-[11px] text-muted">olhadas</span>
                  </span>
                </div>
              ) : (
                <p className="flex items-center gap-2.5 text-muted">
                  <span className="size-2.5 animate-blink rounded-full bg-us motion-reduce:animate-none" />
                  Observe a jogada. Ela vai parar no momento da sua decisão.
                </p>
              )}
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
              {use3d && phase === 'ask' && (
                <p className="rounded-xl bg-bg px-3 py-2 text-sm">
                  Gire a câmera em volta para achar as opções na quadra:{' '}
                  <b className="font-mono">
                    {found.length} de {sc.options.length}
                  </b>{' '}
                  encontradas.
                </p>
              )}
              <div className="grid gap-2">
                {sc.options.map((o, i) =>
                  available.includes(i) || chosen === i ? (
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
                  ) : null,
                )}
              </div>
              {phase === 'ask' && (
                <p className="text-sm text-muted">
                  {use3d
                    ? 'Toque no holograma, no companheiro destacado ou na opção aqui embaixo.'
                    : `Toque numa opção${sc.options.some((o) => o.target) ? ' ou no companheiro destacado na quadra' : ''}.`}
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
              <span className="size-2.5 animate-blink rounded-full bg-cyan-500 motion-reduce:animate-none" />
              Fantasma: {best.label}
            </p>
          )}

          {phase === 'feedback' && feedback && (
            <FeedbackPanel
              scenario={sc}
              feedback={feedback}
              best={best}
              report={use3d ? report : null}
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
  report,
  isLast,
  onWatchBest,
  onNext,
}: {
  scenario: Scenario
  feedback: Feedback
  best: ScenarioOption
  report: ScanReport | null
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
      {report && showing !== 'replay' && (
        <div className="rounded-xl bg-bg px-3 py-2.5 text-sm leading-relaxed">
          <p>
            Antes de a bola chegar, você olhou em volta{' '}
            <b>
              {report.scans} {report.scans === 1 ? 'vez' : 'vezes'}
            </b>
            .{report.scans < 2 && ' Craque olha várias vezes antes de receber.'}
          </p>
          {scenario.aware && (
            <p>
              {report.aware ? (
                <>
                  Você viu <b>{scenario.aware.label}</b>. Boa!
                </>
              ) : (
                <>
                  Você não viu <b>{scenario.aware.label}</b>
                  {report.blocked
                    ? ': você olhou para lá, mas um adversário tapava a visão. Dê um passo para o lado para enxergar.'
                    : report.where
                      ? `: estava ${report.where}.`
                      : '.'}
                </>
              )}
            </p>
          )}
        </div>
      )}
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
            Ver o fantasma
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
          s.avgScans === null
            ? [seconds(s.avgMs), 'tempo médio']
            : [s.avgScans.toFixed(1).replace('.', ','), 'olhadas por lance'],
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
