import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiBase = process.env.VITE_API_BASE?.replace(/\/+$/, '') || 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    proxy: {
      '/extract-bill': {
        target: apiBase,
        changeOrigin: true,
        secure: apiBase.startsWith('https://'),
      },
      '/api': {
        target: apiBase,
        changeOrigin: true,
        secure: apiBase.startsWith('https://'),
      },
    },
  },
})
