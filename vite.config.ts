import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// BASE_PATH används vid publicering i en undermapp (t.ex. GitHub Pages: /vinterkonferens/)
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  // Egen cache per utvecklingsserver när flera körs samtidigt (tester)
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  plugins: [react(), tailwindcss()],
})
