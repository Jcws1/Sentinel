import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import type { IncomingMessage } from 'node:http'

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 100_000) reject(new Error('Request body is too large'))
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch {
        reject(new Error('Request body must be valid JSON'))
      }
    })
    request.on('error', reject)
  })
}

function assistantApi(apiKey: string, model: string): Plugin {
  return {
    name: 'sentinel-assistant-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/assistant/recommendations', async (request, response) => {
        response.setHeader('Content-Type', 'application/json')
        if (request.method !== 'POST') {
          response.statusCode = 405
          response.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        if (!apiKey) {
          response.statusCode = 503
          response.end(JSON.stringify({ error: 'Assistant API key is not configured' }))
          return
        }

        try {
          const payload = await readJsonBody(request) as { question?: unknown; state?: unknown }
          const question = typeof payload.question === 'string' ? payload.question.trim().slice(0, 2_000) : ''
          if (!question) throw new Error('A question is required')

          const upstream = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              store: false,
              reasoning: { effort: 'low' },
              instructions: [
                'You are Sentinel Training Assistant. Analyse only the supplied training-state snapshot.',
                'Return exactly three defensive, non-kinetic tasking recommendations whose allocationPct values total 100.',
                'Use the doctrine categories surveillance, coordinated screening, counter-UAS protection, and reposition/reserve as appropriate.',
                'Never provide targeting, weapons-employment, evasion, or real-world attack guidance. Never claim an action was executed.',
                'Treat unavailable/no-link assets as unavailable. Cite concrete state evidence and make uncertainty explicit.',
                'Keep each action, rationale, evidence item, and constraint concise so the result fits comfortably in the response budget.',
              ].join(' '),
              input: JSON.stringify({ operatorQuestion: question, trainingState: payload.state }),
              text: {
                format: {
                  type: 'json_schema',
                  name: 'defensive_tasking_recommendations',
                  strict: true,
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      summary: { type: 'string' },
                      recommendations: {
                        type: 'array',
                        minItems: 3,
                        maxItems: 3,
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          properties: {
                            category: { type: 'string', enum: ['surveillance', 'coordinated-screening', 'counter-uas', 'reposition-reserve'] },
                            title: { type: 'string' },
                            allocationPct: { type: 'integer', minimum: 0, maximum: 100 },
                            action: { type: 'string' },
                            rationale: { type: 'string' },
                            evidence: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
                            constraint: { type: 'string' },
                            priorityTrackIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
                          },
                          required: ['category', 'title', 'allocationPct', 'action', 'rationale', 'evidence', 'constraint', 'priorityTrackIds'],
                        },
                      },
                    },
                    required: ['summary', 'recommendations'],
                  },
                },
              },
              max_output_tokens: 2_400,
            }),
            signal: AbortSignal.timeout(30_000),
          })
          const result = await upstream.json() as {
            error?: { message?: string }
            output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
          }
          if (!upstream.ok) throw new Error(result.error?.message || `OpenAI returned HTTP ${upstream.status}`)
          const outputText = result.output
            ?.flatMap((item) => item.content ?? [])
            .find((item) => item.type === 'output_text')?.text
          if (!outputText) throw new Error('Assistant returned no structured output')
          const parsed = JSON.parse(outputText) as { recommendations?: Array<{ allocationPct?: number }> }
          if (parsed.recommendations?.length !== 3 || parsed.recommendations.reduce((sum, item) => sum + (item.allocationPct ?? 0), 0) !== 100) {
            throw new Error('Assistant allocation failed validation')
          }
          response.statusCode = 200
          response.end(JSON.stringify(parsed))
        } catch (error) {
          response.statusCode = 502
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Assistant request failed' }))
        }
      })
    },
  }
}

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
  plugins: [react(), tailwindcss(), assistantApi(env.OPENAI_API_KEY, env.OPENAI_MODEL || 'gpt-5.5')],
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
