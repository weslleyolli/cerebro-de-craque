import '@fontsource/bowlby-one/400.css'
import '@fontsource-variable/lexend/index.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes } from 'react-router'

import { ApiError } from './api/client'
import { AuthProvider } from './auth/AuthProvider'
import { AppLayout } from './components/AppLayout'
import { LoginPage, RegisterPage } from './pages/AuthPages'
import { HomePage } from './pages/HomePage'
import { NewPlayerPage } from './pages/NewPlayerPage'
import { ParentsPage } from './pages/ParentsPage'
import { PlayPage } from './pages/PlayPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Erro de permissão ou de dado não melhora tentando de novo.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
})

function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 py-16">
      <h1 className="font-display text-3xl">Essa página não existe</h1>
      <Link to="/" className="font-semibold underline">
        Voltar ao início
      </Link>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/entrar" element={<LoginPage />} />
            <Route path="/criar-conta" element={<RegisterPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="jogador/novo" element={<NewPlayerPage />} />
              <Route path="treino/:mode" element={<PlayPage />} />
              <Route path="pais" element={<ParentsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
