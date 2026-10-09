import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'

import { useAuth } from '../auth/AuthProvider'
import { BrandMark, Button, ErrorNote, TextField } from '../components/ui'

function AuthShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3 font-display text-xl">
        <BrandMark size={36} />
        Cérebro de Craque
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight">{title}</h1>
        <p className="text-muted">{intro}</p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5">{children}</div>
    </div>
  )
}

function useSubmit(action: () => Promise<void>) {
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }
  return { submit, error, busy }
}

export function LoginPage() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { submit, error, busy } = useSubmit(async () => {
    await login(email, password)
    navigate(from, { replace: true })
  })

  if (status === 'authenticated') return <Navigate to="/" replace />

  return (
    <AuthShell
      title="Entrar"
      intro="Use a conta do responsável. Depois é só escolher quem vai treinar."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <ErrorNote error={error} /> : null}
        <Button type="submit" variant="accent" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
        <p className="text-center text-sm text-muted">
          Primeira vez?{' '}
          <Link to="/criar-conta" className="font-semibold text-ink underline">
            Criar conta
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { status, register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { submit, error, busy } = useSubmit(async () => {
    await register(name, email, password)
    navigate('/jogador/novo', { replace: true })
  })

  if (status === 'authenticated') return <Navigate to="/" replace />

  return (
    <AuthShell
      title="Criar conta"
      intro="A conta é do pai, da mãe ou do treinador. As crianças treinam nos perfis que você criar."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Seu nome"
          autoComplete="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="Pelo menos 8 caracteres."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <ErrorNote error={error} /> : null}
        <Button type="submit" variant="accent" disabled={busy}>
          {busy ? 'Criando…' : 'Criar conta'}
        </Button>
        <p className="text-center text-sm text-muted">
          Já tem conta?{' '}
          <Link to="/entrar" className="font-semibold text-ink underline">
            Entrar
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
