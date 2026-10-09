import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import type { Player } from '../api/types'

const ACTIVE_KEY = 'craque.activePlayer'

interface PlayerValue {
  players: Player[]
  /** Jogador que está treinando agora. Null só quando a conta ainda não tem jogadores. */
  player: Player | null
  setActiveId: (id: number) => void
}

const PlayerContext = createContext<PlayerValue | null>(null)

function readActive(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    return raw ? Number(raw) : null
  } catch {
    return null
  }
}

export function PlayerProvider({ players, children }: { players: Player[]; children: ReactNode }) {
  const [activeId, setActive] = useState<number | null>(readActive)

  const setActiveId = useCallback((id: number) => {
    setActive(id)
    try {
      localStorage.setItem(ACTIVE_KEY, String(id))
    } catch {
      /* vale só nesta aba */
    }
  }, [])

  const player = players.find((p) => p.id === activeId) ?? players[0] ?? null
  const value = useMemo(() => ({ players, player, setActiveId }), [players, player, setActiveId])
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer(): PlayerValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer fora do PlayerProvider')
  return ctx
}

/** Para telas que só abrem com um jogador escolhido (o layout garante isso). */
export function useActivePlayer(): Player {
  const { player } = usePlayer()
  if (!player) throw new Error('Nenhum jogador ativo')
  return player
}
