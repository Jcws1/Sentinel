import { compile } from 'json-schema-to-typescript';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { format, resolveConfig } from 'prettier';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractDir = resolve(frontend, '../contracts/sentinel/v1.14');
const files = [
  'world.schema.json',
  'stream.schema.json',
  'mission-list.schema.json',
  'observed-history.schema.json',
  'interactive.schema.json',
  'scenarios.schema.json',
  'scenario-review.schema.json',
];
const schemas = await Promise.all(
  files.map(async (name) =>
    JSON.parse(await readFile(resolve(contractDir, name), 'utf8')),
  ),
);
const definitions = {};
for (const schema of schemas) {
  for (const [name, definition] of Object.entries(schema.$defs ?? {})) {
    if (
      definitions[name] &&
      JSON.stringify(definitions[name]) !== JSON.stringify(definition)
    ) {
      throw new Error(`Conflicting generated backend definition: ${name}`);
    }
    definitions[name] = definition;
  }
}
const world = structuredClone(schemas[0]);
const catalog = structuredClone(schemas[2]);
delete world.$defs;
delete catalog.$defs;
delete world.$schema;
delete catalog.$schema;
definitions.WorldFrame = world;
definitions.MissionList = catalog;
const observedHistory = structuredClone(schemas[3]);
delete observedHistory.$defs;
delete observedHistory.$schema;
definitions.ObservedHistory = observedHistory;
const stream = structuredClone(schemas[1]);
delete stream.$defs;
delete stream.$schema;
const schema = {
  title: 'BackendContracts',
  type: 'object',
  additionalProperties: false,
  required: ['stream', 'catalog'],
  properties: { stream, catalog: { $ref: '#/$defs/MissionList' } },
  $defs: definitions,
};

// This generator accepts draft-07 tuples. Only its in-memory input is adapted;
// exported backend schemas stay JSON Schema 2020-12 for Ajv and external users.
function normalize(value) {
  if (!value || typeof value !== 'object') return;
  if (value.prefixItems) {
    value.items = value.prefixItems;
    value.additionalItems = false;
    delete value.prefixItems;
  }
  if (typeof value.title === 'string' && value.type !== 'object')
    delete value.title;
  Object.values(value).forEach(normalize);
}
normalize(schema);
schema.$defs.JsonValue = {
  tsType:
    'null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }',
};
const fingerprint = createHash('sha256')
  .update(JSON.stringify(schemas))
  .digest('hex');
const generated = await compile(schema, 'BackendContracts', {
  unreachableDefinitions: true,
  bannerComment: `/* Generated from backend contract package v1.14 JSON Schemas; do not edit.\n * Source SHA-256: ${fingerprint}\n */`,
  style: { singleQuote: true, semi: true },
});
const target = resolve(frontend, 'src/contracts/generated.ts');
const output = await format(generated, {
  ...(await resolveConfig(target)),
  filepath: target,
});
if (process.argv.includes('--check')) {
  const existing = await readFile(target, 'utf8');
  if (existing !== output)
    throw new Error(
      'Generated TypeScript contracts have drifted. Run npm run contracts:generate.',
    );
  process.stdout.write('Generated frontend contracts match backend schemas.\n');
} else {
  await writeFile(target, output);
  process.stdout.write('Generated frontend contracts.\n');
}
