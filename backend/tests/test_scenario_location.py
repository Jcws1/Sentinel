"""Scenario-owned geometry and frozen compatibility; independent temporary stores."""
import asyncio
import json
import sys
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError
from app.commands.kinematics import geographic, metric, in_extent, distance
from app.commands.service import InteractiveService
from app.commands.contracts import CreateRunRequest
from app.commands.boundary_contracts import LocatedBoundaryMutation
from app.commands.live_boundaries import candidate
from app.commands.errors import CommandError
from app.domain.models import WorldFrame
from app.scenarios.contracts import ScenarioContent, ScenarioRevision, UnitPlacement
from app.scenarios.actions import ScriptDestination
from app.scenarios.boundaries import BoundaryDefinition
from app.scenarios.location import LocalGeometry
from app.scenarios.service import ScenarioService
from app.scenarios.review import ScenarioMotionPreset, ScenarioReview
from app.world.serialization import canonical, read_frame
from test_interactive import Harness, CREDENTIAL
from test_scenarios import write, run_request
from test_conductor import ready, selected
from test_movement import ticks
from test_direct_movement import direct, issue
from test_d4 import policy

sys.path.insert(0, str(Path(__file__).parents[2] / "scripts"))
from scenario_location_fixtures import scenario


def context(lon=151.1772, lat=-33.9461):
    return LocalGeometry.model_validate(dict(modelId="local-horizontal-v2", halfExtentMetres=5000,
        origin=dict(longitudeDeg=lon,latitudeDeg=lat)))


@pytest.mark.parametrize("lon,lat", [(103.85,1.29),(103.91,1.36),(151.1772,-33.9461),(-.1276,51.5072),(0,80),(0,-80)])
def test_inclusive_square_and_unsupported_footprints(lon,lat):
    geometry=context(lon,lat)
    for x,y in [(0,0),(5000,0),(-5000,0),(0,5000),(0,-5000),(5000,5000),(-5000,-5000)]:
        point=geographic(x,y,geometry)
        assert in_extent(point,geometry)
        assert metric(point,geometry) == pytest.approx((x,y),abs=.0001)
    for x,y in [(5000.001,0),(-5000.001,0),(0,5000.001),(0,-5000.001)]:
        assert not in_extent(geographic(x,y,geometry),geometry)


@pytest.mark.parametrize("lon,lat", [(0,80.001),(0,-80.001),(180,0),(-180,0),(179.99,80),(181,0),(float('nan'),0),(0,float('inf'))])
def test_unsupported_coordinates_rejected(lon,lat):
    with pytest.raises(ValidationError): context(lon,lat)


def test_parent_validation_and_strict_legacy_representations():
    data=scenario("Remote",151.1772,-33.9461)
    assert ScenarioContent.model_validate(data).local_geometry == context()
    for model, value in [(UnitPlacement,data["units"][0]),(ScriptDestination,data["actions"][0]["destination"]),(BoundaryDefinition,data["boundaries"][0])]:
        with pytest.raises(ValidationError): model.model_validate(value)
    for mutation in [lambda d:d.pop("localGeometry"), lambda d:d["localGeometry"].update(modelId="local-horizontal-v3"),
                     lambda d:d["localGeometry"].update(halfExtentMetres=6000), lambda d:d["localGeometry"]["origin"].update(longitudeDeg=0)]:
        invalid=deepcopy(data);mutation(invalid)
        with pytest.raises(ValidationError): ScenarioContent.model_validate(invalid)
    legacy=scenario("Default",103.85,1.29);legacy.pop("localGeometry")
    assert "localGeometry" not in canonical(ScenarioContent.model_validate(legacy))


@pytest.mark.parametrize("lon,lat,side",[(103.85,1.29,2),(103.91,1.36,2),(151.1772,-33.9461,2),(151.1772,-33.9461,20)])
def test_save_review_all_actors_move_frozen_revision_and_recorded_read(lon,lat,side):
    h=Harness()
    async def exercise():
        service=ScenarioService(h.authority,True)
        body=write(scenario("Located",lon,lat,side))
        receipt=await service.write(body);revision=receipt.result
        assert receipt.schema_version == revision.schema_version == "1.6"
        assert await service.write(body) == service.lookup(body.request_id)
        assert service.list().schema_version == "1.6"
        reference=run_request(revision)
        review=service.review(reference.scenario)
        assert review.can_run and review.schema_version == "1.6"
        creation=await h.service.create(reference); mid=creation.mission_id
        initial=h.authority.read(mid)
        assert initial.schema_version == "1.11" and initial.interactive.schema_version == "1.8"
        assert initial.interactive.local_geometry == context(lon,lat)
        assert initial.mission.reference_point.longitude_deg == lon
        assert h.service.status(mid,CREDENTIAL).schema_version == "1.8"
        subscription,sub=await h.authority.subscribe(mid)
        assert json.loads(subscription)["schemaVersion"] == "1.11"
        assert (await h.act(mid,"acquire")).accepted
        assert (await h.act(mid,"start")).accepted
        await ticks(h,3)
        moving=h.authority.read(mid)
        assert len(moving.tracks) == side*2
        for tid,t in moving.tracks.items():
            assert distance(json.loads(canonical(initial.tracks[tid].latest.position)),json.loads(canonical(t.latest.position)),moving) > 10
            assert t.latest.position.altitude == initial.tracks[tid].latest.position.altitude
        later=deepcopy(body.content.model_dump(by_alias=True,exclude_none=True))
        later["localGeometry"]["origin"]["longitudeDeg"] += .001
        revised=(await service.write(write(later,1),revision.definition_id)).result
        assert revised.revision==2 and service.get(revision.definition_id,1)==revision
        assert revised.content.units == revision.content.units
        assert h.authority.read(mid).interactive.local_geometry == initial.interactive.local_geometry
        assert (await h.act(mid,"pause")).accepted
        paused=h.authority.read(mid);await ticks(h,2)
        assert h.authority.read(mid).tracks == paused.tracks
        assert (await h.act(mid,"resume")).accepted
        await ticks(h,1)
        assert (await h.act(mid,"end")).accepted
        raw=h.repo.latest_text(mid)
        assert read_frame(raw).interactive.local_geometry == context(lon,lat)
        assert json.loads(h.repo.db.execute("SELECT revision_json FROM scenario_runs").fetchone()[0])["contentHash"] == revision.content_hash
        h.authority.unsubscribe(mid,sub)
    try: asyncio.run(exercise())
    finally: h.repo.close()


def test_remote_commands_geometry_mutation_guard_and_restart(tmp_path):
    h=Harness(tmp_path/"located.sqlite3")
    async def exercise():
        mid,revision,_=await ready(h,scenario("Remote commands",151.1772,-33.9461))
        await h.act(mid,"acquire");await h.act(mid,"start");await ticks(h,2)
        target=geographic(-1000,-1000,revision.content)
        request=direct(h,mid,longitude=target['longitudeDeg'],latitude=target['latitudeDeg'])
        assert not (await issue(h,mid,request)).accepted  # wrong v1 model
        request=direct(h,mid,order=2,longitude=target['longitudeDeg'],latitude=target['latitudeDeg'])
        request=request.model_copy(update={"direct":request.direct.model_copy(update={"model_id":"local-horizontal-v2"})})
        accepted=await issue(h,mid,request)
        assert accepted.accepted,accepted.message
        assert await issue(h,mid,request)==accepted
        await ticks(h,3)
        assert (await h.service.command(mid,await selected(h,mid,"stop",3),CREDENTIAL)).accepted
        zid=next(zid for zid,kind in h.authority.read(mid).boundary_rules.zones.items() if kind=="patrol")
        assert (await h.service.command(mid,await policy(h,mid,"patrol",4,boundary_id=zid),CREDENTIAL)).accepted
        await ticks(h,2)
        before=h.repo.latest_text(mid)
        def invalid(old):
            old["interactive"]["localGeometry"]["origin"]["longitudeDeg"]+=.001
            return old,[]
        with pytest.raises(ValueError,match="cannot change"):
            await h.authority.commit_source(mid,invalid)
        assert h.repo.latest_text(mid)==before
        h.service=InteractiveService(h.authority,True)
        await h.service.recover()
        frame=h.authority.read(mid)
        assert frame.interactive.state=="paused"
        assert frame.interactive.local_geometry==context()
        assert read_frame(h.repo.latest_text(mid)).interactive.local_geometry==context()
        await h.act(mid,"acquire");await h.act(mid,"end")
    try: asyncio.run(exercise())
    finally: h.repo.close()


def test_live_restricted_boundary_preserves_owning_metric_edge_tolerance():
    geometry = context(0,80)
    position = {**geographic(99.9995,0,geometry), "altitude":dict(metres=150,reference="ELLIPSOID",datumId="WGS84")}
    vertices = [list(geographic(x,y,geometry).values()) for x,y in [(100,-20),(140,-20),(140,20),(100,20)]]
    frame = dict(interactive=dict(localGeometry=geometry.model_dump(by_alias=True),runId="run",sourceId="source",capabilities=["boundary-edit"]),
        mission=dict(id="mission",zoneIds=[]),boundaryRules=dict(zones={}),zones={},
        entities={"unit":dict(id="unit",label="Edge unit",presence="present",provenance=dict(source=dict(id="source")))},
        tracks={"track":dict(entityId="unit",state="tracking",source=dict(id="source",kind="simulation",mode="simulated"),latest=dict(position=position))},
        effectiveAt="2026-09-19T00:00:00.000Z",recordedAt="2026-09-19T00:00:00.000Z")
    change = LocatedBoundaryMutation.model_validate(dict(expectedRevision=0,operation="upsert",boundaryId="run:boundary:area",
        definition=dict(id="area",name="Near edge",type="restricted",vertices=vertices)))
    original = deepcopy(frame)
    with pytest.raises(CommandError, match="inside/on"):
        candidate(frame,change)
    assert frame == original
    frame["tracks"]["track"]["latest"]["position"].update(geographic(99.998,0,geometry))
    assert candidate(frame,change)[1] == 1


def test_legacy_world_rejects_new_geometry_even_when_null():
    h=Harness()
    async def exercise():
        created=await h.service.create(CreateRunRequest(creation_id="old-null-guard",template_id="singapore-local-v2"))
        raw=h.repo.latest_text(created.mission_id)
        value=json.loads(raw)
        assert (value["schemaVersion"],value["interactive"]["schemaVersion"]) == ("1.10","1.7")
        assert read_frame(raw).interactive.local_geometry is None
        value["interactive"]["localGeometry"]=None
        with pytest.raises(ValidationError,match="Legacy runs"):
            read_frame(json.dumps(value))
        assert h.repo.latest_text(created.mission_id) == raw
        await h.act(created.mission_id,"acquire");await h.act(created.mission_id,"end")
    try: asyncio.run(exercise())
    finally: h.repo.close()


def test_legacy_saved_revision_review_omits_new_geometry_and_rejects_explicit_null():
    h=Harness()
    async def exercise():
        data=scenario("Historical default",103.85,1.29)
        data.pop("localGeometry")
        service=ScenarioService(h.authority,True)
        request=write(data)
        receipt=await service.write(request)
        review=service.review(run_request(receipt.result).scenario)
        assert review.can_run and review.schema_version == "1.4"
        assert review.motion_preset.model_id == "local-horizontal-v1"
        assert "localGeometry" not in canonical(review)
        assert ScenarioReview.model_validate(review) == review
        malformed=review.motion_preset.model_dump(by_alias=True,exclude_none=True)
        malformed["localGeometry"]=None
        with pytest.raises(ValidationError,match="Legacy review"):
            ScenarioMotionPreset.model_validate(malformed)
        assert await service.write(request) == receipt
    try: asyncio.run(exercise())
    finally: h.repo.close()


@pytest.mark.parametrize("latitude",[-33.9461,64.13,80])
def test_remote_intercept_outcome_is_atomic_persistent_and_height_preserving(latitude):
    h=Harness()
    async def exercise():
        data=scenario("Located outcome",0,latitude,1)
        data["actions"]=[]
        for i,u in enumerate(data["units"]):
            u["position"].update(geographic(i*30,0,data))
            u["position"]["altitude"]["metres"]=150.125
        mid,_,_=await ready(h,data)
        await h.act(mid,"acquire");await h.act(mid,"start")
        request=await policy(h,mid,"intercept",1)
        receipt=await h.service.command(mid,request,CREDENTIAL)
        assert receipt.accepted
        assert await h.service.command(mid,request,CREDENTIAL) == receipt
        await ticks(h,20)
        lost=h.authority.read(mid)
        assert len(lost.fleet_behavior.outcomes)==1
        outcome=lost.fleet_behavior.outcomes[0]
        assert outcome.committed_sequence == outcome.input_sequence+1
        assert all(e.condition=="non-operational" for e in lost.entities.values())
        assert all(a.availability=="unavailable" for a in lost.assets.values())
        assert all(t.latest.position.altitude.metres==150.125 and t.latest.velocity.speed_mps==0 for t in lost.tracks.values())
        positions={k:t.latest.position for k,t in lost.tracks.items()}
        h.service=InteractiveService(h.authority,True);await h.service.recover()
        await h.act(mid,"acquire");await h.act(mid,"resume");await ticks(h,3)
        assert {k:t.latest.position for k,t in h.authority.read(mid).tracks.items()} == positions
        assert h.authority.read(mid).fleet_behavior.outcomes == lost.fleet_behavior.outcomes
        await h.act(mid,"end")
        assert read_frame(h.repo.latest_text(mid)).interactive.local_geometry == context(0,latitude)
    try: asyncio.run(exercise())
    finally: h.repo.close()
