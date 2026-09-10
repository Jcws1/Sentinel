import { compile } from 'json-schema-to-typescript';
import {readFile,writeFile} from 'node:fs/promises';
const schema=JSON.parse(await readFile('../../../contracts/sentinel/world.schema.json','utf8'));
// Generator consumes draft-07 tuple syntax; persisted authority remains 2020-12.
function normalize(value){
  if(!value||typeof value!=='object')return;
  if(value.prefixItems){value.items=value.prefixItems;value.additionalItems=false;delete value.prefixItems;}
  if(value.title && value.type!=='object')delete value.title;
  Object.values(value).forEach(normalize);
}
normalize(schema);
// Pydantic JsonValue emits {}: valid for JSON, but too broad as a TS type.
schema.$defs.JsonValue={tsType:'null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }'};
await writeFile('../../../contracts/sentinel/world.generated.d.ts',await compile(schema,'WorldFrame',{
  bannerComment:'/* Generated from backend/drafts/domain.py via world.schema.json. Phase 0 draft; do not edit. */',
  unreachableDefinitions:true,
}));
