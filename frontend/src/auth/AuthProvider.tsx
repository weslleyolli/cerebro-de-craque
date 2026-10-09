import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api, setUnauthorizedHandler, tokenStore } from '../api/client'
import type { TokenResponse, User } from '../api/types'

type Status = 'loading' | 'authenticated' | 'anonymous'

interface AuthValue {
  user: User | null
  status: Status
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<Status>(() => (tokenStore.get() ? 'loading' : 'anonymous'))

  const logout = useCallback(() => {
    tokenStore.clear()
    qc.clear()
    setUser(null)
    setStatus('anonymous')
  }, [qc])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  useEffect(() => {
    if (!tokenStore.get()) return
    let alive = true
    api<User>('/api/auth/me')
      .then((u) => {
        if (!alive) return
        setUser(u)
        setStatus('authenticated')
      })
      .catch(() => {
        // Sem internet, a sessão continua; com token inválido, o handler já saiu.
        if (alive && tokenStore.get()) setStatus('authenticated')
      })
    return () => {
      alive = false
    }
  }, [])

  const accept = useCallback((res: TokenResponse) => {
    tokenStore.set(res.access_token)
    setUser(res.user)
    setStatus('authenticated')
  }, [])

  const login = useCallback(
    async (email: string, password: string) =>
      accept(await api<TokenResponse>('/api/auth/login', { method: 'POST', body: { email, password } })),
    [accept],
  )

  const register = useCallback(
    async (name: string, email: string, password: string) =>
      accept(
        await api<TokenResponse>('/api/auth/register', {
          method: 'POST',
          body: { name, email, password },
        }),
      ),
    [accept],
  )

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}
