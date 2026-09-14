import Ajv2020 from 'ajv/dist/2020';
import schema from '../../../contracts/sentinel/v1.1/interactive.schema.json';
import type { DemoEntry, Intent, Receipt, RunRead } from './generated';
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
  return result;
}
const receipt = decoder<Receipt>('Receipt');
export function decodeReceipt(value: unknown) {
  const result = receipt(value);
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
  return result;
}
const status = decoder<RunRead>('RunRead');
export function decodeRunRead(value: unknown) {
  const result = status(value);
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
