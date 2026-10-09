import { Link, useNavigate } from 'react-router'

import { useScenarios, useStats, useUpdatePlayer } from '../api/queries'
import type { PlayerSettings, ScenarioStats } from '../api/types'
import { useActivePlayer, usePlayer } from '../auth/PlayerProvider'
import { ArrowHeadDefs, CourtMarkings } from '../game/Court'
import { ErrorNote, Loading, MedalCard } from '../components/ui'
import { CATEGORIES, CATEGORY_ORDER } from '../lib/catalog'

function HeroBoard() {
  const dot = (x: number, y: number, fill: string, tag?: string, ink = 'fill-us-ink') => (
    <g transform={`translate(${x} ${y})`}>
      <circle r={0.8} className={`${fill} stroke-court-line`} strokeWidth={0.11} />
      {tag && (
        <text y={0.2} textAnchor="middle" fontSize={0.56} fontWeight={700} className={ink}>
          {tag}
        </text>
      )}
    </g>
  )
  return (
    <svg viewBox="-1.6 -1.6 23.2 26" className="block h-auto w-full" role="img" aria-label="Exemplo de pausa tática: você com a bola e duas opções">
      <ArrowHeadDefs />
      <CourtMarkings />
      {[
        [13.9, 12.2],
        [9.6, 3],
      ].map(([x, y]) => (
        <line key={x} x1={7.7} y1={12.8} x2={x} y2={y} className="stroke-you" strokeWidth={0.17} strokeDasharray="0.45 0.3" strokeLinecap="round" markerEnd="url(#arrow-head)" />
      ))}
      {dot(15, 12, 'fill-us', 'AD')}
      {dot(8.6, 11.2, 'fill-them')}
      {dot(10, 1.2, 'fill-them')}
      {dot(7.6, 19.5, 'fill-them')}
      <circle cx={7.5} cy={13.5} r={1.3} fill="none" className="stroke-you" strokeWidth={0.16} opacity={0.6} />
      {dot(7.5, 13.5, 'fill-you', 'AE', 'fill-you-ink')}
      <circle cx={7.75} cy={12.7} r={0.36} fill="#fff" stroke="#111" strokeWidth={0.09} />
      <g transform="translate(10 22.3)">
        <rect x={-5.3} y={-0.75} width={10.6} height={1.5} rx={0.75} className="fill-you" />
        <text y={0.28} textAnchor="middle" fontSize={0.75} className="fill-you-ink font-display">
          O QUE VOCÊ FAZ AGORA?
        </text>
      </g>
    </svg>
  )
}

function Pip({ s }: { s: ScenarioStats | undefined }) {
  const tone = s?.mastered ? 'border-good bg-good' : s?.attempts ? 'border-ok bg-ok' : 'border-line'
  const label = s?.mastered ? 'ótima leitura feita' : s?.attempts ? 'já tentou' : 'ainda não jogou'
  return <span className={`size-3.5 flex-none rounded-full border-2 ${tone}`} role="img" aria-label={label} />
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex flex-1 basis-64 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <input id={id} type="checkbox" className="size-5 flex-none accent-us" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-semibold">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  )
}

export function HomePage() {
  const player = useActivePlayer()
  const { players, setActiveId } = usePlayer()
  const scenarios = useScenarios()
  const stats = useStats(player.id)
  const update = useUpdatePlayer()
  const navigate = useNavigate()

  if (scenarios.isPending || stats.isPending) return <Loading />
  if (scenarios.isError) return <ErrorNote error={scenarios.error} onRetry={() => scenarios.refetch()} />
  if (stats.isError) return <ErrorNote error={stats.error} onRetry={() => stats.refetch()} />

  const st = stats.data
  const byScenario = new Map(st.scenarios.map((s) => [s.scenario_id, s]))
  const mastered = st.scenarios.filter((s) => s.mastered).length
  const earned = st.medals.filter((m) => m.earned).length
  const setSetting = (patch: Partial<PlayerSettings>) =>
    update.mutate({ id: player.id, settings: { ...player.settings, ...patch } })

  return (
    <div className="flex flex-col gap-8">
      <section className="grid items-center gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Treino de leitura de jogo · futsal</span>
            {players.length > 1 && (
              <label className="ml-auto flex items-center gap-2 text-sm text-muted">
                Treinando como
                <select
                  className="rounded-lg border border-line bg-surface px-2 py-1 font-semibold text-ink"
                  value={player.id}
                  onChange={(e) => setActiveId(Number(e.target.value))}
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <h1 className="font-display text-4xl leading-[1.05] sm:text-6xl">
            Oi, <span className="text-us">{player.name}</span>! Pense antes da bola chegar.
          </h1>
          <p className="max-w-[46ch] text-muted">
            A jogada roda, a quadra congela e você decide: passar, chutar, driblar, proteger ou se
            posicionar. Depois vê o que a sua escolha causou e por quê.
          </p>
          <dl className="grid max-w-md grid-cols-3 divide-x divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {[
              [st.points, 'pontos de leitura'],
              [`${mastered}/${st.scenarios.length}`, 'lances dominados'],
              [`${earned}/${st.medals.length}`, 'medalhas'],
            ].map(([value, label]) => (
              <div key={label} className="flex flex-col-reverse px-3.5 py-2.5">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-mono text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div>
            <button
              type="button"
              onClick={() => navigate('/treino/misturado')}
              className="inline-flex items-center gap-2 rounded-2xl bg-us px-5 py-3.5 text-lg font-bold text-us-ink shadow-[0_3px_0_color-mix(in_srgb,var(--us)_55%,#000)] active:translate-y-0.5 active:shadow-none"
            >
              Treino misturado · 5 lances
            </button>
          </div>
        </div>
        <div className="hidden w-full max-w-xs justify-self-center rounded-2xl bg-court-out p-2.5 lg:block">
          <HeroBoard />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl">Escolha o treino</h2>
          <span className="text-sm text-muted">Verde: ótima leitura. Amarelo: já tentou.</span>
        </div>
        <div className="grid gap-3.5 md:grid-cols-3">
          {CATEGORY_ORDER.map((cat) => {
            const list = scenarios.data.filter((s) => s.category === cat)
            return (
              <article key={cat} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                <h3 className="font-display text-2xl">{CATEGORIES[cat].name}</h3>
                <p className="text-sm text-muted">{CATEGORIES[cat].blurb}</p>
                <ul className="flex flex-col gap-1.5">
                  {list.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <Pip s={byScenario.get(s.id)} />
                      {s.concept}
                    </li>
                  ))}
                </ul>
                <Link
                  to={`/treino/${cat}`}
                  className="mt-auto self-start rounded-xl bg-ink px-4 py-2 font-semibold text-bg"
                >
                  Treinar {CATEGORIES[cat].name.toLowerCase()}
                </Link>
              </article>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">Medalhas</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
          {st.medals.map((m) => (
            <MedalCard key={m.id} medal={m} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">Ajustes</h2>
        <div className="flex flex-wrap gap-2.5">
          <Toggle
            id="set-timed"
            label="Pausa com tempo"
            hint="8 segundos para decidir, como no jogo."
            checked={player.settings.timed}
            onChange={(timed) => setSetting({ timed })}
          />
          <Toggle
            id="set-slow"
            label="Jogadas em câmera lenta"
            hint="Bom para quem está começando."
            checked={player.settings.slow}
            onChange={(slow) => setSetting({ slow })}
          />
        </div>
        {update.isError && <ErrorNote error={update.error} />}
      </section>
    </div>
  )
}
