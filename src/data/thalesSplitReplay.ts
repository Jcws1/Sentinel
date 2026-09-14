export interface SplitReplayKeyframe {
  t: number
  lat: number
  lng: number
  estimatedObjects: number
}

export interface SplitReplayTrack {
  id: 'MAIN' | 'SPLIT-20' | 'SPLIT-100'
  readonly keyframes: readonly SplitReplayKeyframe[]
}

/** Thales SwarmBreakers scenario 04 (`perp_dive_split_180_20_100`). */
export const THALES_SPLIT_REPLAY = {
  id: 'thales-swarmbreakers-04',
  sourceScenario: 'perp_dive_split_180_20_100',
  startOffsetSeconds: 1600,
  durationSeconds: 2416.88,
  mapBounds: [[103.67, 1.23], [104.05, 1.47]] as [[number, number], [number, number]],
  tracks: [
    {
      id: 'MAIN',
      keyframes: [
        { t: 1509.408, lat: 1.4642815, lng: 103.9166898, estimatedObjects: 288.1 },
        { t: 1631.264, lat: 1.4336234, lng: 103.9083419, estimatedObjects: 268.4 },
        { t: 1691.504, lat: 1.4264979, lng: 103.8969756, estimatedObjects: 213.5 },
        { t: 1804.843, lat: 1.4010322, lng: 103.8752497, estimatedObjects: 169 },
        { t: 1930.656, lat: 1.3710155, lng: 103.8577588, estimatedObjects: 160.6 },
        { t: 2053.728, lat: 1.3370908, lng: 103.8490668, estimatedObjects: 134.6 },
        { t: 2179.232, lat: 1.3011918, lng: 103.8530361, estimatedObjects: 136 },
        { t: 2341.936, lat: 1.2865594, lng: 103.860705, estimatedObjects: 47.8 },
      ],
    },
    {
      id: 'SPLIT-20',
      keyframes: [
        { t: 1884.928, lat: 1.3981151, lng: 103.9612862, estimatedObjects: 20 },
        { t: 1944.24, lat: 1.3859249, lng: 103.9731351, estimatedObjects: 19.4 },
        { t: 2007.936, lat: 1.3711509, lng: 103.9836909, estimatedObjects: 18.9 },
        { t: 2096.416, lat: 1.359237, lng: 103.9902655, estimatedObjects: 17.4 },
      ],
    },
    {
      id: 'SPLIT-100',
      keyframes: [
        { t: 1764.936, lat: 1.4383342, lng: 103.8766103, estimatedObjects: 99.7 },
        { t: 1889.376, lat: 1.4415647, lng: 103.8431946, estimatedObjects: 93.6 },
        { t: 2014.048, lat: 1.4383496, lng: 103.808362, estimatedObjects: 79.1 },
        { t: 2134.8, lat: 1.4289365, lng: 103.7746291, estimatedObjects: 88.8 },
        { t: 2261.6, lat: 1.4132147, lng: 103.7411017, estimatedObjects: 94.1 },
        { t: 2381.58, lat: 1.3927309, lng: 103.7115428, estimatedObjects: 92.8 },
        { t: 2403.872, lat: 1.3877232, lng: 103.706015, estimatedObjects: 88.9 },
      ],
    },
  ] satisfies SplitReplayTrack[],
} as const
