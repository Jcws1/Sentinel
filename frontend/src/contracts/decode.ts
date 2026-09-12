import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import worldSchema from '../../../contracts/sentinel/v1/world.schema.json';
import streamSchema from '../../../contracts/sentinel/v1/stream.schema.json';
import catalogSchema from '../../../contracts/sentinel/v1/mission-list.schema.json';
import type {
  DeepReadonly,
  MissionList,
  StreamMessage,
  WorldFrame,
} from './types';
import { calendarInstant, polygonIntegrity } from './integrity';

const ajv = new Ajv2020({
  allErrors: false,
  strict: false,
  strictNumbers: true,
  ownProperties: true,
});
addFormats(ajv);
const validateWorld = ajv.compile<WorldFrame>(worldSchema);
const validateStream = ajv.compile<StreamMessage>(streamSchema);
const validateCatalog = ajv.compile<MissionList>(catalogSchema);

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ContractError(message);
}
export function decodeCatalog(value: unknown): MissionList {
  assert(
    validateCatalog(value),
    `Invalid mission catalog: ${ajv.errorsText(validateCatalog.errors)}`,
  );
  const ids = value.missions.map((mission) => mission.id);
  assert(
    new Set(ids).size === ids.length,
    'Duplicate mission catalog identity',
  );
  assert(value.schemaVersion === '1.0', 'Missing catalog schema version');
  for (const mission of value.missions) {
    calendarInstant(mission.createdAt);
    calendarInstant(mission.updatedAt);
    assert(
      mission.updatedAt >= mission.createdAt,
      'Mission timestamp order is invalid',
    );
  }
  return value;
}

/** Schema checks shape; aggregate checks detect invalid combined delta state. */
export function validateFrame(value: unknown): WorldFrame {
  assert(
    validateWorld(value),
    `Invalid world frame: ${ajv.errorsText(validateWorld.errors)}`,
  );
  const frame = value;
  assert(frame.schemaVersion === '1.0', 'Missing world schema version');
  calendarInstant(frame.effectiveAt);
  calendarInstant(frame.recordedAt);
  calendarInstant(frame.mission.createdAt);
  calendarInstant(frame.mission.updatedAt);
  assert(
    frame.mission.updatedAt >= frame.mission.createdAt,
    'Mission timestamp order is invalid',
  );
  const collections = [
    frame.entities,
    frame.tracks,
    frame.assets,
    frame.sensors,
    frame.zones,
    frame.tasks,
  ];
  for (const collection of collections) {
    for (const [id, record] of Object.entries(collection)) {
      assert(
        record.id === id,
        'World dictionary key does not match record identity',
      );
      assert(
        record.missionId === frame.mission.id,
        'World record belongs to another mission',
      );
      if ('provenance' in record) {
        calendarInstant(record.provenance.effectiveAt);
        calendarInstant(record.provenance.recordedAt);
      }
    }
  }
  const refs = (ids: readonly string[], dictionary: object) => {
    assert(new Set(ids).size === ids.length, 'Duplicate reference identity');
    for (const id of ids)
      assert(Object.hasOwn(dictionary, id), `Dangling world reference: ${id}`);
  };
  refs(frame.mission.zoneIds ?? [], frame.zones);
  for (const track of Object.values(frame.tracks)) {
    refs([track.entityId], frame.entities);
    calendarInstant(track.latest.timestamp);
    assert(
      track.latest.timestamp <= frame.effectiveAt,
      'Track observation is newer than its frame',
    );
  }
  for (const asset of Object.values(frame.assets)) {
    refs([asset.entityId], frame.entities);
    refs(asset.taskIds ?? [], frame.tasks);
    for (const taskId of asset.taskIds ?? []) {
      assert(
        frame.tasks[taskId].assetIds?.includes(asset.id),
        'Asset/task associations disagree',
      );
    }
  }
  for (const sensor of Object.values(frame.sensors)) {
    if (sensor.entityId != null) refs([sensor.entityId], frame.entities);
    refs(sensor.coverageZoneIds ?? [], frame.zones);
  }
  for (const task of Object.values(frame.tasks)) {
    refs(task.assetIds ?? [], frame.assets);
    refs(task.subjectEntityIds ?? [], frame.entities);
    refs(task.zoneIds ?? [], frame.zones);
    for (const assetId of task.assetIds ?? []) {
      assert(
        frame.assets[assetId].taskIds?.includes(task.id),
        'Task/asset associations disagree',
      );
    }
  }
  for (const zone of Object.values(frame.zones)) {
    polygonIntegrity(zone.geometry.coordinates);
    if (zone.validFrom != null) calendarInstant(zone.validFrom);
    if (zone.validUntil != null) calendarInstant(zone.validUntil);
    if (zone.validFrom && zone.validUntil)
      assert(
        zone.validFrom <= zone.validUntil,
        'Zone time interval is reversed',
      );
    if (zone.altitudeBand) {
      const { lower, upper } = zone.altitudeBand;
      assert(
        lower.reference === upper.reference &&
          (lower.datumId ?? null) === (upper.datumId ?? null),
        'Altitude band references are inconsistent',
      );
      assert(lower.metres <= upper.metres, 'Altitude band is reversed');
    }
  }
  validateEvents(frame.recentEvents, frame);
  return frame;
}

/** Validate the entire append before the bounded read-model discards older rows. */
export function validateEvents(
  appended: DeepReadonly<WorldFrame['recentEvents']>,
  frame: DeepReadonly<
    Pick<WorldFrame, 'mission' | 'entities' | 'zones' | 'tasks'>
  >,
  afterSequence = -1,
) {
  const events = new Set<string>();
  let priorEventSequence = afterSequence;
  for (const event of appended) {
    assert(
      event.missionId === frame.mission.id,
      'Event belongs to another mission',
    );
    assert(!events.has(event.id), 'Duplicate recent event');
    assert(
      event.sequence > priorEventSequence,
      'Event sequence is not strictly increasing',
    );
    priorEventSequence = event.sequence;
    calendarInstant(event.effectiveAt);
    calendarInstant(event.recordedAt);
    events.add(event.id);
    for (const [ids, dictionary] of [
      [event.entityIds ?? [], frame.entities],
      [event.zoneIds ?? [], frame.zones],
      [event.taskIds ?? [], frame.tasks],
    ] as const) {
      assert(new Set(ids).size === ids.length, 'Duplicate event reference');
      for (const id of ids)
        assert(
          Object.hasOwn(dictionary, id),
          `Dangling event reference: ${id}`,
        );
    }
  }
}
export function decodeStream(text: string): StreamMessage {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ContractError('Invalid stream JSON');
  }
  assert(
    validateStream(value),
    `Invalid stream message: ${ajv.errorsText(validateStream.errors)}`,
  );
  assert(value.schemaVersion === '1.0', 'Missing stream schema version');
  if (value.type === 'snapshot') {
    const frame = validateFrame(value.frame);
    assert(value.missionId === frame.mission.id, 'Snapshot mission mismatch');
    assert(value.streamEpoch === frame.streamEpoch, 'Snapshot epoch mismatch');
    assert(value.sequence === frame.sequence, 'Snapshot sequence mismatch');
  } else if (value.type === 'heartbeat') {
    calendarInstant(value.serverTime);
  } else if (value.type === 'delta') {
    calendarInstant(value.effectiveAt);
    calendarInstant(value.recordedAt);
  }
  return value;
}
