"""Explicit synthetic capacity fixture, served only by the opt-in test harness.

No operator database, supported interactive limit, production route or frozen
fixture is modified. The normal API/recording owners commit the test records.
"""
import copy
import sys
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.main import create_app
from app.domain.models import Mission
from app.missions.fixtures import fixture_source
from app.world.serialization import canonical
import json

app = create_app()
normal_lifespan = app.router.lifespan_context


@asynccontextmanager
async def synthetic_capacity(application):
    async with normal_lifespan(application):
        service = application.state.service
        at = service.clock()
        mid = "fixture-analytics-large"
        mission = Mission(id=mid, name="Synthetic analytics 10000", domain="synthetic-analytics-capacity",
                          lifecycle="completed", created_at=at, updated_at=at,
                          reference_point={"longitudeDeg":151.1772,"latitudeDeg":-33.9461,
                                           "altitude":{"reference":"ELLIPSOID","datumId":"WGS84","metres":0}},
                          extensions={"sentinel.fixture":{"description":"Synthetic capacity probe: 10000 entities and events; no effectiveness claim"}})
        await service.establish(mission)
        base, events = fixture_source("fixture-alpha", 0, at)
        entity = next(iter(base["entities"].values()))
        track = next(iter(base["tracks"].values()))
        base.update(mission=json.loads(canonical(mission)), effectiveAt=at, entities={}, tracks={}, assets={})
        for i in range(10000):
            eid, tid = f"large-{i:05}", f"large-track-{i:05}"
            e = copy.deepcopy(entity)
            e.update(id=eid, missionId=mid, label=f"Synthetic {i:05}", affiliation=("friendly","hostile","neutral","unknown")[i%4])
            e["provenance"].update(effectiveAt=at, recordedAt=at)
            t = copy.deepcopy(track)
            t.update(id=tid, entityId=eid, missionId=mid, historySeriesId=tid+"-series")
            t["latest"].update(timestamp=at, position={"longitudeDeg":151.1772+(i%100)*.0001,"latitudeDeg":-33.9461+(i//100)*.0001,"altitude":{"reference":"ELLIPSOID","datumId":"WGS84","metres":50+i%250}})
            base["entities"][eid]=e; base["tracks"][tid]=t
        event=events[0]
        event.update(effectiveAt=at, type="fixture.analytics-capacity")
        batch=[{**event,"extensions":{"sentinel.fixture":{"index":i,"label":"synthetic capacity"}}} for i in range(10000)]
        await service.commit_source(mid, lambda previous: (base, batch))
        yield


app.router.lifespan_context = synthetic_capacity
