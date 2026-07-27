import type { Express } from 'express'
import type { ScenarioDraft, ScenarioDatabase } from './scenarioDatabase'
import type { SavedScenario } from '../src/api/scenarioTypes'

export function registerScenarioRoutes(
  app: Express,
  database: ScenarioDatabase,
  onActivate?: (scenario: SavedScenario) => Promise<void>,
): void {
  app.get('/api/v1/scenarios', (_req, res) => {
    res.json({ scenarios: database.listScenarios() })
  })

  app.get('/api/v1/scenarios/:id', (req, res) => {
    const scenario = database.getScenario(req.params.id)
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found' })
      return
    }
    res.json(scenario)
  })

  app.post('/api/v1/scenarios', (req, res) => {
    try {
      res.status(201).json(database.saveScenario(req.body as ScenarioDraft))
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : 'Scenario save failed',
      })
    }
  })

  app.put('/api/v1/scenarios/:id', (req, res) => {
    try {
      res.json(
        database.saveScenario({
          ...(req.body as ScenarioDraft),
          id: req.params.id,
        }),
      )
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : 'Scenario save failed',
      })
    }
  })

  app.post('/api/v1/scenarios/:id/activate', async (req, res) => {
    try {
      const scenario = database.getScenario(req.params.id)
      if (!scenario) throw new Error(`Scenario ${req.params.id} not found`)
      if (onActivate) await onActivate(scenario)
      res.json(database.activateScenario(req.params.id))
    } catch (error) {
      res.status(409).json({
        error:
          error instanceof Error ? error.message : 'Scenario activation failed',
      })
    }
  })

  app.delete('/api/v1/scenarios/:id', (req, res) => {
    if (!database.deleteScenario(req.params.id)) {
      res.status(404).json({ error: 'Scenario not found' })
      return
    }
    res.status(204).end()
  })
}
