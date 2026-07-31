import { createEdgeGateway } from './server'

const port = Number(process.env.EDGE_GATEWAY_PORT ?? 8090)
const host = process.env.EDGE_GATEWAY_HOST?.trim() || '0.0.0.0'
const upstreamSimulatorUrl =
  process.env.SIM_GATEWAY_URL?.trim() || 'http://127.0.0.1:8080'
const sensorSimulatorUrl =
  process.env.SENSOR_SIM_URL?.trim() || 'http://127.0.0.1:8091'
const producerToken =
  process.env.EDGE_PRODUCER_TOKEN?.trim() || 'sentinel-dev-edge-token'

const gateway = createEdgeGateway({
  upstreamSimulatorUrl,
  sensorSimulatorUrl,
  producerToken,
})

gateway.server.listen(port, host, () => {
  console.log(`Sentinel edge gateway listening on http://${host}:${port}`)
  console.log(`Gazebo adapter: ${upstreamSimulatorUrl}`)
  console.log(`Sensor simulator: ${sensorSimulatorUrl}`)
})

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await gateway.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
