import http from 'node:http'
import express from 'express'
import cors from 'cors'
import type { CreateSensorRequest, EdgeSensor } from '../contracts/edgeTypes'
import { SensorSimulator } from './simulator'

export function createSensorSimulatorServer(simulator: SensorSimulator) {
  const app = express()
  const server = http.createServer(app)
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  app.get('/v1/health', (_req, res) => {
    res.json({
      ok: true,
      sourceId: simulator.sourceId,
      instanceId: simulator.instanceId,
      sensors: simulator.listSensors().length,
    })
  })

  app.get('/v1/sensor-types', (_req, res) => {
    res.json({ sensorTypes: simulator.sensorTypes })
  })

  app.get('/v1/sensors', (_req, res) => {
    res.json({ sensors: simulator.listSensors() })
  })

  app.post('/v1/sensors', async (req, res) => {
    try {
      res
        .status(201)
        .json(
          await simulator.createAndSyncSensor(
            req.body as CreateSensorRequest,
          ),
        )
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : 'sensor creation failed',
      })
    }
  })

  app.patch('/v1/sensors/:sensorId', async (req, res) => {
    try {
      res.json(
        await simulator.updateAndSyncSensor(
          req.params.sensorId,
          req.body as Partial<EdgeSensor>,
        ),
      )
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : 'sensor update failed',
      })
    }
  })

  app.delete('/v1/sensors/:sensorId', async (req, res) => {
    try {
      res.json(await simulator.removeAndSyncSensor(req.params.sensorId))
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : 'sensor removal failed',
      })
    }
  })

  async function close(): Promise<void> {
    simulator.stop()
    if (server.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  }

  return { app, server, close }
}
