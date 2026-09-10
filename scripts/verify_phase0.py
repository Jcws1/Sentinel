"""Phase 0 structural checks, fixture fidelity and architecture-boundary smoke tests.

This is not the compatibility semantic validator or simulator conformance suite.
"""
import copy
import hashlib
import json
import re
import sys
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import ValidationError

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend/drafts'))
from domain import Altitude, Position3D, Entity, Track, Asset, Mission, WorldFrame
checks=[]
def check(name, condition):
    assert condition,name
    checks.append(name)
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def rejects(call):
    try:call()
    except (ValidationError,ValueError,json.JSONDecodeError):return True
    return False

for name,expected in {
    'Sentinel_v3.md':'a581602ca82e3faad054f7b97a778700c8a7c19912bb2a5ebb6d1556a1565d64',
    'RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md':'9d7d882015ea5fce198d37ef948444647d555a0fadd6086a6761ab13fd0240e8',
}.items():check('source hash '+name,hashlib.sha256((ROOT/'docs'/name).read_bytes()).hexdigest()==expected)
base=ROOT/'contracts/simulation'
validators={}
for kind in ['request','response']:
    schema=read(base/f'v1.{kind}.schema.json');Draft202012Validator.check_schema(schema)
    validators[kind]=Draft202012Validator(schema,format_checker=FormatChecker())
    checks.append(kind+' schema compiles')
manifest=read(base/'fixtures/manifest.json')
for case in manifest['cases']:
    valid=validators[case['kind']].is_valid(read(base/'fixtures'/case['file']))
    check(case['file']+': structural expectation',valid==case['schemaValid'])
def unique_pairs(pairs):
    result={}
    for key,value in pairs:
        if key in result:raise ValueError('duplicate JSON key')
        result[key]=value
    return result
for case in manifest['parserCases']:
    text=(base/'fixtures'/case['file']).read_text()
    check(case['file'],rejects(lambda:json.loads(text,object_pairs_hook=unique_pairs)))
source=(ROOT/'docs/RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md').read_text(encoding='utf-8')
golden=[json.loads(s) for s in re.findall(r'```json\s*(.*?)```',source,re.S)]
check('published golden request unchanged',golden[0]==read(base/'fixtures/golden.request.json'))
check('published golden response unchanged',golden[1]==read(base/'fixtures/golden.response.json'))
v=validators['request'];sample=copy.deepcopy(golden[0]);t=next(iter(sample['samples_by_timestamp']))
sample['samples_by_timestamp'][t][0]['drone_id']=' padded '
check('literal drone ID padding allowed',v.is_valid(sample))
sample['mission_id']=' padded '
check('mission ID padding rejected',not v.is_valid(sample))
sample=copy.deepcopy(golden[0]);sample['samples_by_timestamp'][t][0]['unexpected']=True
check('nested unknown rejected',not v.is_valid(sample))
sample=copy.deepcopy(golden[0]);sample['command']['issued_at']='2026-02-30T00:00:00.000Z'
check('invalid calendar date rejected with format checker',not v.is_valid(sample))
sample=copy.deepcopy(golden[0]);sample['samples_by_timestamp']={}
check('START needs timestamps',not v.is_valid(sample))
sample['command']['action']='HOLD'
check('HOLD allows no timestamps',v.is_valid(sample))

for cls in [Entity,Track,Asset,Mission,WorldFrame]:
    check(cls.__name__+' has no universal simulation fields',not {'health','team','drone_class','red_drone_id'} & cls.model_fields.keys())
check('altitude reference mandatory',rejects(lambda:Altitude(metres=100)))
check('nonfinite altitude rejected',rejects(lambda:Altitude(metres=float('nan'),reference='MSL')))
check('invalid internal coordinate rejected',rejects(lambda:Position3D(longitude_deg=181,latitude_deg=0,altitude=Altitude(metres=1,reference='MSL'))))
check('source MSL retained',Altitude(metres=100,reference='MSL').model_dump(exclude_none=True)=={'metres':100.0,'reference':'MSL'})
schema=read(ROOT/'contracts/sentinel/world.schema.json');Draft202012Validator.check_schema(schema)
expected=WorldFrame.model_json_schema(by_alias=True)
check('domain schema generated without drift',all(schema[k]==value for k,value in expected.items()))
check('only Track stores latest position','latest' in Track.model_fields and 'position' not in Entity.model_fields and 'position' not in Asset.model_fields)
report={'scope':'Phase 0 structural validation only; semantic-invalid fixtures intentionally pass JSON Schema','passed':len(checks),'checks':checks,'semanticValidatorBuilt':False,'simulatorBuilt':False}
(ROOT/'contracts/phase0-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
