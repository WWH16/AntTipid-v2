import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // FastAPI runs on :8000 (backend/README.md). Same-origin /api means no CORS and phones on the LAN reach it too.
  server: { proxy: { '/api': 'http://localhost:8000' } },
  // dist/asset-manifest.json lists every built file, so the service worker can precache the whole app for offline use.
  build: { manifest: 'asset-manifest.json' },
})
