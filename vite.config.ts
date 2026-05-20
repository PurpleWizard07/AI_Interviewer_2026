import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  // Kokoro.js uses SharedArrayBuffer + WASM workers internally.
  // These two headers are required to enable SharedArrayBuffer in the browser.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  // Don't try to pre-bundle kokoro-js — it uses dynamic WASM loading that
  // Vite's pre-bundler can't handle. Dynamic import() in useTTS handles this.
  optimizeDeps: {
    exclude: ['kokoro-js'],
  },
})
