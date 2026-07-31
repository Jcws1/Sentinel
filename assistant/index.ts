import { createServer } from 'node:http'
import { loadEnvFile } from '../server/loadEnv'
import { ReadOnlyC2Client } from './c2Client'
import { createLocalModelClient } from './modelClient'
import { AssistantOrchestrator } from './orchestrator'
import { createAssistantApp } from './server'
import { AssistantStore } from './store'

loadEnvFile('.env.local')
loadEnvFile('.env')

const host = process.env.SENTINEL_ASSISTANT_HOST?.trim() || '127.0.0.1'
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error('SENTINEL_ASSISTANT_HOST must be loopback-only')
}

const port = Number(process.env.SENTINEL_ASSISTANT_PORT ?? 3002)
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('SENTINEL_ASSISTANT_PORT must be a valid TCP port')
}

const c2 = new ReadOnlyC2Client(
  process.env.SENTINEL_C2_BASE_URL?.trim() || 'http://127.0.0.1:3001',
)
const model = createLocalModelClient({
  provider: process.env.SENTINEL_LLM_PROVIDER,
  modelId: process.env.SENTINEL_LLM_MODEL,
  baseUrl: process.env.SENTINEL_LLM_BASE_URL,
})
const store = new AssistantStore()
const orchestrator = new AssistantOrchestrator(c2, model, store)
const server = createServer(createAssistantApp(orchestrator))

server.listen(port, host, () => {
  console.log(
    `[assistant] loopback service http://${host}:${port}; model=${model.modelId}; c2=${c2.baseUrl.origin}`,
  )
})

function shutdown() {
  server.close(() => {
    store.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
