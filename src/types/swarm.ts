import type { LngLat } from '@/lib/geo'

/* ===========================================================================
   SWARM ENTITIES

   The airframe and the aircraft are separate types on purpose.

   A `Platform` is the type certificate: numbers that are true of every Sting
   ever built and never change in flight. A `Drone` is one tail number: what
   this aircraft is doing right now. Folding the two together looks tidier
   with a single-type fleet, but the moment a second airframe arrives every
   fixture row carries a duplicated copy of its spec sheet, and the copies
   disagree within a week.

   This lives in src/types rather than beside the panel because three things
   will read it: the panel does today, the deck.gl entity layer and the
   selection store will.
=========================================================================== */

/**
 * Airframe specification. Static; sourced from the manufacturer.
 *
 * Every speed, altitude and range is SI at the boundary — metres and
 * metres per second — and converted only at the point of display. Mixing
 * km/h into the model is how a climb rate in m/s ends up compared against a
 * cruise speed in km/h.
 */
export interface Platform {
  id: string
  /** Type name as the manufacturer writes it. */
  name: string
  manufacturer: string
  /** One line on what the airframe is for. */
  role: string

  /** Cruise band, [low, high] m/s. Published as a range, kept as one. */
  cruiseSpeedMs: readonly [number, number]
  maxSpeedMs: number
  climbRateMs: number

  /** Normal operating ceiling. */
  serviceCeilingM: number
  /** Absolute ceiling — above the operating band, not a target. */
  maxCeilingM: number

  /** One-way range at cruise. */
  maxRangeM: number
  /** Radius that still leaves fuel to come home. The number that bounds tasking. */
  combatRadiusM: number

  /** Endurance at cruise, seconds. */
  enduranceCruiseS: number
  /** Endurance at max speed, seconds. Roughly a third of cruise. */
  enduranceDashS: number

  payloadG: number
  mtowKg: number

  battery: string
  /** Control link, e.g. ELRS. */
  controlLink: string
  /** Video downlink types the airframe supports. */
  videoLink: string
}

/**
 * Camera fit. The one meaningful per-aircraft variant on a single-type fleet:
 * a thermal ship is the one you send at night, and the operator has to be able
 * to tell which is which before tasking it.
 */
export type CameraFit =
  | 'digital-day'
  | 'digital-thermal'
  | 'analog-day'
  | 'analog-thermal'

/**
 * What the aircraft is doing. Ordered roughly by how far along a sortie it is.
 *
 * `offline` is link loss, not destruction — the console cannot tell the two
 * apart, and claiming it can would be a lie told in three characters.
 */
export type DroneState =
  | 'ready'
  | 'transit'
  | 'orbit'
  | 'engaged'
  | 'rtb'
  | 'offline'

export interface Drone {
  /** Stable key. Never shown. */
  id: string
  /** The tile glyph. Two or three characters, no more — it is drawn at 11px. */
  designation: string
  /** What the operator says on the net. */
  callsign: string
  /** Into PLATFORMS. */
  platformId: string
  camera: CameraFit

  state: DroneState
  /** 0..1. A fraction, not a percentage — formatted once, at the readout. */
  battery: number
  /** 0..1. Link margin, not signal strength. */
  linkQuality: number

  altitudeM: number
  speedMs: number
  /** Degrees true, 0..360. */
  headingDeg: number
  /** Flight time remaining at the current profile, seconds. */
  enduranceS: number

  position: LngLat
  /** Null when unassigned. Unassigned is a normal state, not a fault. */
  taskId: string | null
}

/* --- display tables ------------------------------------------------------ */

/** Full words, for the detail body where there is room to be unambiguous. */
export const STATE_LABEL: Record<DroneState, string> = {
  ready: 'Ready',
  transit: 'In transit',
  orbit: 'On station',
  engaged: 'Engaged',
  rtb: 'Returning',
  offline: 'Link lost',
}

/**
 * Three characters, for the tile. Fixed width so twelve tiles read as a
 * column of codes rather than a ragged list of words.
 */
export const STATE_CODE: Record<DroneState, string> = {
  ready: 'RDY',
  transit: 'TRN',
  orbit: 'STN',
  engaged: 'ENG',
  rtb: 'RTB',
  offline: 'OFF',
}

export const CAMERA_LABEL: Record<CameraFit, string> = {
  'digital-day': 'Digital daytime',
  'digital-thermal': 'Digital thermal',
  'analog-day': 'Analog daytime',
  'analog-thermal': 'Analog thermal',
}

/** Short form for dense rows. */
export const CAMERA_CODE: Record<CameraFit, string> = {
  'digital-day': 'DGT DAY',
  'digital-thermal': 'DGT IR',
  'analog-day': 'ANA DAY',
  'analog-thermal': 'ANA IR',
}
