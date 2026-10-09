import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import type { AttemptResult, Player, PlayerSettings, Scenario, Stats } from './types'

export const keys = {
  scenarios: ['scenarios'] as const,
  players: ['players'] as const,
  stats: (playerId: number) => ['stats', playerId] as const,
}

export function useScenarios() {
  return useQuery({
    queryKey: keys.scenarios,
    queryFn: () => api<Scenario[]>('/api/scenarios'),
    staleTime: 60 * 60 * 1000,
  })
}

export function usePlayers(enabled = true) {
  return useQuery({
    queryKey: keys.players,
    queryFn: () => api<Player[]>('/api/players'),
    enabled,
  })
}

export function useStats(playerId: number | undefined) {
  return useQuery({
    queryKey: keys.stats(playerId ?? -1),
    queryFn: () => api<Stats>(`/api/players/${playerId}/stats`),
    enabled: playerId !== undefined,
  })
}

export function useCreatePlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string }) =>
      api<Player>('/api/players', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.players }),
  })
}

export function useUpdatePlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; settings?: PlayerSettings }) =>
      api<Player>(`/api/players/${id}`, { method: 'PATCH', body }),
    // Ajustes mudam na hora na tela; se a API falhar, a lista volta ao que era.
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: keys.players })
      const previous = qc.getQueryData<Player[]>(keys.players)
      qc.setQueryData<Player[]>(keys.players, (list) =>
        list?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(keys.players, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.players }),
  })
}

export function useDeletePlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/players/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: keys.stats(id) })
      return qc.invalidateQueries({ queryKey: keys.players })
    },
  })
}

export function useRecordAttempt(playerId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { scenario_id: string; option_index: number | null; decision_ms: number }) =>
      api<AttemptResult>(`/api/players/${playerId}/attempts`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.stats(playerId) }),
  })
}

export function useResetAttempts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (playerId: number) =>
      api<void>(`/api/players/${playerId}/attempts`, { method: 'DELETE' }),
    onSuccess: (_d, playerId) => qc.invalidateQueries({ queryKey: keys.stats(playerId) }),
  })
}
