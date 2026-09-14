import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  // NOTE: vite-plugin-cesium is deliberately NOT used. It injects a blocking
  // <script src="/cesium/Cesium.js"> into index.html, which loads Cesium's
  // multi-MB runtime on EVERY page load — including the offline edge path
  // that must never touch it. Instead Cesium is imported normally inside
  // src/map/photorealCesium.ts, which is itself dynamically imported, so
  // Rollup code-splits it into a chunk fetched only when the photoreal pack
  // is selected. Its static runtime lives in public/cesium (see
  // src/map/cesiumBaseUrl.ts).
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 7000,
    // Fail loudly if 7000 is taken rather than silently sliding to 7001.
    // The Playwright MCP origin allowlist in .mcp.json is pinned to this
    // exact port, so a silent fallback would break browser access with a
    // misleading error rather than an obvious one.
    strictPort: true,
    host: true,
    proxy: {
      '/wedgetail-sandbox': {
        target: 'https://wedgetail-dynamics.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/wedgetail-sandbox/, '/sandbox'),
        headers: {
          // The default is Wedgetail's published, sandbox-only integration key.
          'X-API-Key': env.WEDGETAIL_SANDBOX_API_KEY || 'wgtl_sandbox_1a2b3c4d5e6f7g8h9i0j',
        },
      },
    },
  },
  build: {
    // Edge nodes may be bandwidth-constrained on update; split the heavy
    // geo stack out of the app shell so console changes ship a small diff.
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          deck: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/mapbox'],
        },
      },
    },
  },
  }
})
