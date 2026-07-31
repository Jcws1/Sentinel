import { createSensorSimulatorServer } from './server'
import { SensorSimulator } from './simulator'

const port = Number(process.env.SENSOR_SIM_PORT ?? 8091)
const host = process.env.SENSOR_SIM_HOST?.trim() || '0.0.0.0'
const edgeGatewayUrl =
  process.env.EDGE_GATEWAY_URL?.trim() || 'http://127.0.0.1:8090'
const gazeboGatewayUrl =
  process.env.SIM_GATEWAY_URL?.trim() || 'http://127.0.0.1:8080'
const producerToken =
  process.env.EDGE_PRODUCER_TOKEN?.trim() || 'sentinel-dev-edge-token'
const scenarioSeed = process.env.SENSOR_SIM_SEED?.trim() || 'sentinel-demo-v1'

const simulator = new SensorSimulator({
  edgeGatewayUrl,
  gazeboGatewayUrl,
  producerToken,
  scenarioSeed,
  bootstrapSensors: process.env.SENSOR_SIM_BOOTSTRAP !== '0',
})
const service = createSensorSimulatorServer(simulator)

service.server.listen(port, host, () => {
  console.log(`Sentinel sensor simulator listening on http://${host}:${port}`)
  console.log(`Edge gateway: ${edgeGatewayUrl}`)
  console.log(`Private Gazebo truth source: ${gazeboGatewayUrl}`)
})

void simulator.start()

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await service.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
