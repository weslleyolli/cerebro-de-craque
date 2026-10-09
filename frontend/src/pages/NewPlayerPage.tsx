import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { useCreatePlayer } from '../api/queries'
import { usePlayer } from '../auth/PlayerProvider'
import { Button, ErrorNote, TextField } from '../components/ui'

export function NewPlayerPage() {
  const { players, setActiveId } = usePlayer()
  const create = useCreatePlayer()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const first = players.length === 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate(
      { name },
      {
        onSuccess: (p) => {
          setActiveId(p.id)
          navigate('/', { replace: true })
        },
      },
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-6">
      <div className="flex flex-col gap-2">
        <div className="eyebrow">{first ? 'Primeiro passo' : 'Novo jogador'}</div>
        <h1 className="font-display text-3xl leading-tight">Quem vai treinar?</h1>
        <p className="text-muted">
          Cada criança tem o seu perfil, com pontos, medalhas e estatísticas separados.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
        <TextField
          label="Nome ou apelido"
          required
          maxLength={40}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {create.isError && <ErrorNote error={create.error} />}
        <Button type="submit" variant="accent" disabled={create.isPending || !name.trim()}>
          {create.isPending ? 'Salvando…' : 'Começar a treinar'}
        </Button>
        {!first && (
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
        )}
      </form>
    </div>
  )
}
