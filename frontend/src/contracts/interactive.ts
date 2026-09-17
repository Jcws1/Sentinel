import Ajv2020 from 'ajv/dist/2020';
import schema from '../../../contracts/sentinel/v1.4/interactive.schema.json';
import type {
  DemoEntry,
  Intent,
  Receipt,
  LegacyReceipt,
  LegacyM12Receipt,
  DirectMoveRequest,
  RunRead,
  InteractiveRun,
  MovePosition,
} from './generated';
import type { DeepReadonly, ImmutableFrame } from './types';
import { calendarInstant, invariant } from './integrity';

const ajv = new Ajv2020({
  strict: false,
  strictNumbers: true,
  ownProperties: true,
});
function decoder<T>(name: string) {
  const validate = ajv.compile<T>({
    ...schema,
    $ref: `#/$defs/${name}`,
    properties: undefined,
    required: undefined,
    additionalProperties: undefined,
    type: undefined,
  });
  return (value: unknown): T => {
    invariant(validate(value), `Invalid ${name} contract`);
    return value;
  };
}
export const decodeEntry = decoder<DemoEntry>('DemoEntry');
const intent = decoder<Intent>('Intent');
export function decodeIntent(value: unknown) {
  const result = intent(value);
  calendarInstant(result.issuedAt);
  calendarInstant(result.expiresAt);
  invariant(
    Date.parse(result.expiresAt) - Date.parse(result.issuedAt) === 30_000,
    'Invalid intent lifetime',
  );
  invariant(
    result.action === 'cancel'
      ? !!result.executionId && result.executionRevision != null
      : result.executionId == null && result.executionRevision == null,
    'Invalid cancellation evidence',
  );
  return result;
}
const receipt = decoder<Receipt>('Receipt');
const legacyReceipt = decoder<LegacyReceipt>('LegacyReceipt');
const legacyM12Receipt = decoder<LegacyM12Receipt>('LegacyM12Receipt');
const directMoveRequest = decoder<DirectMoveRequest>('DirectMoveRequest');
export function decodeDirectMoveRequest(value: unknown) {
  const result = directMoveRequest(value);
  calendarInstant(result.direct.deadline);
  const members = result.direct.members;
  invariant(
    new Set(members.map((m) => m.assetId)).size === members.length &&
      new Set(members.map((m) => m.entityId)).size === members.length,
    'Duplicate direct move members',
  );
  return result;
}
export function decodeReceipt(value: unknown) {
  const version = (value as { schemaVersion?: string })?.schemaVersion;
  invariant(
    version === '1.0' || version === '1.1' || version === '1.2',
    'Unsupported receipt version',
  );
  const result =
    version === '1.0'
      ? legacyReceipt(value)
      : version === '1.1'
        ? legacyM12Receipt(value)
        : receipt(value);
  calendarInstant(result.recordedAt);
  invariant(
    result.accepted === (result.code === 'OK'),
    'Receipt result mismatch',
  );
  if (result.accepted)
    invariant(
      result.missionId &&
        result.runId &&
        result.recordingId &&
        result.frameId &&
        result.sequence != null,
      'Receipt missing committed references',
    );
  if (result.schemaVersion === '1.1' || result.schemaVersion === '1.2') {
    const ids = result.executionIds ?? [];
    invariant(new Set(ids).size === ids.length, 'Duplicate receipt executions');
    invariant(
      result.operation !== 'move' || !result.accepted || ids.length > 0,
      'Move receipt missing execution references',
    );
  }
  if (result.schemaVersion === '1.2') {
    const outcomes = result.memberOutcomes ?? [];
    if (result.operation === 'direct-move') {
      invariant(result.directOrder != null, 'Missing direct order');
      invariant(
        new Set(outcomes.map((o) => o.assetId)).size === outcomes.length &&
          new Set(outcomes.map((o) => o.entityId)).size === outcomes.length,
        'Duplicate direct outcome members',
      );
      for (const outcome of outcomes)
        invariant(
          outcome.outcome === 'accepted'
            ? outcome.code === 'OK' && outcome.executionId != null
            : outcome.code !== 'OK' && outcome.executionId == null,
          'Invalid direct member outcome',
        );
      const accepted = outcomes
        .filter((o) => o.outcome === 'accepted')
        .map((o) => o.executionId);
      invariant(
        result.accepted === accepted.length > 0 &&
          JSON.stringify(accepted) ===
            JSON.stringify(result.executionIds ?? []),
        'Direct receipt execution evidence disagrees',
      );
    } else
      invariant(
        result.directOrder == null && outcomes.length === 0,
        'Direct outcomes on another operation',
      );
  }
  return result;
}
const status = decoder<RunRead>('RunRead');
export function decodeRunRead(value: unknown) {
  const result = status(value);
  validateMovementRun(result.run, result.sequence);
  calendarInstant(result.serverTime);
  const lease = result.run.lease;
  invariant(!!lease.holderId === !!lease.expiresAt, 'Incomplete lease');
  if (lease.expiresAt) calendarInstant(lease.expiresAt);
  const expected = !lease.holderId
    ? 'unclaimed'
    : lease.expiresAt! <= result.serverTime
      ? 'expired'
      : 'held';
  invariant(
    result.leaseState === expected &&
      (!result.ownsControl || expected === 'held'),
    'Lease status mismatch',
  );
  return result;
}

const samePosition = (
  a: DeepReadonly<MovePosition>,
  b: DeepReadonly<MovePosition>,
) =>
  a.longitudeDeg === b.longitudeDeg &&
  a.latitudeDeg === b.latitudeDeg &&
  a.altitude.metres === b.altitude.metres &&
  a.altitude.reference === b.altitude.reference &&
  a.altitude.datumId === b.altitude.datumId;
/** HTTP status is validated independently; only a complete world can prove a position. */
export function validateMovementRun(
  run: DeepReadonly<InteractiveRun>,
  sequence: number,
  frame?: ImmutableFrame,
) {
  invariant(run.schemaVersion === '1.3', 'Unsupported interactive module');
  const ids = new Set<string>(),
    active = new Set<string>();
  for (const e of run.executions ?? []) {
    invariant(
      e.speedMps === (run.templateId === 'singapore-local-v2' ? 155 / 3.6 : 20),
      'Execution speed differs from the run profile',
    );
    invariant(
      !ids.has(e.id) && e.missionId === run.missionId && e.runId === run.runId,
      'Execution identity mismatch',
    );
    ids.add(e.id);
    calendarInstant(e.acceptedAt);
    calendarInstant(e.deadline);
    if (e.startedAt) calendarInstant(e.startedAt);
    const terminal = [
      'Completed',
      'Cancelled',
      'Failed',
      'Expired',
      'Interrupted',
    ].includes(e.state);
    invariant(
      terminal === (e.terminalSequence != null),
      'Terminal execution missing commit',
    );
    invariant(
      (e.startedAt != null) === (e.startedTick != null) &&
        (e.state !== 'Running' || e.startedAt != null),
      'Invalid execution start evidence',
    );
    invariant(
      e.acceptedSequence <= sequence &&
        (e.terminalSequence == null || e.terminalSequence <= sequence),
      'Execution references future commit',
    );
    invariant(
      (e.state === 'Completed') === (e.completionSample != null),
      'Completion requires committed sample',
    );
    if (!terminal) {
      const c = run.controls.find((c) => c.assetId === e.assetId);
      invariant(
        !active.has(e.assetId) && c?.busyRevision === e.reservationRevision,
        'Execution reservation mismatch',
      );
      active.add(e.assetId);
      invariant(
        c &&
          c.entityId === e.entityId &&
          c.controlTrackId === e.controlTrackId &&
          c.executorId === e.executorId &&
          c.sourceId === e.sourceId &&
          c.grantId === e.grantId &&
          c.bindingRevision === e.bindingRevision &&
          run.executorEpoch === e.executorEpoch &&
          run.grantRevision === e.grantRevision,
        'Execution control binding mismatch',
      );
    }
    const s = e.completionSample;
    if (s) {
      calendarInstant(s.timestamp);
      invariant(
        s.sequence === e.terminalSequence &&
          s.trackId === e.controlTrackId &&
          e.remainingMetres === 0 &&
          samePosition(s.position, e.destination),
        'Invalid completion sample',
      );
      if (frame && s.sequence === sequence) {
        const t = frame.tracks[s.trackId];
        invariant(
          t &&
            t.latest.timestamp === s.timestamp &&
            samePosition(t.latest.position as MovePosition, s.position),
          'Completion not backed by this frame',
        );
      }
    }
  }
}
