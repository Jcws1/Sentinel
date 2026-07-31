import assert from 'node:assert/strict'
import test from 'node:test'
import {
  enuToLngLat,
  lngLatToEnu,
  type SimOrigin,
} from '../src/utils/sensorCoordinates'

const singaporeOrigin: SimOrigin = {
  latDeg: 1.3521,
  lngDeg: 103.8198,
  elevationM: 15,
}

test('map placement coordinates round-trip through local ENU', () => {
  const expected = { eastM: 1_842.5, northM: -913.25 }
  const [lng, lat] = enuToLngLat(
    expected.eastM,
    expected.northM,
    singaporeOrigin,
  )
  const actual = lngLatToEnu(lng, lat, singaporeOrigin)
  assert(Math.abs(actual.eastM - expected.eastM) < 0.001)
  assert(Math.abs(actual.northM - expected.northM) < 0.001)
})

test('ENU north and east map to the expected geographic axes', () => {
  const [eastLng, eastLat] = enuToLngLat(100, 0, singaporeOrigin)
  const [northLng, northLat] = enuToLngLat(0, 100, singaporeOrigin)
  assert(eastLng > singaporeOrigin.lngDeg)
  assert.equal(eastLat, singaporeOrigin.latDeg)
  assert.equal(northLng, singaporeOrigin.lngDeg)
  assert(northLat > singaporeOrigin.latDeg)
})
