import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router'

import { usePlayers } from '../api/queries'
import { useAuth } from '../auth/AuthProvider'
import { PlayerProvider } from '../auth/PlayerProvider'
import { BrandMark, ErrorNote, Loading } from './ui'

const NEW_PLAYER_PATH = '/jogador/novo'

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
    isActive ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink'
  }`
}

/** Área logada: cabeçalho, jogador ativo e redirecionamentos. */
export function AppLayout() {
  const { status } = useAuth()
  const location = useLocation()
  const players = usePlayers(status === 'authenticated')

  if (status === 'loading') return <Loading />
  if (status === 'anonymous') return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  if (players.isPending) return <Loading />
  if (players.isError)
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <ErrorNote error={players.error} onRetry={() => players.refetch()} />
      </div>
    )

  const list = players.data
  if (list.length === 0 && location.pathname !== NEW_PLAYER_PATH)
    return <Navigate to={NEW_PLAYER_PATH} replace />

  return (
    <PlayerProvider players={list}>
      <header className="sticky top-0 z-10 border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg" aria-label="Início">
            <BrandMark />
            <span className="hidden sm:inline">Cérebro de Craque</span>
          </Link>
          {list.length > 0 && (
            <nav className="flex gap-1.5" aria-label="Seções">
              <NavLink to="/" end className={navClass}>
                Treinar
              </NavLink>
              <NavLink to="/pais" className={navClass}>
                Área dos pais
              </NavLink>
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </PlayerProvider>
  )
}
