export type NavigationSource =
  | 'GNSS'
  | 'RTK_FLOAT'
  | 'RTK_FIXED'
  | 'VIO'
  | 'MESH'
  | 'DEAD_RECKONING'
  | 'WITHHELD'
  | 'UNKNOWN'

export type FixStatus =
  | 'VALID'
  | 'DEGRADED'
  | 'INVALID'
  | 'UNAVAILABLE'
  | 'UNKNOWN'

export interface EnuVector {
  eastM: number
  northM: number
  upM: number
}

export interface EvaluationProvenance {
  dataset: string
  sequence: string
  sourceRecord: string
  sourceKind: 'MEASURED' | 'DERIVED' | 'MODELLED'
}

/** Candidate position presented to Sentinel or emitted by Sentinel. */
export interface PositionEstimateFrame {
  schemaVersion: 'sentinel-position-evaluation/1.0'
  vehicleId: string
  sequence: number
  sourceTimestampNs: string
  gatewayTimestampNs?: string
  frame: {
    convention: 'LOCAL_ENU'
    frameId: string
    origin?: {
      latitudeDeg: number
      longitudeDeg: number
      elevationM: number
    }
  }
  position: EnuVector
  velocity?: {
    eastMS: number
    northMS: number
    upMS: number
  }
  navigationSource: NavigationSource
  fixStatus: FixStatus
  quality: {
    /** Scalar supplied by the source. Its statistical meaning must be documented. */
    reportedUncertaintyM?: number
    confidence?: number
    confidenceSemantics?: 'HEURISTIC' | 'PROBABILITY' | 'UNKNOWN'
    covarianceM2?: number[]
    fixAgeMs?: number
    satellitesTracked?: number
  }
  provenance: EvaluationProvenance
}

/** Independent reference trajectory. This must never be included in Anchor input. */
export interface GroundTruthFrame {
  schemaVersion: 'sentinel-position-truth/1.0'
  vehicleId: string
  timestampNs: string
  frameId: string
  position: EnuVector
  provenance: EvaluationProvenance & {
    instrument: string
    statedAccuracyM?: number
  }
}

export interface AlignedPositionSample {
  estimate: PositionEstimateFrame
  truth: GroundTruthFrame
  timeOffsetMs: number
  horizontalErrorM: number
  verticalErrorM: number
  error3dM: number
}

export interface AccuracySummary {
  inputEstimates: number
  truthSamples: number
  alignedSamples: number
  unmatchedEstimates: number
  outOfOrderEstimates: number
  duplicateSequences: number
  horizontal: DistributionSummary
  vertical: DistributionSummary
  error3d: DistributionSummary
  thresholdPassRate: Record<string, number>
  reportedUncertaintyCoverage: number | null
  overconfidentSamples: number
}

export interface DistributionSummary {
  median: number | null
  rmse: number | null
  p95: number | null
  p99: number | null
  max: number | null
}
