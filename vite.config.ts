import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Inline plugin: stamp the built sw.js with a unique BUILD_ID so the
// browser notices there's a new service worker to install on every
// deploy. Without this, sw.js is byte-identical across builds and the
// update pipeline silently breaks. The BUILD_ID also gets baked into
// the cache namespace in sw.js so old caches purge cleanly on activate.
//
// Runs in closeBundle (after Vite has copied public/sw.js to dist/sw.js)
// because public/ files bypass the normal asset pipeline — we can't use
// Vite's define() or transform hooks on them.
function stampServiceWorker(): Plugin {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const buildId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
      const swPath = resolve(process.cwd(), 'dist', 'sw.js')
      try {
        const contents = readFileSync(swPath, 'utf8')
        writeFileSync(swPath, contents.replace('__BUILD_ID__', buildId))
        // eslint-disable-next-line no-console
        console.log(`[stamp-service-worker] BUILD_ID=${buildId}`)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[stamp-service-worker] failed to stamp sw.js:', err)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stampServiceWorker()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'recharts'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'recharts'
          }
          if (id.includes('node_modules/@supabase')) {
            return 'supabase'
          }
        },
      },
    },
  },
})
