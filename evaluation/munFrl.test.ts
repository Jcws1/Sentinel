import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMunFrlFlightLogCsv, parseMunFrlPpk } from './munFrl'

test('MUN-FRL PPK parser converts GPST to UTC and preserves quality', () => {
  const parsed = parseMunFrlPpk(`% ref pos   : 47.0  -53.0  30.0
2022/02/22 19:11:54.800 47.1 -53.1 31.0 1 22 0.0025 0.0023 0.0053 0 0 0 0.0 5.8`)
  assert.equal(parsed.origin.heightM, 30)
  assert.equal(parsed.samples[0]?.timestampNs, '1645557096800000000')
  assert.equal(parsed.samples[0]?.solutionQuality, 1)
  assert.equal(parsed.samples[0]?.satellites, 22)
})

test('MUN-FRL flight-log parser converts feet to metres', () => {
  const parsed = parseMunFrlFlightLogCsv(`elapsed_ms,datetime_utc,latitude_deg,longitude_deg,relative_height_ft,preview_page,satellites,gps_level,state_raw,state
100,2022-02-22T19:12:30Z,47.1,-53.1,10,1,12,0,6,P-GPS`)
  assert.equal(parsed[0]?.relativeHeightM, 3.048)
  assert.equal(parsed[0]?.flightState, 'P-GPS')
})
