import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const remoteApiBase = process.env.VITE_API_BASE?.replace(/\/+$/, '') || 'https://splito-3ghi.onrender.com'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    proxy: {
      '/extract-bill': {
        target: remoteApiBase,
        changeOrigin: true,
        secure: true,
      },
      '/api': {
        target: remoteApiBase,
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
