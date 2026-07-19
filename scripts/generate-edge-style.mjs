import { writeFile } from 'node:fs/promises'
import { layers, namedFlavor } from '@protomaps/basemaps'

const flavor = {
  ...namedFlavor('dark'),
  background: '#06070a',
  earth: '#090b0f',
  park_a: '#0b1010',
  park_b: '#0c1211',
  hospital: '#101013',
  industrial: '#0d0f12',
  school: '#101114',
  wood_a: '#0a0f0e',
  wood_b: '#0b100f',
  pedestrian: '#111318',
  scrub_a: '#0b0f0f',
  scrub_b: '#0b0f0f',
  sand: '#111113',
  beach: '#131419',
  aerodrome: '#0d1014',
  runway: '#30343b',
  water: '#030509',
  buildings: '#171b22',
  pier: '#171a20',
  minor_service_casing: '#07090c',
  minor_casing: '#07090c',
  link_casing: '#07090c',
  major_casing_late: '#080a0d',
  highway_casing_late: '#080a0d',
  other: '#22262d',
  minor_service: '#1d2127',
  minor_a: '#292e36',
  minor_b: '#252a31',
  link: '#2c3139',
  major_casing_early: '#080a0d',
  major: '#353a43',
  highway_casing_early: '#080a0d',
  highway: '#3b414a',
  railway: '#292e35',
  boundaries: '#505762',
  roads_label_minor: '#70757e',
  roads_label_minor_halo: '#06070a',
  roads_label_major: '#858a93',
  roads_label_major_halo: '#06070a',
  ocean_label: '#666d78',
  subplace_label: '#777c85',
  subplace_label_halo: '#06070a',
  city_label: '#969ba4',
  city_label_halo: '#06070a',
  state_label: '#5b6069',
  state_label_halo: '#06070a',
  country_label: '#777d86',
  address_label: '#60656d',
  address_label_halo: '#06070a',
  landcover: {
    grassland: 'rgba(11, 17, 15, 1)',
    barren: 'rgba(15, 15, 16, 1)',
    urban_area: 'rgba(11, 13, 16, 1)',
    farmland: 'rgba(11, 16, 14, 1)',
    glacier: 'rgba(18, 19, 21, 1)',
    scrub: 'rgba(11, 16, 14, 1)',
    forest: 'rgba(9, 16, 14, 1)',
  },
}

const basemapLayers = layers('sentinel-buildings', flavor, { lang: 'en' })
  .filter((layer) => !['address_label', 'roads_oneway'].includes(layer.id))
  .map((layer) => {
    if (layer.id === 'buildings') {
      return { ...layer, paint: { ...layer.paint, 'fill-opacity': 0.42 } }
    }
    return layer
  })

const style = {
  version: 8,
  name: 'Sentinel Edge Dark / OSM 2026-07-18',
  center: [103.8198, 1.3521],
  zoom: 13.4,
  bearing: -24,
  pitch: 55,
  sprite: '/edge-map/assets/sprites/dark',
  glyphs: '/edge-map/assets/fonts/{fontstack}/{range}.pbf',
  sources: {
    'sentinel-buildings': {
      type: 'vector',
      url: 'pmtiles:///edge-map/data/singapore.pmtiles',
      attribution: 'OpenStreetMap contributors / Protomaps',
    },
    'sentinel-terrain': {
      type: 'raster-dem',
      tiles: ['/edge-map/data/terrain/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 8,
      maxzoom: 12,
      bounds: [103.45, 1.10, 104.25, 1.65],
      encoding: 'mapbox',
      attribution: 'Copernicus DEM GLO-30 / European Union',
    },
  },
  layers: [
    ...basemapLayers.slice(0, 15),
    {
      id: 'terrain-hillshade',
      type: 'hillshade',
      source: 'sentinel-terrain',
      paint: {
        'hillshade-exaggeration': 0.18,
        'hillshade-shadow-color': '#020305',
        'hillshade-highlight-color': '#29313b',
        'hillshade-accent-color': '#141a20',
        'hillshade-illumination-direction': 315,
      },
    },
    ...basemapLayers.slice(15),
  ],
}

await writeFile('edge-map/style.json', `${JSON.stringify(style, null, 2)}\n`)
console.log(`Generated edge-map/style.json with ${basemapLayers.length} layers`)
