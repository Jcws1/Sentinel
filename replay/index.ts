import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import {
  buildReplaySchedule,
  parseRecording,
  replayRegistration,
} from './replayAdapter'

const recordingPath = process.argv[2]
if (!recordingPath) {
  throw new Error('usage: npm run start:replay -- <recording.ndjson> [speed]')
}

const speed = Number(process.argv[3] ?? process.env.REPLAY_SPEED ?? 1)
const edgeGatewayUrl =
  process.env.EDGE_GATEWAY_URL?.trim() || 'http://127.0.0.1:8090'
const producerToken =
  process.env.EDGE_PRODUCER_TOKEN?.trim() || 'sentinel-dev-edge-token'
const options = {
  sourceId: process.env.REPLAY_SOURCE_ID?.trim() || 'sentinel-replay',
  instanceId: process.env.REPLAY_INSTANCE_ID?.trim() || randomUUID(),
  anchorTime: new Date(),
  speed,
}
const recording = parseRecording(await readFile(recordingPath, 'utf8'))
const schedule = buildReplaySchedule(recording, options)

async function post(pathname: string, body: unknown): Promise<Response> {
  return fetch(new URL(pathname, edgeGatewayUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-edge-token': producerToken,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  })
}

const registrationResponse = await post(
  '/v1/sources/register',
  replayRegistration(schedule, options),
)
if (!registrationResponse.ok) {
  throw new Error(
    `replay registration failed: ${await registrationResponse.text()}`,
  )
}

const startMs = Date.now()
for (const item of schedule) {
  const remainingMs = startMs + item.delayMs - Date.now()
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs))
  }
  const response = await post('/v1/observations', {
    observations: [item.observation],
  })
  if (!response.ok) {
    throw new Error(`replay publish failed: ${await response.text()}`)
  }
}

console.log(
  `Replayed ${schedule.length} observations at ${speed}x through ${edgeGatewayUrl}`,
)

