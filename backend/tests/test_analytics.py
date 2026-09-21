import asyncio
import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.missions.fixtures import seed_fixtures, advance_fixture
from app.missions.service import MissionService
from app.recording.sqlite_repository import RecordingRepository
from app.recording.analytics import AuditQuery, read_audit, summarize, AuditRow
from app.adapters.simulation_v1.projection import mission_identity


@pytest.fixture
def recorded():
    repo = RecordingRepository(":memory:")
    service = MissionService(repo)
    asyncio.run(seed_fixtures(service))
    yield repo, service, service.read("fixture-observations")
    repo.close()


def query(frame, **changes):
    return AuditQuery(frame_id=frame.frame_id, from_at=frame.recorded_at,
                      to_at=frame.recorded_at, **changes)


def test_audit_pagination_same_time_identity_and_immutable_anchor(recorded):
    repo, service, frame = recorded
    q = query(frame, limit=1)
    first = read_audit(repo, frame.mission.id, q)
    expected = [r.identity for r in read_audit(repo, frame.mission.id, query(frame, limit=100)).rows]
    actual = [r.identity for r in first.rows]
    cursor = first.next_after
    while cursor:
        page = read_audit(repo, frame.mission.id, q.model_copy(update={"after":cursor,"receipt_ceiling":first.receipt_ceiling}))
        actual.extend(r.identity for r in page.rows); cursor=page.next_after
    assert actual == expected and len(actual) == len(set(actual))
    before = first.model_dump_json()
    asyncio.run(advance_fixture(service, frame.mission.id, frame.sequence))
    assert read_audit(repo,frame.mission.id,q.model_copy(update={"receipt_ceiling":first.receipt_ceiling})).model_dump_json() == before
    with pytest.raises(KeyError): read_audit(repo,"fixture-alpha",q)


def test_receipt_ceiling_excludes_later_equal_time_and_no_future_sequence(recorded):
    repo, _, frame = recorded
    def insert(identity,sequence=None):
        body=dict(requestId=identity,operation="stop",accepted=False,code="CONTROL_REQUIRED",message="No control",recordedAt=frame.recorded_at)
        if sequence is not None: body['sequence']=sequence
        repo.db.execute('INSERT INTO command_receipts VALUES (?,?,?,?)',(frame.mission.id,identity,'{}',json.dumps(body)))
    insert("exact / ? request")
    initial = read_audit(repo,frame.mission.id,query(frame,kind="request"))
    assert [r.identity for r in initial.rows] == ["exact / ? request"]
    assert initial.summary.request_states == {"rejected":1}
    insert("late-same-clock"); insert("future-sequence",frame.sequence+1)
    frozen=read_audit(repo,frame.mission.id,query(frame,kind="request",receipt_ceiling=initial.receipt_ceiling))
    assert frozen.rows == initial.rows
    assert len(read_audit(repo,frame.mission.id,query(frame,kind="request")).rows)==2


def test_search_is_literal_and_summary_bound_does_not_truncate_pages(recorded,monkeypatch):
    repo,_,frame=recorded
    for i in range(7):
        body=dict(requestId=f"request-{i}%",operation="stop",accepted=False,code="X",message="Rejected",recordedAt=frame.recorded_at)
        repo.db.execute('INSERT INTO command_receipts VALUES (?,?,?,?)',(frame.mission.id,body['requestId'],'{}',json.dumps(body)))
    monkeypatch.setattr('app.recording.analytics.MAX_SUMMARY_ROWS',3)
    data=read_audit(repo,frame.mission.id,query(frame,kind='request',search='%'))
    assert len(data.rows)==7 and data.summary.inspected_rows==3 and not data.summary.complete
    empty=read_audit(repo,frame.mission.id,query(frame,search="' OR 1=1 --"))
    assert empty.rows==[] and empty.summary.complete


def test_external_retry_no_effect_simultaneous_pairs_and_cutoff(tmp_path):
    body=json.loads((Path(__file__).resolve().parents[2]/'contracts/simulation/fixtures/golden.request.json').read_text())
    with TestClient(create_app(str(tmp_path/'analytics.sqlite'),False)) as client:
        result=client.post('/api/simulation/v1/commands',json=body)
        assert result.status_code==200
        assert client.post('/api/simulation/v1/commands',json=body).json()==result.json()
        mid=mission_identity(body['mission_id'])
        world=client.get(f'/api/missions/{mid}/world').json()
        q=dict(frameId=world['frameId'],fromAt=world['mission']['createdAt'],toAt=world['recordedAt'])
        read=client.post(f'/api/missions/{mid}/audit-query',json=q)
        assert read.status_code==200,read.text
        data=read.json()
        assert [r['state'] for r in data['rows'] if 'state' in r]==['pending','completed']
        assert data['summary']['outcomeCounts']=={'MUTUAL_EFFECT':1}
        assert data['summary']['affectedEntities']==2
        assert data['summary']['requestStates']=={'pending':1}
        assert sum(b['outcomes'] for b in data['summary']['buckets'])==1
        assert data['rows'][1]['effectiveAt'] != data['rows'][1]['recordedAt']
        assert read.headers['cache-control']=='no-store'
        changed=copy.deepcopy(body);changed['command']['command_id']='hold';changed['command']['action']='HOLD';changed['samples_by_timestamp']={}
        assert client.post('/api/simulation/v1/commands',json=changed).status_code==200
        assert client.post(f'/api/missions/{mid}/audit-query',json={**q,'receiptCeiling':data['receiptCeiling']}).json()==data
        assert client.post('/api/missions/unknown/audit-query',json=q).status_code==404
        assert client.post(f'/api/missions/{mid}/audit-query',json={**q,'toAt':'2027-01-01T00:00:00.000Z'}).status_code==422


def test_outcomes_count_interactions_not_participants_and_preserve_no_effect():
    rows=[]
    for i,outcome in enumerate(['NO_EFFECT','MUTUAL_EFFECT','RED_EFFECT']):
        rows.append(AuditRow(id=str(i),identity=str(i),kind='event',sequence=i,type='simulation.v1.interaction',
            recorded_at='2026-09-10T00:00:00.000Z',outcome=outcome,affected_entity_ids=[] if i==0 else ['a','b'],detail=''))
    q=AuditQuery(frame_id='f',from_at='2026-09-10T00:00:00.000Z',to_at='2026-09-10T00:00:00.000Z')
    s=summarize(rows,q,True)
    assert s.outcome_counts=={'NO_EFFECT':1,'MUTUAL_EFFECT':1,'RED_EFFECT':1} and s.affected_entities==2
    assert len(s.buckets)==1 and s.buckets[0].outcomes==3


def test_actual_same_time_no_effect_pairs_opaque_identity_and_retry(tmp_path):
    body=json.loads((Path(__file__).resolve().parents[2]/'contracts/simulation/fixtures/golden.request.json').read_text())
    body['command']['command_id']='exact / ? identity'
    body['calibration_profile']['rules'][0]['probability']=0
    samples=next(iter(body['samples_by_timestamp'].values()))
    samples.append({**samples[1], 'drone_id':'BLUE-002','longitude_deg':103.8505})
    with TestClient(create_app(str(tmp_path/'no-effect.sqlite'),False)) as client:
        result=client.post('/api/simulation/v1/commands',json=body)
        assert result.status_code==200,result.text
        assert client.post('/api/simulation/v1/commands',json=body).json()==result.json()
        mid=mission_identity(body['mission_id']); world=client.get(f'/api/missions/{mid}/world').json()
        q=dict(frameId=world['frameId'],fromAt=world['mission']['createdAt'],toAt=world['recordedAt'],limit=1)
        data=client.post(f'/api/missions/{mid}/audit-query',json=q).json()
        assert data['summary']['outcomeCounts']=={'NO_EFFECT':2}
        assert data['summary']['affectedEntities']==0
        assert data['rows'][0]['identity']==body['command']['command_id']
        identities=[data['rows'][0]['id']]; cursor=data.get('nextAfter')
        while cursor:
            page=client.post(f'/api/missions/{mid}/audit-query',json={**q,'after':cursor,'receiptCeiling':data['receiptCeiling']}).json()
            identities.extend(r['id'] for r in page['rows']);cursor=page.get('nextAfter')
        assert len(identities)==4 and len(set(identities))==4


def test_audit_is_read_only_and_invalid_cursor_rejected(recorded):
    repo,_,frame=recorded
    changes=repo.db.total_changes; version=repo.db.execute('PRAGMA user_version').fetchone()[0]
    read_audit(repo,frame.mission.id,query(frame))
    assert repo.db.total_changes==changes
    assert repo.db.execute('PRAGMA user_version').fetchone()[0]==version
    for cursor in ['[]','{}','["bad","event",1]','["2026-09-10T00:00:00.000Z","other",1]']:
        with pytest.raises(ValueError):read_audit(repo,frame.mission.id,query(frame,after=cursor,receipt_ceiling=0))


@pytest.mark.parametrize('changes',[{'limit':101},{'limit':0},{'after':'cursor'}, {'search':'x'*201}, {'to_at':'2026-09-11T00:00:00.001Z'}])
def test_query_bounds(changes):
    values=dict(frame_id='f',from_at='2026-09-10T00:00:00.000Z',to_at='2026-09-10T00:00:00.000Z')
    with pytest.raises(ValueError): AuditQuery(**{**values,**changes})


@pytest.mark.parametrize('identity', [
    'REQUEST "ALPHA"', r'REQUEST\ALPHA', 'Ω-REQUEST-ABC', 'REQUEST%ALPHA', 'REQUEST_ALPHA',
], ids=['quote', 'backslash', 'unicode', 'percent', 'underscore'])
def test_original_request_identity_search_through_real_endpoints(identity):
    with TestClient(create_app(':memory:', False, demo_enabled=True)) as client:
        created = client.post('/api/interactive/runs', json={
            'creationId': 'literal-search-creation', 'templateId': 'singapore-local-v1',
        })
        assert created.status_code == 200 and created.json()['accepted'], created.text
        mission_id = created.json()['missionId']
        intent = client.post(f'/api/interactive/{mission_id}/intents', json={'action': 'acquire'})
        assert intent.status_code == 200, intent.text
        command = {'commandId': identity, 'holderId': 'literal-search-test', 'intent': intent.json()}
        headers = {'X-Sentinel-Control': 'f' * 43}
        route = f'/api/interactive/{mission_id}/commands'
        accepted = client.post(route, json=command, headers=headers)
        assert accepted.status_code == 200 and accepted.json()['accepted'], accepted.text
        assert accepted.json()['requestId'] == identity
        assert client.post(route, json=command, headers=headers).json() == accepted.json()
        frame = client.get(f'/api/missions/{mission_id}/world').json()
        anchor = dict(frameId=frame['frameId'], fromAt=frame['mission']['createdAt'],
                      toAt=frame['recordedAt'], kind='request')
        repository = client.app.state.service.repository
        stored = [tuple(row) for row in repository.db.execute('SELECT * FROM command_receipts')]
        changes = repository.db.total_changes
        # A-Z case folding must not alter other characters or the returned identity.
        ascii_lower = identity.translate(str.maketrans('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'))
        for term in (identity, ascii_lower):
            result = client.post(f'/api/missions/{mission_id}/audit-query', json={**anchor, 'search': term})
            assert result.status_code == 200, result.text
            page = result.json()
            assert [row['identity'] for row in page['rows']] == [identity]
            assert page['summary']['requestStates'] == {'accepted': 1}
            assert page['summary']['inspectedRows'] == 1 and page['summary']['complete']
            assert page.get('nextAfter') is None
        if identity.startswith('Ω'):
            different_case = client.post(f'/api/missions/{mission_id}/audit-query',
                                         json={**anchor, 'search': identity.replace('Ω', 'ω')})
            assert different_case.status_code == 200 and different_case.json()['rows'] == []
        assert repository.db.total_changes == changes
        assert [tuple(row) for row in repository.db.execute('SELECT * FROM command_receipts')] == stored


@pytest.mark.parametrize('ascii_encoding', [False, True], ids=['utf8-json', 'ascii-escaped-json'])
def test_search_preserves_historical_json_encodings_and_raw_queries(recorded, ascii_encoding):
    repository, _, frame = recorded
    identity = 'Ω request "exact" \\ 100%_'
    body = dict(requestId=identity, operation='stop', accepted=False, code='X',
                message='Original recorded detail', recordedAt=frame.recorded_at)
    raw = json.dumps(body, ensure_ascii=ascii_encoding)
    repository.db.execute('INSERT INTO command_receipts VALUES (?,?,?,?)',
                          (frame.mission.id, identity, '{}', raw))
    changes = repository.db.total_changes
    encoded_identity = json.dumps(identity, ensure_ascii=ascii_encoding)[1:-1]
    for term in (identity, encoded_identity, '"operation": "stop"', '100%_'):
        page = read_audit(repository, frame.mission.id, query(frame, kind='request', search=term))
        assert [row.identity for row in page.rows] == [identity]
        assert page.summary.request_states == {'rejected': 1}
    assert read_audit(repository, frame.mission.id,
                      query(frame, kind='request', search='100_')).rows == []
    assert read_audit(repository, frame.mission.id,
                      query(frame, kind='request', search='ω')).rows == []
    assert repository.db.total_changes == changes
    assert repository.db.execute('SELECT receipt_json FROM command_receipts WHERE command_id=?',
                                 (identity,)).fetchone()[0] == raw
