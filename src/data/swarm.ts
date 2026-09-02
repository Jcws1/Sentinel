import type { Drone } from '@/types/swarm'

/* ===========================================================================
   SWARM FIXTURE — deleted when telemetry lands.

   Twelve Stings in three elements of four, positioned around HOME_CAMERA so
   the coordinates are plausible for the default view. Values are frozen;
   there is no ticker. This session is the panel, not the feed.

   The mix is chosen to exercise the treatments rather than to look tidy:
   one aircraft with a lost link, one at 14% on the way home, three cold on
   the pad, and a pair engaged at dash speed with the endurance that implies.
   A fixture where every row is nominal proves only that the happy path
   renders.

   Battery and endurance are kept consistent with each other — roughly
   `battery * 900 s` at cruise, and far less for the two dashing. Both are on
   screen at once, and a panel that contradicts itself is worse than one that
   shows nothing.
=========================================================================== */

export const SWARM: readonly Drone[] = [
  {
    id: 'sting-v1',
    designation: 'V1',
    callsign: 'VESPA 1',
    platformId: 'sting',
    camera: 'digital-day',
    state: 'engaged',
    battery: 0.42,
    linkQuality: 0.88,
    altitudeM: 620,
    speedMs: 74.0,
    headingDeg: 47,
    enduranceS: 150,
    position: [103.9012, 1.4104],
    taskId: 'TSK-118',
  },
  {
    id: 'sting-v2',
    designation: 'V2',
    callsign: 'VESPA 2',
    platformId: 'sting',
    camera: 'digital-day',
    state: 'engaged',
    battery: 0.38,
    linkQuality: 0.81,
    altitudeM: 585,
    speedMs: 71.2,
    headingDeg: 51,
    enduranceS: 132,
    position: [103.8967, 1.4061],
    taskId: 'TSK-118',
  },
  {
    id: 'sting-v3',
    designation: 'V3',
    callsign: 'VESPA 3',
    platformId: 'sting',
    camera: 'digital-thermal',
    state: 'transit',
    battery: 0.66,
    linkQuality: 0.94,
    altitudeM: 940,
    speedMs: 45.0,
    headingDeg: 88,
    enduranceS: 520,
    position: [103.874, 1.3892],
    taskId: 'TSK-118',
  },
  {
    id: 'sting-v4',
    designation: 'V4',
    callsign: 'VESPA 4',
    platformId: 'sting',
    camera: 'digital-day',
    state: 'rtb',
    battery: 0.14,
    linkQuality: 0.72,
    altitudeM: 310,
    speedMs: 41.7,
    headingDeg: 232,
    enduranceS: 96,
    position: [103.8455, 1.3702],
    taskId: null,
  },
  {
    id: 'sting-w1',
    designation: 'W1',
    callsign: 'WASP 1',
    platformId: 'sting',
    camera: 'digital-thermal',
    state: 'orbit',
    battery: 0.71,
    linkQuality: 0.96,
    altitudeM: 1200,
    speedMs: 39.4,
    headingDeg: 15,
    enduranceS: 604,
    position: [103.7412, 1.4188],
    taskId: 'TSK-121',
  },
  {
    id: 'sting-w2',
    designation: 'W2',
    callsign: 'WASP 2',
    platformId: 'sting',
    camera: 'digital-thermal',
    state: 'orbit',
    battery: 0.68,
    linkQuality: 0.91,
    altitudeM: 1180,
    speedMs: 39.1,
    headingDeg: 195,
    enduranceS: 571,
    position: [103.7466, 1.4142],
    taskId: 'TSK-121',
  },
  {
    id: 'sting-w3',
    designation: 'W3',
    callsign: 'WASP 3',
    platformId: 'sting',
    camera: 'analog-day',
    state: 'ready',
    battery: 1,
    linkQuality: 0.99,
    altitudeM: 0,
    speedMs: 0,
    headingDeg: 0,
    enduranceS: 900,
    position: [103.8196, 1.3519],
    taskId: null,
  },
  {
    id: 'sting-w4',
    designation: 'W4',
    callsign: 'WASP 4',
    platformId: 'sting',
    camera: 'analog-thermal',
    state: 'ready',
    battery: 0.98,
    linkQuality: 0.99,
    altitudeM: 0,
    speedMs: 0,
    headingDeg: 0,
    enduranceS: 882,
    position: [103.8199, 1.3519],
    taskId: null,
  },
  {
    id: 'sting-d1',
    designation: 'D1',
    callsign: 'DART 1',
    platformId: 'sting',
    camera: 'digital-day',
    state: 'transit',
    battery: 0.83,
    linkQuality: 0.9,
    altitudeM: 1450,
    speedMs: 46.8,
    headingDeg: 305,
    enduranceS: 690,
    position: [103.7605, 1.2884],
    taskId: 'TSK-124',
  },
  {
    // Link lost mid-transit. Every value below is last-known, which the
    // detail body says out loud rather than presenting them as current.
    id: 'sting-d2',
    designation: 'D2',
    callsign: 'DART 2',
    platformId: 'sting',
    camera: 'digital-day',
    state: 'offline',
    battery: 0.55,
    linkQuality: 0,
    altitudeM: 870,
    speedMs: 44.2,
    headingDeg: 118,
    enduranceS: 430,
    position: [103.7208, 1.261],
    taskId: 'TSK-124',
  },
  {
    id: 'sting-d3',
    designation: 'D3',
    callsign: 'DART 3',
    platformId: 'sting',
    camera: 'analog-day',
    state: 'ready',
    battery: 0.94,
    linkQuality: 0.98,
    altitudeM: 0,
    speedMs: 0,
    headingDeg: 0,
    enduranceS: 846,
    position: [103.8202, 1.3519],
    taskId: null,
  },
  {
    id: 'sting-d4',
    designation: 'D4',
    callsign: 'DART 4',
    platformId: 'sting',
    camera: 'analog-thermal',
    state: 'rtb',
    battery: 0.21,
    linkQuality: 0.85,
    altitudeM: 420,
    speedMs: 42,
    headingDeg: 268,
    enduranceS: 148,
    position: [103.8802, 1.311],
    taskId: null,
  },
]

/**
 * Returns undefined for an unknown id rather than throwing.
 *
 * Unlike a platform id, a drone id can go stale in the ordinary course of
 * things: an aircraft is lost or recovered while its detail panel is open.
 * That is a state to render, not a crash.
 */
export function getDrone(id: string): Drone | undefined {
  return SWARM.find((d) => d.id === id)
}
