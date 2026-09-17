import { validateBoundary } from '../world/boundaryGeometry';
import legacySchema from '../../../contracts/sentinel/v1.5/scenarios.schema.json';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../../../contracts/sentinel/v1.7/scenarios.schema.json';
import reviewSchema from '../../../contracts/sentinel/v1.7/scenario-review.schema.json';
import type {
  ScenarioRevision,
  ScenarioReceipt,
  ScenarioList,
  ScenarioWrite,
  ScenarioContent,
  ScenarioReview,
} from './generated';
const ajv = new Ajv2020({
  strict: false,
  strictNumbers: true,
  ownProperties: true,
});
addFormats(ajv);
function decoder<T>(name: string) {
  const validate = ajv.compile<T>({
    ...schema,
    $ref: `#/$defs/${name}`,
    properties: undefined,
    required: undefined,
    type: undefined,
    additionalProperties: undefined,
  });
  return (value: unknown): T => {
    if (!validate(value)) throw new Error(`Invalid ${name} response.`);
    return value;
  };
}
export function withinScenarioExtent(longitude: number, latitude: number) {
  const scale = (6378137 * Math.PI) / 180;
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs((longitude - 103.85) * scale * Math.cos((1.29 * Math.PI) / 180)) <=
      5000 &&
    Math.abs((latitude - 1.29) * scale) <= 5000
  );
}
function contentIntegrity(content: ScenarioContent) {
  if ((content.boundaries == null) !== (content.boundaryRuleVersion == null))
    throw new Error('Boundary content needs a rule version.');
  const ids = new Set(content.units.map((u) => u.id));
  for (const b of content.boundaries ?? []) {
    validateBoundary(b);
    if (ids.has(b.id)) throw new Error('Boundary identities must be unique.');
    ids.add(b.id);
  }
  if (
    !content.name.trim() ||
    new Set(content.units.map((u) => u.id)).size !== content.units.length ||
    content.units.some(
      (u) =>
        !u.label.trim() ||
        (u.commandRole === 'sentinel' && u.category !== 'friendly') ||
        !withinScenarioExtent(u.position.longitudeDeg, u.position.latitudeDeg),
    )
  )
    throw new Error('Invalid scenario roles, identities or local positions.');
}
const legacyRevision = ajv.compile({
  $defs: legacySchema.$defs,
  $ref: '#/$defs/ScenarioRevision',
});
const legacyReceipt = ajv.compile({
  $defs: legacySchema.$defs,
  $ref: '#/$defs/ScenarioReceipt',
});
const revisionShape = decoder<ScenarioRevision>('ScenarioRevision');
export function decodeScenarioRevision(value: unknown) {
  const result = revisionShape(value);
  if (result.schemaVersion === '1.0' && !legacyRevision(value))
    throw new Error('Invalid legacy scenario revision.');
  if (
    result.schemaVersion !== (result.content.boundaries == null ? '1.0' : '1.1')
  )
    throw new Error('Scenario version disagrees with content.');
  contentIntegrity(result.content);
  return result;
}
const receiptShape = decoder<ScenarioReceipt>('ScenarioReceipt');
export function decodeScenarioReceipt(value: unknown) {
  const result = receiptShape(value);
  if (result.schemaVersion === '1.0' && !legacyReceipt(value))
    throw new Error('Invalid legacy scenario receipt.');
  if (
    result.accepted !== (result.code === 'OK') ||
    result.accepted !== !!result.result
  )
    throw new Error('Invalid scenario receipt evidence.');
  if (result.result) decodeScenarioRevision(result.result);
  return result;
}
const listShape = decoder<ScenarioList>('ScenarioList');
export function decodeScenarioList(value: unknown) {
  const result = listShape(value);
  result.scenarios.forEach(decodeScenarioRevision);
  return result;
}
const writeShape = decoder<ScenarioWrite>('ScenarioWrite');
export function decodeScenarioWrite(value: unknown) {
  const result = writeShape(value);
  contentIntegrity(result.content);
  return result;
}

const reviewShape = ajv.compile<ScenarioReview>({
  $defs: reviewSchema.$defs,
  $ref: '#/$defs/ScenarioReview',
});
export function decodeScenarioReview(value: unknown) {
  if (!reviewShape(value)) throw new Error('Invalid scenario review response.');
  const counts = value.counts;
  if (
    value.canRun !== !value.issues.length ||
    counts.total !== counts.friendly + counts.hostile + counts.unknown ||
    counts.total !== counts.controlled + counts.observationOnly ||
    counts.controlled > counts.friendly
  )
    throw new Error('Scenario review evidence disagrees.');
  return value;
}
