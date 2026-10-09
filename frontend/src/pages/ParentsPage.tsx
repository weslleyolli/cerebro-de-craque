import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'

import { useDeletePlayer, useResetAttempts, useScenarios, useStats, useUpdatePlayer } from '../api/queries'
import type { Player, Scenario, Stats } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { useActivePlayer, usePlayer } from '../auth/PlayerProvider'
import { Button, Card, ErrorNote, GradeChip, Loading, TextField } from '../components/ui'
import { CATEGORIES, GRADES } from '../lib/catalog'
import { dateTime, percent, seconds } from '../lib/format'

// Vale até recarregar o app: a criança não entra sem a conta, o adulto não refaz a conta toda hora.
let unlocked = false

function Gate({ onOpen }: { onOpen: () => void }) {
  const [q] = useState(() => ({ a: 4 + Math.floor(Math.random() * 6), b: 6 + Math.floor(Math.random() * 4) }))
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (Number(value) === q.a * q.b) {
      unlocked = true
      onOpen()
    } else {
      setWrong(true)
      setValue('')
    }
  }
  return (
    <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
      <div className="eyebrow">Só para adultos</div>
      <h1 className="font-display text-3xl leading-tight">Área dos pais e treinadores</h1>
      <p className="text-sm text-muted">Para entrar, resolva a conta:</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="gate" className="font-mono text-3xl font-semibold">
          {q.a} × {q.b} =
        </label>
        <div className="flex gap-2">
          <input
            id="gate"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border-2 border-line bg-bg px-3 py-2.5 text-lg outline-none focus:border-us"
          />
          <Button type="submit">Entrar</Button>
        </div>
        <p className="min-h-5 text-sm text-bad" role="alert">
          {wrong ? 'Resultado errado. Tente de novo.' : ''}
        </p>
      </form>
    </div>
  )
}

export function ParentsPage() {
  const [open, setOpen] = useState(unlocked)
  if (!open) return <Gate onOpen={() => setOpen(true)} />
  return <Dashboard />
}

function Dashboard() {
  const player = useActivePlayer()
  const { players, setActiveId } = usePlayer()
  const stats = useStats(player.id)
  const scenarios = useScenarios()

  if (stats.isPending || scenarios.isPending) return <Loading />
  if (stats.isError) return <ErrorNote error={stats.error} onRetry={() => stats.refetch()} />
  if (scenarios.isError) return <ErrorNote error={scenarios.error} onRetry={() => scenarios.refetch()} />

  const st = stats.data
  const byId = new Map(scenarios.data.map((s) => [s.id, s]))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Área dos pais e treinadores</div>
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">Leitura de jogo de {player.name}</h1>
        </div>
        {players.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Jogador
            <select
              className="rounded-lg border border-line bg-surface px-2 py-1.5 font-semibold text-ink"
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

      {st.total_attempts === 0 && (
        <div className="rounded-2xl bg-ok-soft px-4 py-3 text-sm">
          {player.name} ainda não jogou nenhum lance. Os números aparecem aqui depois do primeiro treino.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {[
          [st.total_attempts, 'lances jogados'],
          [`${percent(st.best_count, st.total_attempts)}%`, 'ótimas leituras'],
          [seconds(st.avg_decision_ms), 'tempo médio de decisão'],
          [st.points, 'pontos de leitura'],
        ].map(([value, label]) => (
          <div key={label} className="flex flex-col-reverse rounded-2xl border border-line bg-surface px-4 py-3">
            <span className="text-xs text-muted">{label}</span>
            <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card title="Diagnóstico">
          <DiagnosisText stats={st} name={player.name} scenarios={byId} />
        </Card>
        <Card title="Decisões por categoria">
          <CategoryBars stats={st} />
        </Card>
      </div>

      <Card title="Por conceito">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-2.5 py-2 font-semibold">Conceito</th>
                <th className="px-2.5 py-2 font-semibold">Categoria</th>
                <th className="px-2.5 py-2 text-right font-semibold">Tentativas</th>
                <th className="px-2.5 py-2 text-right font-semibold">Ótimas</th>
                <th className="px-2.5 py-2 font-semibold">Última decisão</th>
              </tr>
            </thead>
            <tbody>
              {st.scenarios.map((s) => (
                <tr key={s.scenario_id} className="border-t border-line whitespace-nowrap">
                  <td className="px-2.5 py-2">{byId.get(s.scenario_id)?.concept}</td>
                  <td className="px-2.5 py-2">{CATEGORIES[s.category].name}</td>
                  <td className="px-2.5 py-2 text-right font-mono">{s.attempts}</td>
                  <td className="px-2.5 py-2 text-right font-mono">
                    {s.attempts ? `${percent(s.best, s.attempts)}%` : '–'}
                  </td>
                  <td className="px-2.5 py-2">
                    {s.last_grade ? <GradeChip grade={s.last_grade} /> : <span className="text-muted">não jogado</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Últimos lances">
        {st.recent.length === 0 ? (
          <p className="text-sm text-muted">Nenhum lance ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-2.5 py-2 font-semibold">Quando</th>
                  <th className="px-2.5 py-2 font-semibold">Lance</th>
                  <th className="px-2.5 py-2 font-semibold">Escolha</th>
                  <th className="px-2.5 py-2 font-semibold">Resultado</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {st.recent.map((a) => {
                  const sc = byId.get(a.scenario_id)
                  const option = a.option_index == null ? null : sc?.options[a.option_index]
                  return (
                    <tr key={a.id} className="border-t border-line whitespace-nowrap">
                      <td className="px-2.5 py-2 font-mono">{dateTime(a.created_at)}</td>
                      <td className="px-2.5 py-2">{sc?.title}</td>
                      <td className="px-2.5 py-2">{option?.label ?? '—'}</td>
                      <td className="px-2.5 py-2">
                        <GradeChip grade={a.grade} />
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        {a.grade === 'late' ? '—' : seconds(a.decision_ms)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <PlayersCard players={players} active={player} />
        <AccountCard player={player} />
      </div>
    </div>
  )
}

function DiagnosisText({ stats, name, scenarios }: { stats: Stats; name: string; scenarios: Map<string, Scenario> }) {
  const d = stats.diagnosis
  if (!d)
    return (
      <p className="leading-relaxed">
        Ainda há poucos lances para um diagnóstico. Depois de um treino de cada categoria, aqui aparece onde {name} lê
        bem o jogo e onde precisa de ajuda.
      </p>
    )
  const cat = (c: keyof typeof CATEGORIES) => stats.categories.find((x) => x.category === c)!
  const rate = (c: keyof typeof CATEGORIES) => percent(cat(c).best, cat(c).attempts)
  const weakConcept = d.weakest_scenario_id ? scenarios.get(d.weakest_scenario_id)?.concept : null
  const onlyOne = stats.categories.filter((c) => c.attempts > 0).length === 1
  return (
    <div className="flex flex-col gap-2.5 leading-relaxed">
      {d.strongest &&
        (onlyOne ? (
          <p>
            Até agora <b>{name}</b> jogou só lances de <b>{CATEGORIES[d.strongest].name.toLowerCase()}</b>:{' '}
            {rate(d.strongest)}% de ótimas leituras.
          </p>
        ) : (
          <p>
            <b>{name}</b> lê melhor os lances de <b>{CATEGORIES[d.strongest].name.toLowerCase()}</b>:{' '}
            {rate(d.strongest)}% de ótimas leituras.
          </p>
        ))}
      {onlyOne ? null : d.weakest ? (
        <>
          <p>
            A maior dificuldade está na <b>{CATEGORIES[d.weakest].name.toLowerCase()}</b> ({rate(d.weakest)}%)
            {weakConcept && (
              <>
                , principalmente em <b>{weakConcept.toLowerCase()}</b>
              </>
            )}
            . Sugestão: repetir o treino de {CATEGORIES[d.weakest].name.toLowerCase()} esta semana.
          </p>
          <p className="text-sm text-muted">{CATEGORIES[d.weakest].tip}</p>
        </>
      ) : (
        <p>O desempenho está parecido entre as categorias jogadas.</p>
      )}
      {d.unplayed.length > 0 && (
        <p className="text-sm text-muted">
          Ainda sem lances de {d.unplayed.map((c) => CATEGORIES[c].name.toLowerCase()).join(' e ')}.
        </p>
      )}
      {stats.avg_decision_ms != null && (
        <p className="text-sm text-muted">
          Tempo médio de decisão: <span className="font-mono">{seconds(stats.avg_decision_ms)}</span>. Com a prática, esse
          número cai: é a leitura ficando automática.
        </p>
      )}
    </div>
  )
}

function CategoryBars({ stats }: { stats: Stats }) {
  return (
    <>
      <div className="flex flex-col gap-3.5">
        {stats.categories.map((c) => {
          const name = CATEGORIES[c.category].name
          return (
            <div key={c.category} className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[100px_minmax(0,1fr)_96px]">
              <span className="font-bold">{name}</span>
              <div
                className="flex h-5 gap-0.5 overflow-hidden rounded-md bg-line"
                role="img"
                aria-label={`${name}: ${c.best} ótimas, ${c.ok} para melhorar, ${c.bad} arriscadas ou sem tempo`}
              >
                {c.attempts > 0 && (
                  <>
                    <i className="block bg-good" style={{ width: `${percent(c.best, c.attempts)}%` }} />
                    <i className="block bg-ok" style={{ width: `${percent(c.ok, c.attempts)}%` }} />
                    <i className="block bg-bad" style={{ width: `${percent(c.bad, c.attempts)}%` }} />
                  </>
                )}
              </div>
              <span className="col-start-2 font-mono text-xs text-muted sm:col-start-auto sm:text-right">
                {c.attempts ? `${percent(c.best, c.attempts)}% · ${seconds(c.avg_decision_ms)}` : 'sem lances'}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(['best', 'ok', 'bad'] as const).map((g) => (
          <span key={g} className="flex items-center gap-1.5">
            <i className={`size-2.5 rounded-sm ${g === 'best' ? 'bg-good' : g === 'ok' ? 'bg-ok' : 'bg-bad'}`} />
            {g === 'bad' ? 'Arriscada ou sem tempo' : GRADES[g].label}
          </span>
        ))}
      </div>
    </>
  )
}

function PlayersCard({ players, active }: { players: Player[]; active: Player }) {
  const update = useUpdatePlayer()
  const remove = useDeletePlayer()
  const [editing, setEditing] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const save = (e: FormEvent, id: number) => {
    e.preventDefault()
    update.mutate({ id, name }, { onSuccess: () => setEditing(null) })
  }

  return (
    <Card title="Jogadores">
      <ul className="flex flex-col divide-y divide-line">
        {players.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5">
            {editing === p.id ? (
              <form onSubmit={(e) => save(e, p.id)} className="flex w-full flex-wrap items-end gap-2">
                <TextField
                  label="Nome"
                  className="min-w-40 flex-1"
                  required
                  maxLength={40}
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button type="submit" disabled={update.isPending}>
                  Salvar
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </form>
            ) : confirmDelete === p.id ? (
              <>
                <span className="flex-1 text-sm">
                  Apagar <b>{p.name}</b> e todo o histórico? Não dá para desfazer.
                </span>
                <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(p.id, { onSuccess: () => setConfirmDelete(null) })}>
                  Apagar
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 font-semibold">
                  {p.name}
                  {p.id === active.id && <span className="ml-2 text-xs font-normal text-muted">treinando agora</span>}
                </span>
                <Button
                  variant="ghost"
                  className="min-h-9 px-3 py-1 text-sm"
                  onClick={() => {
                    setEditing(p.id)
                    setName(p.name)
                  }}
                >
                  Renomear
                </Button>
                {players.length > 1 && (
                  <Button variant="ghost" className="min-h-9 px-3 py-1 text-sm" onClick={() => setConfirmDelete(p.id)}>
                    Apagar
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {(update.isError || remove.isError) && <ErrorNote error={update.error ?? remove.error} />}
      <Link to="/jogador/novo" className="mt-3 inline-flex min-h-11 items-center rounded-xl border-2 border-ink px-4 font-bold">
        Adicionar jogador
      </Link>
    </Card>
  )
}

function AccountCard({ player }: { player: Player }) {
  const { user, logout } = useAuth()
  const reset = useResetAttempts()
  const [confirm, setConfirm] = useState(false)
  return (
    <Card title="Conta e dados">
      <div className="flex flex-col gap-4 text-sm">
        {user && (
          <p>
            Conectado como <b>{user.name}</b> <span className="text-muted">({user.email})</span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {confirm ? (
            <>
              <span className="w-full">
                Apagar todos os lances e medalhas de <b>{player.name}</b>? Não dá para desfazer.
              </span>
              <Button
                variant="danger"
                disabled={reset.isPending}
                onClick={() => reset.mutate(player.id, { onSuccess: () => setConfirm(false) })}
              >
                Apagar histórico
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setConfirm(true)}>
              Apagar histórico de {player.name}
            </Button>
          )}
        </div>
        {reset.isError && <ErrorNote error={reset.error} />}
        <div>
          <Button variant="ghost" onClick={logout}>
            Sair da conta
          </Button>
        </div>
      </div>
    </Card>
  )
}
