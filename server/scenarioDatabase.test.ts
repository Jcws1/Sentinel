import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createScenarioDatabase } from './scenarioDatabase'

test('saved scenarios persist, activate, and reopen from portable SQLite', () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'sentinel-scenarios-'))
  const previousDataDirectory = process.env.SENTINEL_DATA_DIR
  process.env.SENTINEL_DATA_DIR = dataDirectory
  try {
    const first = createScenarioDatabase()
    const saved = first.saveScenario({
      name: 'Waterfront denied navigation',
      origin: { latDeg: 1.3521, lngDeg: 103.8198, elevationM: 15 },
      groups: [{ id: 'north', name: 'North staging', color: '#68a0ff' }],
      vehicles: [
        {
          vehicleId: 'scout_02',
          platformId: 'generic_fpv_interceptor',
          role: 'Scout',
          groupId: 'north',
          pose: [10, 20, 3, 0, 0, 0],
        },
      ],
      missions: [
        {
          id: 'recon-1',
          type: 'recon_area',
          priority: 80,
          target: { center: [10, 20], radiusM: 100 },
          requiredCapabilities: ['camera'],
          minVehicles: 1,
          maxVehicles: 2,
        },
      ],
    })
    first.activateScenario(saved.id)
    first.checkpoint()
    first.close()

    const reopened = createScenarioDatabase()
    const scenarios = reopened.listScenarios()
    assert.equal(scenarios.length, 1)
    assert.equal(scenarios[0].active, true)
    assert.equal(scenarios[0].vehicles[0].vehicleId, 'scout_02')
    assert.equal(scenarios[0].missions[0].type, 'recon_area')
    assert.equal(reopened.deleteScenario(saved.id), true)
    reopened.close()
  } finally {
    if (previousDataDirectory === undefined) delete process.env.SENTINEL_DATA_DIR
    else process.env.SENTINEL_DATA_DIR = previousDataDirectory
    rmSync(dataDirectory, { recursive: true, force: true })
  }
})
