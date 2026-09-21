import { validateLocalGeometry } from '../world/localGeometry';
import Ajv2020 from 'ajv/dist/2020';
import schema from '../../../contracts/sentinel/v1.16/interactive.schema.json';
import type {
  DemoEntry,
  Intent,
  Receipt,
  LegacyReceipt,
  LegacyM12Receipt,
  LegacyD2Receipt,
  LegacyD3Receipt,
  LegacyD3AReceipt,
  LegacyD3ARunRead,
  LegacyD4Receipt,
  LegacyD4RunRead,
  DirectMoveRequest,
  RunRead,
  InteractiveRun,
  MovePosition,
  RecommendationSet,
} from './generated';
import type { DeepReadonly, ImmutableFrame } from './types';
import { calendarInstant, invariant } from './integrity';
import { validateProfiles } from '../world/unitProfiles';

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
const recommendations = decoder<RecommendationSet>('RecommendationSet');
export function decodeRecommendations(value: unknown) {
  const result = recommendations(value);
  calendarInstant(result.createdAt);
  calendarInstant(result.expiresAt);
  invariant(
    Date.parse(result.expiresAt) - Date.parse(result.createdAt) === 15000,
    'Invalid suggestion lifetime',
  );
  const selected = new Set(result.selectedEntityIds);
  invariant(
    selected.size === result.selectedEntityIds.length &&
      result.members.length === selected.size &&
      new Set(result.members.map((m) => m.entityId)).size === selected.size &&
      result.members.every((m) => selected.has(m.entityId)),
    'Invalid suggestion scope',
  );
  invariant(
    new Set(result.options.map((o) => o.id)).size === result.options.length,
    'Duplicate suggestion options',
  );
  for (const option of result.options) {
    const affected = new Set(
      option.action?.members.map((m) => m.entityId) ?? [],
    );
    const unchanged = new Set(option.unchangedEntityIds);
    invariant(
      option.unchangedReasons.length === unchanged.size &&
        new Set(option.unchangedReasons.map((r) => r.entityId)).size ===
          unchanged.size &&
        option.unchangedReasons.every((r) => unchanged.has(r.entityId)),
      'Each unchanged member needs exactly one option-specific reason',
    );
    invariant(
      affected.size === (option.action?.members.length ?? 0) &&
        unchanged.size === option.unchangedEntityIds.length &&
        [...affected].every((id) => selected.has(id) && !unchanged.has(id)) &&
        [...unchanged].every((id) => selected.has(id)) &&
        affected.size + unchanged.size === selected.size,
      'Suggestion scope does not partition the selection',
    );
    if (option.action)
      invariant(
        (option.action.operation === 'behavior') === !!option.action.policy,
        'Invalid suggested policy',
      );
  }
  invariant(
    !result.unavailableReason || result.options.every((o) => !o.action),
    'Unavailable suggestions cannot contain actions',
  );
  return result;
}
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
  invariant(
    ['stop', 'return-to-script', 'behavior'].includes(result.action)
      ? !!result.members?.length && result.order != null
      : result.members == null && result.order == null,
    'Invalid selected control evidence',
  );
  invariant(
    (result.action === 'boundary-edit') === !!result.boundary,
    'Boundary mutation missing or attached to another action',
  );
  invariant(
    (result.action === 'behavior') === !!result.policy,
    'Missing behavior policy',
  );
  if (result.policy)
    invariant(
      result.policy.kind === 'patrol'
        ? !!result.policy.boundaryId &&
            !!result.policy.reviewedFrameId &&
            !!result.policy.deadline
        : result.policy.boundaryId == null &&
            result.policy.reviewedFrameId == null &&
            result.policy.deadline == null,
      'Invalid Patrol evidence',
    );
  return result;
}
const receipt = decoder<Receipt>('Receipt');
const legacyD4Receipt = decoder<LegacyD4Receipt>('LegacyD4Receipt');
const legacyD3aReceipt = decoder<LegacyD3AReceipt>('LegacyD3aReceipt');
const legacyReceipt = decoder<LegacyReceipt>('LegacyReceipt');
const legacyM12Receipt = decoder<LegacyM12Receipt>('LegacyM12Receipt');
const legacyD2Receipt = decoder<LegacyD2Receipt>('LegacyD2Receipt');
const legacyD3Receipt = decoder<LegacyD3Receipt>('LegacyD3Receipt');
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
    version === '1.0' ||
      version === '1.1' ||
      version === '1.2' ||
      version === '1.3' ||
      version === '1.4' ||
      version === '1.5' ||
      version === '1.6',
    'Unsupported receipt version',
  );
  const result =
    version === '1.0'
      ? legacyReceipt(value)
      : version === '1.1'
        ? legacyM12Receipt(value)
        : version === '1.2'
          ? legacyD2Receipt(value)
          : version === '1.3'
            ? legacyD3Receipt(value)
            : version === '1.4'
              ? legacyD3aReceipt(value)
              : version === '1.5'
                ? legacyD4Receipt(value)
                : receipt(value);
  calendarInstant(result.recordedAt);
  if (result.schemaVersion === '1.5' || result.schemaVersion === '1.6')
    invariant(
      result.movementOrder == null || result.operation === 'move',
      'Reviewed movement order attached to another operation',
    );
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
  if (
    result.schemaVersion === '1.1' ||
    result.schemaVersion === '1.2' ||
    result.schemaVersion === '1.3' ||
    result.schemaVersion === '1.4' ||
    result.schemaVersion === '1.5' ||
    result.schemaVersion === '1.6'
  ) {
    const ids = result.executionIds ?? [];
    invariant(new Set(ids).size === ids.length, 'Duplicate receipt executions');
    invariant(
      result.operation !== 'move' || !result.accepted || ids.length > 0,
      'Move receipt missing execution references',
    );
  }
  if (
    result.schemaVersion === '1.2' ||
    result.schemaVersion === '1.3' ||
    result.schemaVersion === '1.4' ||
    result.schemaVersion === '1.5' ||
    result.schemaVersion === '1.6'
  ) {
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
  if (
    result.schemaVersion === '1.3' ||
    result.schemaVersion === '1.4' ||
    result.schemaVersion === '1.5' ||
    result.schemaVersion === '1.6'
  ) {
    const outcomes = result.controlOutcomes ?? [];
    if (['stop', 'return-to-script'].includes(result.operation)) {
      invariant(
        result.controlOrder != null && !result.executionIds?.length,
        'Missing selected control order or fabricated movement',
      );
      invariant(
        new Set(outcomes.map((o) => o.assetId)).size === outcomes.length &&
          new Set(outcomes.map((o) => o.entityId)).size === outcomes.length,
        'Duplicate selected control members',
      );
      for (const o of outcomes)
        invariant(
          (o.outcome === 'accepted') === (o.code === 'OK'),
          'Invalid selected control outcome',
        );
      invariant(
        result.accepted === outcomes.some((o) => o.outcome === 'accepted'),
        'Selected control outcome disagrees',
      );
    } else
      invariant(
        result.controlOrder == null && outcomes.length === 0,
        'Selected control result on another operation',
      );
  }
  if (
    result.schemaVersion === '1.4' ||
    result.schemaVersion === '1.5' ||
    result.schemaVersion === '1.6'
  )
    invariant(
      (result.operation === 'boundary-edit' && result.accepted) ===
        (result.boundaryRevision != null),
      'Boundary receipt lacks committed revision',
    );
  if (result.schemaVersion === '1.5' || result.schemaVersion === '1.6') {
    const outcomes = result.behaviorOutcomes ?? [];
    if (['behavior', 'intercept-approach'].includes(result.operation)) {
      invariant(
        result.behaviorOrder != null && !result.executionIds?.length,
        'Invalid behavior order',
      );
      invariant(
        new Set(outcomes.map((o) => o.assetId)).size === outcomes.length &&
          new Set(outcomes.map((o) => o.entityId)).size === outcomes.length,
        'Duplicate behavior members',
      );
      for (const o of outcomes)
        invariant(
          o.outcome === 'accepted'
            ? o.code === 'OK' && o.state != null
            : o.code !== 'OK' && o.state == null && o.assignmentId == null,
          'Invalid behavior outcome',
        );
      invariant(
        result.accepted === outcomes.some((o) => o.outcome === 'accepted'),
        'Behavior receipt disagreement',
      );
      invariant(
        new Set(result.targetScope ?? []).size ===
          (result.targetScope ?? []).length,
        'Duplicate target scope',
      );
    } else
      invariant(
        result.behaviorOrder == null &&
          !outcomes.length &&
          !result.targetScope?.length,
        'Behavior evidence on another operation',
      );
  }
  return result;
}
const status = decoder<RunRead>('RunRead');
const legacyStatus = decoder<LegacyD3ARunRead>('LegacyD3aRunRead');
const d4Status = decoder<LegacyD4RunRead>('LegacyD4RunRead');
export function decodeRunRead(value: unknown) {
  const legacy =
    (value as { schemaVersion?: string })?.schemaVersion === '1.5'
      ? legacyStatus(value)
      : (value as { schemaVersion?: string })?.schemaVersion === '1.6'
        ? d4Status(value)
        : undefined;
  const result = legacy
    ? status({
        ...legacy,
        schemaVersion: '1.7',
        run: { ...legacy.run, schemaVersion: '1.7' },
      })
    : status(value);
  validateMovementRun(
    result.run,
    result.sequence,
    undefined,
    result.unitProfiles,
  );
  invariant(
    result.schemaVersion === result.run.schemaVersion,
    'Status geometry/version mismatch',
  );
  validateProfiles(result.unitProfiles);
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
  profiles: ImmutableFrame['unitProfiles'] = frame?.unitProfiles,
) {
  invariant(
    run.schemaVersion !== '1.7' || !('localGeometry' in run),
    'Legacy runs cannot contain a local geometry field, including null',
  );
  if (run.localGeometry) validateLocalGeometry(run.localGeometry);
  invariant(
    run.schemaVersion === (run.localGeometry ? '1.8' : '1.7') &&
      run.movementModel ===
        (run.localGeometry ? 'local-horizontal-v2' : 'local-horizontal-v1'),
    'Unsupported interactive geometry',
  );
  const ids = new Set<string>(),
    active = new Set<string>();
  for (const e of run.executions ?? []) {
    invariant(
      e.speedMps ===
        (profiles?.[e.entityId]?.cruiseMps ??
          (run.templateId === 'singapore-local-v2' ? 155 / 3.6 : 20)),
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
