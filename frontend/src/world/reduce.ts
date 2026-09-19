import type {
  DeltaMessage,
  ImmutableFrame,
  WorldFrame,
} from '../contracts/types';
import {
  ContractError,
  validateEvents,
  validateFrame,
} from '../contracts/decode';
import { immutableCopy } from './immutable';
import { sameGeometry } from './localGeometry';

function applyRecords<T, P>(
  previous: Readonly<Record<string, P>>,
  change: { upserts: Record<string, T>; removes: string[] },
): Record<string, T | P> {
  const result: Record<string, T | P> = Object.assign(
    Object.create(null),
    previous,
  );
  const removed = new Set<string>();
  for (const id of change.removes) {
    if (
      removed.has(id) ||
      Object.hasOwn(change.upserts, id) ||
      !Object.hasOwn(result, id)
    ) {
      throw new ContractError('Invalid delta removal');
    }
    removed.add(id);
    delete result[id];
  }
  for (const [id, record] of Object.entries(change.upserts))
    result[id] = record;
  return result;
}

/** Build and validate privately, then publish once: readers never see partial maps. */
export function applyDelta(
  previous: ImmutableFrame,
  delta: DeltaMessage,
): ImmutableFrame {
  if (
    delta.recordedAt < previous.recordedAt ||
    delta.frameId === previous.frameId
  ) {
    throw new ContractError(
      'Delta regressed recording time or reused a frame identity',
    );
  }
  const next = {
    schemaVersion: delta.schemaVersion,
    mission: delta.changes.mission,
    interactive: delta.changes.interactive,
    scenario: delta.changes.scenario,
    boundaryRules: delta.changes.boundaryRules,
    scenarioSchedule: delta.changes.scenarioSchedule,
    liveBoundaries: delta.changes.liveBoundaries,
    fleetBehavior: delta.changes.fleetBehavior,
    unitProfiles: delta.changes.unitProfiles,
    frameId: delta.frameId,
    recordingId: delta.recordingId,
    streamEpoch: delta.streamEpoch,
    sequence: delta.sequence,
    effectiveAt: delta.effectiveAt,
    recordedAt: delta.recordedAt,
    entities: applyRecords(previous.entities, delta.changes.entities),
    tracks: applyRecords(previous.tracks, delta.changes.tracks),
    assets: applyRecords(previous.assets, delta.changes.assets),
    sensors: applyRecords(previous.sensors, delta.changes.sensors),
    zones: applyRecords(previous.zones, delta.changes.zones),
    tasks: applyRecords(previous.tasks, delta.changes.tasks),
    recentEvents: [...previous.recentEvents, ...delta.changes.events].slice(
      -100,
    ),
  };
  if (
    next.mission.id !== previous.mission.id ||
    next.recordingId !== previous.recordingId
  ) {
    throw new ContractError('Delta changed mission or recording identity');
  }
  if (!sameGeometry(previous, next))
    throw new ContractError('Delta changed frozen scenario geometry');
  if (
    delta.changes.events.some((event) =>
      previous.recentEvents.some((prior) => prior.id === event.id),
    )
  ) {
    throw new ContractError('Delta repeated an existing event');
  }
  validateEvents(
    delta.changes.events,
    next,
    previous.recentEvents.at(-1)?.sequence,
  );
  if (
    delta.changes.events.some((event) => event.recordedAt !== delta.recordedAt)
  ) {
    throw new ContractError(
      'Appended event recording time does not match its frame',
    );
  }
  return immutableCopy(validateFrame(next as WorldFrame));
}
