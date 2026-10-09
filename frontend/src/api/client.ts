const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'craque.token'

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* navegação privada: a sessão vale só enquanto a aba estiver aberta */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* nada a limpar */
    }
  },
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let onUnauthorized: (() => void) | null = null

/** Chamado quando a API recusa o token (expirado ou inválido). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

const FIELD_MESSAGES: Record<string, string> = {
  email: 'Esse e-mail não parece válido.',
  password: 'A senha precisa ter pelo menos 8 caracteres.',
  name: 'Preencha o nome.',
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json()
    const detail = (data as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const loc: unknown[] = detail[0]?.loc ?? []
      const field = loc.find((p): p is string => typeof p === 'string' && p in FIELD_MESSAGES)
      return field ? FIELD_MESSAGES[field]! : 'Confira os dados preenchidos.'
    }
  } catch {
    /* resposta sem JSON */
  }
  return `O servidor respondeu com erro ${res.status}.`
}

export async function api<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(BASE_URL + path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Confira a internet e tente de novo.')
  }

  if (res.status === 401 && token) onUnauthorized?.()
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res))
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
