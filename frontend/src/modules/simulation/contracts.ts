import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import requestSchema from '../../../../contracts/simulation/v1.request.schema.json';
import responseSchema from '../../../../contracts/simulation/v1.response.schema.json';
import moduleSchema from '../../../../contracts/sentinel/v1.16/simulation-module.schema.json';
import type { SimulationRequest } from './request.generated';
import type { SimulationResponse } from './response.generated';
import type {
  SimulationEntityDetail,
  SimulationProjection,
  SimulationRunStatus,
  SimulationCommandSummary,
} from '../../contracts/generated';
import type { WorldFrame } from '../../contracts/generated';
import { calendarInstant } from '../../contracts/integrity';

export const simulationNamespace = 'sentinel.simulation.v1';
const ajv = new Ajv2020({
  strict: false,
  allErrors: false,
  strictNumbers: true,
  ownProperties: true,
});
addFormats(ajv);
const requestValid = ajv.compile<SimulationRequest>(requestSchema);
const responseValid = ajv.compile<SimulationResponse>(responseSchema);
const statusValid = ajv.compile<SimulationRunStatus>({
  $defs: moduleSchema.$defs,
  $ref: '#/$defs/SimulationRunStatus',
});
const projectionValid = ajv.compile<SimulationProjection>({
  $defs: moduleSchema.$defs,
  $ref: '#/$defs/SimulationProjection',
});
const entityValid = ajv.compile<SimulationEntityDetail>({
  $defs: moduleSchema.$defs,
  $ref: '#/$defs/SimulationEntityDetail',
});
const commandValid = ajv.compile<SimulationCommandSummary>({
  $defs: moduleSchema.$defs,
  $ref: '#/$defs/SimulationCommandSummary',
});

export function decodeCommand(value: unknown): SimulationCommandSummary {
  if (!commandValid(value))
    throw new Error('Invalid recorded command summary.');
  calendarInstant(value.receivedAt);
  if (value.completedAt) calendarInstant(value.completedAt);
  return value;
}

/** Preview only. The exact original text goes to the duplicate-aware authority. */
export function previewRequest(raw: string): SimulationRequest | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return requestValid(value) ? value : undefined;
  } catch {
    return;
  }
}

export function decodeResponse(value: unknown): SimulationResponse {
  if (!responseValid(value))
    throw new Error(
      'Invalid simulation response contract; retain the exact pending request.',
    );
  for (const at of Object.keys(value.results_by_timestamp)) calendarInstant(at);
  return value;
}

export function decodeRun(value: unknown): SimulationRunStatus {
  if (!statusValid(value)) throw new Error('Invalid simulation run status.');
  calendarInstant(value.receivedAt);
  if (value.completedAt) calendarInstant(value.completedAt);
  return value;
}

export function simulationProjection(
  value: unknown,
): SimulationProjection | undefined {
  return value === undefined
    ? undefined
    : projectionValid(value)
      ? value
      : undefined;
}

export function simulationEntityDetail(
  value: unknown,
): SimulationEntityDetail | undefined {
  return value === undefined
    ? undefined
    : entityValid(value)
      ? value
      : undefined;
}

/** Module-owned decoding at the world boundary; no external request objects enter it. */
export function validateSimulationProjection(frame: WorldFrame) {
  const raw = frame.mission.extensions?.[simulationNamespace];
  if (raw === undefined) return;
  const projection = simulationProjection(raw);
  if (
    !projection ||
    frame.mission.domain !== 'external-simulation-v1' ||
    frame.interactive ||
    Object.keys(frame.assets).length
  )
    throw new Error('Invalid external simulation ownership.');
  for (const entity of Object.values(frame.entities)) {
    const value = entity.extensions?.[simulationNamespace];
    if (value === undefined && entity.presence === 'unobserved') continue;
    const detail = simulationEntityDetail(value);
    if (
      !detail ||
      detail.runId !== projection.runId ||
      detail.droneId !== entity.label ||
      (detail.reportedStatus === 'ACTIVE') !== detail.health > 0
    )
      throw new Error('Invalid external simulation entity detail.');
  }
  for (const track of Object.values(frame.tracks)) {
    if (
      track.source.mode === 'live' ||
      track.latest.position.altitude.reference !== 'MSL'
    )
      throw new Error('External simulation source or altitude was relabelled.');
  }
}
