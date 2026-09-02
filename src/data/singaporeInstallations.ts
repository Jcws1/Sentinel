/**
 * Singapore military bases (air / land / sea) + PRD scenario anchors.
 * Open sources: Wikipedia, ICAO listings, OSM-derived centroids.
 * Footprints are approximate C2 envelopes — not survey-grade.
 */
import { circlePolygon } from '../utils/geo'

export type MilitaryDomain = 'air' | 'land' | 'sea'
export type InstallationKind =
  | 'military_airbase'
  | 'military_land'
  | 'military_naval'
  | 'prd_anchor'
  | 'gnss_constrained'

export interface InstallationProps {
  id: string
  name: string
  shortName: string
  kind: InstallationKind
  domain?: MilitaryDomain
  icao?: string
  iata?: string
  operator?: string
  prdScenario?: string
  source: string
}

type LngLat = [number, number]

function orientedEnvelope(
  lng: number,
  lat: number,
  lengthM: number,
  widthM: number,
  headingDeg: number,
): LngLat[] {
  const latRad = (lat * Math.PI) / 180
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos(latRad)
  const h = ((90 - headingDeg) * Math.PI) / 180
  const ux = Math.cos(h)
  const uy = Math.sin(h)
  const vx = -uy
  const vy = ux
  const hl = lengthM / 2
  const hw = widthM / 2
  const corners: Array<[number, number]> = [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
    [-hl, -hw],
  ]
  return corners.map(([along, across]) => {
    const east = along * ux + across * vx
    const north = along * uy + across * vy
    return [lng + east / mPerDegLng, lat + north / mPerDegLat]
  })
}

export type InstallationFeature = {
  type: 'Feature'
  properties: InstallationProps & { feature: 'footprint' | 'label' | 'runway' }
  geometry:
    | { type: 'Polygon'; coordinates: LngLat[][] }
    | { type: 'Point'; coordinates: LngLat }
    | { type: 'LineString'; coordinates: LngLat[] }
}

function site(
  props: InstallationProps,
  lng: number,
  lat: number,
  opts: {
    radiusM?: number
    runway?: { lengthM: number; widthM: number; headingDeg: number }
  },
) {
  const features: InstallationFeature[] = []
  const ring = opts.runway
    ? orientedEnvelope(lng, lat, opts.runway.lengthM, opts.runway.widthM, opts.runway.headingDeg)
    : circlePolygon(lng, lat, opts.radiusM ?? 900)

  features.push({
    type: 'Feature',
    properties: { ...props, feature: 'footprint' },
    geometry: { type: 'Polygon', coordinates: [ring] },
  })

  features.push({
    type: 'Feature',
    properties: { ...props, feature: 'label' },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  })

  if (opts.runway) {
    const latRad = (lat * Math.PI) / 180
    const mPerDegLat = 111_320
    const mPerDegLng = 111_320 * Math.cos(latRad)
    const h = ((90 - opts.runway.headingDeg) * Math.PI) / 180
    const hl = opts.runway.lengthM * 0.46
    const dx = (Math.cos(h) * hl) / mPerDegLng
    const dy = (Math.sin(h) * hl) / mPerDegLat
    features.push({
      type: 'Feature',
      properties: { ...props, feature: 'runway' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [lng - dx, lat - dy],
          [lng + dx, lat + dy],
        ],
      },
    })
  }

  return features
}

/** RSAF air bases — Wikipedia / ICAO open listings. */
const AIR_BASES: InstallationFeature[] = [
  ...site(
    {
      id: 'wsat-tengah',
      name: 'Tengah Air Base',
      shortName: 'TENGAH AB',
      kind: 'military_airbase',
      domain: 'air',
      icao: 'WSAT',
      iata: 'TGA',
      operator: 'RSAF',
      source: 'Wikipedia / ICAO WSAT',
    },
    103.70861,
    1.38722,
    { runway: { lengthM: 2743, widthM: 900, headingDeg: 10 } },
  ),
  ...site(
    {
      id: 'wsap-paya-lebar',
      name: 'Paya Lebar Air Base',
      shortName: 'PAYA LEBAR AB',
      kind: 'military_airbase',
      domain: 'air',
      icao: 'WSAP',
      iata: 'QPG',
      operator: 'RSAF',
      source: 'Wikipedia / ICAO WSAP',
    },
    103.90944,
    1.36028,
    { runway: { lengthM: 3780, widthM: 1000, headingDeg: 20 } },
  ),
  ...site(
    {
      id: 'wsag-sembawang',
      name: 'Sembawang Air Base',
      shortName: 'SEMBAWANG AB',
      kind: 'military_airbase',
      domain: 'air',
      icao: 'WSAG',
      operator: 'RSAF',
      source: 'Wikipedia / ICAO WSAG',
    },
    103.81278,
    1.42528,
    { runway: { lengthM: 1907, widthM: 700, headingDeg: 40 } },
  ),
  ...site(
    {
      id: 'wsac-changi-west',
      name: 'Changi Air Base (West)',
      shortName: 'CHANGI AB W',
      kind: 'military_airbase',
      domain: 'air',
      icao: 'WSAC',
      operator: 'RSAF',
      source: 'Wikipedia / ICAO WSAC',
    },
    103.98306,
    1.37611,
    { runway: { lengthM: 4000, widthM: 1100, headingDeg: 20 } },
  ),
  ...site(
    {
      id: 'changi-east',
      name: 'Changi Air Base (East)',
      shortName: 'CHANGI AB E',
      kind: 'military_airbase',
      domain: 'air',
      operator: 'RSAF',
      source: 'Wikipedia airport list',
    },
    104.00972,
    1.34556,
    { runway: { lengthM: 4000, widthM: 1100, headingDeg: 20 } },
  ),
]

/** RSN naval bases — OSM / open coastal facility approx. */
const SEA_BASES: InstallationFeature[] = [
  ...site(
    {
      id: 'changi-naval-base',
      name: 'Changi Naval Base',
      shortName: 'CHANGI NB',
      kind: 'military_naval',
      domain: 'sea',
      operator: 'RSN',
      source: 'OSM / open coastal facility approx',
    },
    104.026,
    1.318,
    { radiusM: 1400 },
  ),
  ...site(
    {
      id: 'tuas-naval-base',
      name: 'Tuas Naval Base',
      shortName: 'TUAS NB',
      kind: 'military_naval',
      domain: 'sea',
      operator: 'RSN',
      source: 'OSM / open coastal facility approx',
    },
    103.648,
    1.296,
    { radiusM: 1200 },
  ),
  ...site(
    {
      id: 'brani-naval',
      name: 'Pulau Brani (Naval)',
      shortName: 'BRANI',
      kind: 'military_naval',
      domain: 'sea',
      operator: 'RSN',
      source: 'OSM island / historic naval use approx',
    },
    103.833,
    1.26,
    { radiusM: 700 },
  ),
]

/** SAF land camps / training — open public location approx. */
const LAND_BASES: InstallationFeature[] = [
  ...site(
    {
      id: 'safti-mi',
      name: 'SAFTI Military Institute',
      shortName: 'SAFTI MI',
      kind: 'military_land',
      domain: 'land',
      operator: 'SAF',
      source: 'Open training-area / campus approx',
    },
    103.685,
    1.345,
    { radiusM: 1600 },
  ),
  ...site(
    {
      id: 'nee-soon-camp',
      name: 'Nee Soon Camp',
      shortName: 'NEE SOON',
      kind: 'military_land',
      domain: 'land',
      operator: 'SAF',
      source: 'OSM / open camp location approx',
    },
    103.825,
    1.418,
    { radiusM: 900 },
  ),
  ...site(
    {
      id: 'kranji-camp',
      name: 'Kranji Camp',
      shortName: 'KRANJI',
      kind: 'military_land',
      domain: 'land',
      operator: 'SAF',
      source: 'OSM / open camp location approx',
    },
    103.748,
    1.425,
    { radiusM: 800 },
  ),
  ...site(
    {
      id: 'bedok-camp',
      name: 'Bedok Camp',
      shortName: 'BEDOK',
      kind: 'military_land',
      domain: 'land',
      operator: 'SAF',
      source: 'OSM / open camp location approx',
    },
    103.935,
    1.324,
    { radiusM: 700 },
  ),
  ...site(
    {
      id: 'hendon-camp',
      name: 'Hendon Camp',
      shortName: 'HENDON',
      kind: 'military_land',
      domain: 'land',
      operator: 'SAF',
      source: 'OSM / open camp location approx',
    },
    103.972,
    1.372,
    { radiusM: 650 },
  ),
  ...site(
    {
      id: 'keat-hong-camp',
      name: 'Keat Hong Camp',
      shortName: 'KEAT HONG',
      kind: 'military_land',
      domain: 'land',
      operator: 'SAF',
      source: 'OSM / open camp location approx',
    },
    103.752,
    1.378,
    { radiusM: 750 },
  ),
]

/** Scenario areas and broad GNSS-constrained environments shown on the Scenarios tab only. */
const PRD_SCENARIO_ANCHORS: InstallationFeature[] = [
  ...site(
    {
      id: 'prd-changi-naval',
      name: 'Changi aviation sector',
      shortName: 'AIRSPACE INCURSION',
      kind: 'prd_anchor',
      prdScenario: '1-3 tracks',
      source: 'Sentinel scenario exercise · aviation sector',
    },
    104.026,
    1.318,
    { radiusM: 1800 },
  ),
  ...site(
    {
      id: 'prd-jurong-island',
      name: 'Jurong Island',
      shortName: 'INFRASTRUCTURE ALERT',
      kind: 'prd_anchor',
      prdScenario: '3-8 tracks',
      source: 'Sentinel scenario exercise · critical infrastructure',
    },
    103.705,
    1.27,
    { radiusM: 2200 },
  ),
  ...site(
    {
      id: 'prd-tengah-town',
      name: 'Tengah urban sector',
      shortName: 'URBAN BLIND SPOT',
      kind: 'prd_anchor',
      prdScenario: 'GNSS constrained',
      source: 'Sentinel scenario exercise · urban environment',
    },
    103.715,
    1.375,
    { radiusM: 2000 },
  ),
  ...site(
    {
      id: 'prd-pulau-ubin',
      name: 'Pulau Ubin',
      shortName: 'PERIMETER BREACH',
      kind: 'prd_anchor',
      prdScenario: '1-4 tracks',
      source: 'Sentinel scenario exercise · maritime perimeter',
    },
    103.96,
    1.409,
    { radiusM: 1600 },
  ),
  ...site(
    {
      id: 'prd-safti',
      name: 'SAFTI Live Firing Area',
      shortName: 'MULTI-WAVE SATURATION',
      kind: 'prd_anchor',
      prdScenario: '20-60 tracks',
      source: 'Sentinel scenario exercise · response sector',
    },
    103.685,
    1.345,
    { radiusM: 1800 },
  ),
  ...site(
    {
      id: 'prd-mandai',
      name: 'Mandai canopy corridor',
      shortName: 'GNSS RECOVERY',
      kind: 'prd_anchor',
      prdScenario: 'Fallback navigation',
      source: 'Sentinel scenario exercise · canopy environment',
    },
    103.78,
    1.405,
    { radiusM: 1400 },
  ),
]

/** General GNSS signal-constrained context, not verified interference or denial zones. */
const GNSS_CONSTRAINED_AREAS: InstallationFeature[] = [
  ...site(
    {
      id: 'gnss-cbd-urban-canyon',
      name: 'Dense urban environment',
      shortName: 'GNSS CONSTRAINED',
      kind: 'gnss_constrained',
      prdScenario: 'Urban canyon / indoor context',
      source: 'Sentinel context layer · broad environment classification',
    },
    103.852,
    1.292,
    { radiusM: 1600 },
  ),
  ...site(
    {
      id: 'gnss-mandai-canopy',
      name: 'Canopy environment',
      shortName: 'GNSS CONSTRAINED',
      kind: 'gnss_constrained',
      prdScenario: 'Canopy context',
      source: 'Sentinel context layer · broad environment classification',
    },
    103.78,
    1.405,
    { radiusM: 2100 },
  ),
]

export const MILITARY_BASES: {
  type: 'FeatureCollection'
  features: InstallationFeature[]
} = {
  type: 'FeatureCollection',
  features: [...AIR_BASES, ...SEA_BASES, ...LAND_BASES],
}

export const PRD_SCENARIOS: {
  type: 'FeatureCollection'
  features: InstallationFeature[]
} = {
  type: 'FeatureCollection',
  features: [...PRD_SCENARIO_ANCHORS, ...GNSS_CONSTRAINED_AREAS],
}

/** @deprecated use MILITARY_BASES or filter by map overlay tab */
export const SINGAPORE_INSTALLATIONS = MILITARY_BASES

export const INSTALLATIONS_ATTRIBUTION =
  'Bases: Wikipedia/ICAO/OSM open listings · Scenarios: Sentinel exercise and GNSS context layers'

export function installationsForTab(tab: 'bases' | 'scenarios') {
  return tab === 'scenarios' ? PRD_SCENARIOS : MILITARY_BASES
}
