import { compile } from 'json-schema-to-typescript';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
const schemaFile = new URL(
  '../../contracts/sentinel/world.schema.json',
  import.meta.url,
);
const outputFile = new URL(
  '../../contracts/sentinel/world.generated.d.ts',
  import.meta.url,
);
const schema = JSON.parse(await readFile(schemaFile, 'utf8'));
// Generator consumes draft-07 tuple syntax; persisted authority remains 2020-12.
function normalize(value) {
  if (!value || typeof value !== 'object') return;
  if (value.prefixItems) {
    value.items = value.prefixItems;
    value.additionalItems = false;
    delete value.prefixItems;
  }
  if (value.title && value.type !== 'object') delete value.title;
  Object.values(value).forEach(normalize);
}
normalize(schema);
// Pydantic JsonValue emits {}: valid for JSON, but too broad as a TS type.
schema.$defs.JsonValue = {
  tsType:
    'null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }',
};
const generated = await compile(schema, 'WorldFrame', {
  bannerComment:
    '/* Generated from backend/drafts/domain.py via world.schema.json. Phase 0 draft; do not edit. */',
  unreachableDefinitions: true,
});
if (process.argv.includes('--check')) {
  if ((await readFile(outputFile, 'utf8')) !== generated)
    throw Error('Foundation types differ from the frozen schema');
  console.log('Foundation types match the frozen schema.');
} else await writeFile(outputFile, generated);
