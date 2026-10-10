/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// No Netlify o app e a API ficam em endereços diferentes: sem VITE_API_URL o app
// publicado não acharia a API. Melhor o build falhar com uma mensagem clara.
if (process.env.NETLIFY === 'true' && !process.env.VITE_API_URL) {
  throw new Error(
    'Defina VITE_API_URL no Netlify (Site configuration > Environment variables) com o endereço da API no Render, ex.: https://cerebro-de-craque-api.onrender.com',
  )
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Cérebro de Craque',
        short_name: 'Craque',
        description: 'Treino de leitura de jogo no futsal para crianças.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1d6f80',
        background_color: '#edf2f1',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Jogadas sempre da rede; a cópia salva só entra sem conexão, para o
            // app não mostrar uma nota diferente da que o servidor grava.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/scenarios'),
            handler: 'NetworkFirst',
            options: { cacheName: 'jogadas', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
