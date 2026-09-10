"""Reproducible Phase 0 structural schemas/fixtures; deliberately no resolver."""
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'contracts/simulation'
TS = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'

def obj(properties, **extra):
    return dict(type='object', properties=properties, required=list(properties), additionalProperties=False, **extra)

def num(lo, hi, integer=False):
    return dict(type='integer' if integer else 'number', minimum=lo, maximum=hi)

def arr(items, **extra):
    return dict(type='array', items=items, **extra)

def ref(name):
    return {'$ref': '#/$defs/' + name}

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def main():
    identifier = dict(type='string', minLength=1, maxLength=128, pattern=r'^[!-~](?:[ -~]*[!-~])?$')
    drone_id = dict(type='string', minLength=1, maxLength=128, pattern=r'^[ -~]+$')
    nonempty = dict(type='string', minLength=1)
    timestamp = dict(type='string', pattern=TS, format='date-time')
    klass = dict(enum=['I', 'II', 'III', 'UNKNOWN'])
    defs = dict(identifier=identifier, droneId=drone_id, timestamp=timestamp,
                altitude=num(-100, 20000), droneClass=klass,
                evidence=dict(enum=['NOTIONAL', 'PUBLIC_PARTIAL', 'VALIDATED']))
    defs['drone'] = obj(dict(drone_id=ref('droneId'), longitude_deg=num(-180,180), latitude_deg=num(-90,90),
        altitude_m=ref('altitude'), **{'class':ref('droneClass')}, team=dict(enum=['RED','BLUE','NEUTRAL','UNKNOWN']),
        health=num(0,100,True), status=dict(enum=['ACTIVE','DISABLED','REMOVED'])))
    defs['drone']['allOf'] = [{
        'if': {'properties': {'status': {'const':'ACTIVE'}}},
        'then': {'properties': {'health': num(1,100,True)}},
        'else': {'properties': {'health': {'const':0}}}}]
    defs['rule'] = obj(dict(actor_class=ref('droneClass'), subject_class=ref('droneClass'), probability=num(0,1), health_delta=num(-100,-1,True)))
    position = dict(type='array', prefixItems=[num(-180,180),num(-90,90)], items=False, minItems=2, maxItems=2)
    req = obj(dict(schema_version={'const':'1.0'}, mission_id=ref('identifier'),
        command=obj(dict(command_id=ref('identifier'), action=dict(enum=['START','HOLD','RESUME','ABORT']),
            issued_at=ref('timestamp'), execute_at=ref('timestamp'), source_mode=dict(enum=['SIMULATED','REPLAY']))),
        area=obj(dict(area_id=ref('identifier'), polygon=arr(position,minItems=4,maxItems=101),
            min_altitude_m=ref('altitude'),max_altitude_m=ref('altitude'))),
        resolution=obj(dict(interaction_radius_m=num(.1,10000), location_grid_deg=dict(enum=[.0001,.0005,.001]))),
        calibration_profile=obj(dict(profile_id=nonempty,version=nonempty,evidence_status=ref('evidence'),source_summary=nonempty,rules=arr(ref('rule')))),
        samples_by_timestamp=dict(type='object',propertyNames=ref('timestamp'),additionalProperties=arr(ref('drone'),maxItems=10000))))
    req['allOf'] = [{'if': {'properties': {'command': {'properties': {'action': {'enum':['START','RESUME']}}}}},
                     'then': {'properties': {'samples_by_timestamp': {'minProperties':1,'maxProperties':10000}}}}]
    req.update({'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'urn:sentinel:simulation:v1:request','$defs':defs,
        '$comment':'Structural subset only. See compatibility-decisions.md for semantic requirements and open policies.'})
    save(DEST/'v1.request.schema.json',req)
    effect = obj(dict(actor_drone_id=ref('droneId'),subject_drone_id=ref('droneId'),probability=num(0,1),draw=num(0,1),applied={'type':'boolean'},health_delta=num(-100,0,True)))
    effect['allOf']=[{'if':{'properties':{'applied':{'const':False}}},'then':{'properties':{'health_delta':{'const':0}}},'else':{'properties':{'health_delta':num(-100,-1,True)}}}]
    interaction = obj(dict(interaction_id=dict(type='string',pattern='^[a-f0-9]{64}$'),location_id=nonempty,
        red_drone_id=ref('droneId'),blue_drone_id=ref('droneId'),separation_m={'type':'number','minimum':0},
        outcome=dict(enum=['NO_EFFECT','RED_EFFECT','BLUE_EFFECT','MUTUAL_EFFECT']),effects=arr(effect,minItems=2,maxItems=2)))
    health=obj(dict(drone_id=ref('droneId'),health_before=num(0,100,True),health_after=num(0,100,True),status_after=dict(enum=['ACTIVE','DISABLED','REMOVED']),state_discontinuity={'type':'boolean'}))
    health['allOf']=[{'if':{'properties':{'status_after':{'const':'ACTIVE'}}},'then':{'properties':{'health_after':num(1,100,True)}},'else':{'properties':{'health_after':{'const':0}}}}]
    nullable={'type':['string','null']}
    response=obj(dict(schema_version={'const':'1.0'},mission_id=ref('identifier'),
        command_ack=obj(dict(command_id=ref('identifier'),status=dict(enum=['ACCEPTED','SUCCEEDED','REJECTED']),run_status=dict(enum=['RUNNING','HELD','ABORTED','FAILED']),error_code=nullable,error_path=nullable,error_message=nullable)),
        calibration=obj(dict(profile_id=nonempty,version=nonempty,evidence_status=ref('evidence'))),
        results_by_timestamp=dict(type='object',propertyNames=ref('timestamp'),additionalProperties=obj(dict(interactions=arr(interaction),drone_health=arr(health))))))
    response.update({'$schema':req['$schema'],'$id':'urn:sentinel:simulation:v1:response','$defs':{k:defs[k] for k in ['identifier','droneId','timestamp','evidence']},'$comment':req['$comment']})
    save(DEST/'v1.response.schema.json',response)
    source=(ROOT/'docs/RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md').read_text(encoding='utf-8')
    golden_req,golden_res=[json.loads(x) for x in re.findall(r'```json\s*(.*?)```',source,re.S)]
    cases=[]
    def fixture(name,value,schema_valid,kind='request',note='',semantic='not-evaluated'):
        save(DEST/'fixtures'/f'{name}.json',value)
        cases.append(dict(file=f'{name}.json',kind=kind,schemaValid=schema_valid,semantic=semantic,note=note))
    fixture('golden.request',golden_req,True,note='Unchanged parsed JSON from source §7',semantic='confirmed-valid-input')
    fixture('golden.response',golden_res,True,'response','Unchanged published output; no Phase 0 resolver')
    t=next(iter(golden_req['samples_by_timestamp']))
    empty=copy.deepcopy(golden_req); empty['samples_by_timestamp'][t]=[]
    fixture('empty-snapshot.request',empty,True,semantic='confirmed-valid-input')
    hold=copy.deepcopy(golden_req); hold['command']['action']='HOLD'; hold['command']['command_id']='CMD-HOLD'; hold['samples_by_timestamp']={}
    fixture('hold.request',hold,True,note='Requires prior running run')
    mixed=copy.deepcopy(golden_req)
    mixed['samples_by_timestamp'][t]=[dict(golden_req['samples_by_timestamp'][t][0],drone_id='N-1',team='NEUTRAL'),dict(golden_req['samples_by_timestamp'][t][0],drone_id='U-1',team='UNKNOWN',health=0,status='REMOVED')]
    fixture('neutral-removed.request',mixed,True,note='No opposing pairs; removed preservation C11')
    for name,mutate in [
        ('invalid-live',lambda x:x['command'].update(source_mode='LIVE')),
        ('invalid-unknown-field',lambda x:x.update(unexpected=True)),
        ('invalid-null',lambda x:x['resolution'].update(interaction_radius_m=None)),
        ('invalid-active-zero',lambda x:x['samples_by_timestamp'][t][0].update(health=0)),
        ('invalid-probability',lambda x:x['calibration_profile']['rules'][0].update(probability=1.1)),
        ('invalid-positive-delta',lambda x:x['calibration_profile']['rules'][0].update(health_delta=1)),
        ('invalid-coordinate',lambda x:x['samples_by_timestamp'][t][0].update(latitude_deg=91)),
        ('invalid-offset',lambda x:x['command'].update(issued_at='2026-09-06T00:00:00.000+00:00'))]:
        value=copy.deepcopy(golden_req);mutate(value);fixture(name+'.request',value,False,semantic='invalid')
    for name,mutate,note in [
        ('unclosed-ring',lambda x:x['area']['polygon'].__setitem__(-1,[103.81,1.3]),'closure requires semantic validation'),
        ('duplicate-drone-id',lambda x:x['samples_by_timestamp'][t].append(copy.deepcopy(x['samples_by_timestamp'][t][0])),'duplicate identity requires semantic validation'),
        ('reversed-band',lambda x:x['area'].update(min_altitude_m=600),'lower <= upper requires semantic validation'),
        ('before-execute',lambda x:x['command'].update(execute_at='2026-09-06T00:00:02.000Z'),'timestamp lower bound requires semantic validation'),
        ('missing-rule',lambda x:x['calibration_profile'].update(rules=[]),'eligible golden pair lacks required rule')]:
        value=copy.deepcopy(golden_req);mutate(value);fixture(name+'.request',value,True,note=note,semantic='invalid-deferred')
    (DEST/'fixtures/malformed.request.txt').write_text('{"schema_version":',encoding='utf-8')
    (DEST/'fixtures/duplicate-key.request.txt').write_text('{"schema_version":"1.0","schema_version":"1.0"}',encoding='utf-8')
    save(DEST/'fixtures/manifest.json',{'cases':cases,'parserCases':[{'file':'malformed.request.txt','expected':'syntax-error-400'},{'file':'duplicate-key.request.txt','expected':'duplicate-key-reject','policy':'C09; HTTP code provisional'}]})

if __name__=='__main__':main()
