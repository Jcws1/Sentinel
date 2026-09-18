import { validateBoundary } from '../world/boundaryGeometry';
import { profileOptions } from '../world/unitProfiles';
import d3aSchema from '../../../contracts/sentinel/v1.10/scenarios.schema.json';
import legacySchema from '../../../contracts/sentinel/v1.5/scenarios.schema.json';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import boundarySchema from '../../../contracts/sentinel/v1.7/scenarios.schema.json';
import scheduledSchema from '../../../contracts/sentinel/v1.8/scenarios.schema.json';
import { validateActionGraph } from '../world/scriptPlan';
import schema from '../../../contracts/sentinel/v1.11/scenarios.schema.json';
import reviewSchema from '../../../contracts/sentinel/v1.11/scenario-review.schema.json';
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
  validateActionGraph(content);
  for (const u of content.units)
    if (
      u.profileId &&
      !(profileOptions[u.category] as readonly string[]).includes(u.profileId)
    )
      throw new Error('Unit profile is not available for this affiliation.');
  if ((content.boundaries == null) !== (content.boundaryRuleVersion == null))
    throw new Error('Boundary content needs a rule version.');
  if ((content.actions == null) !== (content.scheduleRuleVersion == null))
    throw new Error('Script content needs a rule version.');
  const ids = new Set(content.units.map((u) => u.id));
  for (const b of content.boundaries ?? []) {
    validateBoundary(b);
    if (ids.has(b.id)) throw new Error('Boundary identities must be unique.');
    ids.add(b.id);
  }
  const actorTicks = new Set<string>();
  for (const a of content.actions ?? []) {
    const unit = content.units.find((u) => u.id === a.unitId),
      tick = `${a.unitId}:${a.offsetMs}`;
    if (!unit || unit.category === 'unknown')
      throw new Error(
        'Choose a placed friendly or hostile actor. Unknown entities remain stationary.',
      );
    if (ids.has(a.id) || (a.offsetMs != null && actorTicks.has(tick)))
      throw new Error(
        'Use unique action identities and only one movement start per actor at each tick.',
      );
    if (
      !withinScenarioExtent(
        a.destination.longitudeDeg,
        a.destination.latitudeDeg,
      )
    )
      throw new Error(
        'Script destination must be within the local 5 km extent.',
      );
    ids.add(a.id);
    if (a.offsetMs != null) actorTicks.add(tick);
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
const boundaryRevision = ajv.compile({
  $defs: boundarySchema.$defs,
  $ref: '#/$defs/ScenarioRevision',
});
const boundaryReceipt = ajv.compile({
  $defs: boundarySchema.$defs,
  $ref: '#/$defs/ScenarioReceipt',
});
const revisionShape = decoder<ScenarioRevision>('ScenarioRevision');
const scheduledRevision = ajv.compile({
  $defs: scheduledSchema.$defs,
  $ref: '#/$defs/ScenarioRevision',
});
const scheduledReceipt = ajv.compile({
  $defs: scheduledSchema.$defs,
  $ref: '#/$defs/ScenarioReceipt',
});
const d3aRevision = ajv.compile({
  $defs: d3aSchema.$defs,
  $ref: '#/$defs/ScenarioRevision',
});
const d3aReceipt = ajv.compile({
  $defs: d3aSchema.$defs,
  $ref: '#/$defs/ScenarioReceipt',
});
export function decodeScenarioRevision(value: unknown) {
  const result = revisionShape(value);
  if (result.schemaVersion === '1.3' && !d3aRevision(value))
    throw new Error('Invalid legacy revision.');
  if (result.schemaVersion === '1.0' && !legacyRevision(value))
    throw new Error('Invalid legacy scenario revision.');
  if (result.schemaVersion === '1.1' && !boundaryRevision(value))
    throw new Error('Invalid boundary scenario revision.');
  if (result.schemaVersion === '1.2' && !scheduledRevision(value))
    throw new Error('Invalid scheduled legacy revision.');
  if (
    result.schemaVersion !==
    (result.content.units.some((u) => u.profileId)
      ? '1.4'
      : result.content.scheduleRuleVersion === 'local-schedule-v2'
        ? '1.3'
        : result.content.actions != null
          ? '1.2'
          : result.content.boundaries == null
            ? '1.0'
            : '1.1')
  )
    throw new Error('Scenario version disagrees with content.');
  contentIntegrity(result.content);
  return result;
}
const receiptShape = decoder<ScenarioReceipt>('ScenarioReceipt');
export function decodeScenarioReceipt(value: unknown) {
  const result = receiptShape(value);
  if (result.schemaVersion === '1.3' && !d3aReceipt(value))
    throw new Error('Invalid legacy receipt.');
  if (result.schemaVersion === '1.0' && !legacyReceipt(value))
    throw new Error('Invalid legacy scenario receipt.');
  if (result.schemaVersion === '1.1' && !boundaryReceipt(value))
    throw new Error('Invalid boundary scenario receipt.');
  if (result.schemaVersion === '1.2' && !scheduledReceipt(value))
    throw new Error('Invalid scheduled legacy receipt.');
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
