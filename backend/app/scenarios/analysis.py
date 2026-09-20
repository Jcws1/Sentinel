"""Bounded pure saved-scenario analysis; never owns a database or a live world."""
import asyncio
import hashlib
import json
import time
from collections import OrderedDict

from app.commands.kinematics import cruise_speed, STEP_SECONDS
from app.commands.scheduler import nominal_plan, nominal_steps, scenario_issues as script_issues
from app.commands.template import TEMPLATE
from app.commands.unit_profiles import profile
from app.commands.zone_rules import scenario_issues
from app.scenarios.contracts import ScenarioContent
from app.world.serialization import canonical

RULE_VERSION = "saved-scenario-analysis-v1"
MAX_ENTRIES = 8
MAX_BYTES = 2 * 1024 * 1024
ANALYSIS_BATCH_SECONDS = .002


def analysis_key(revision):
    # Revision includes its verified content hash and all authoritative content.
    # Profile/default inputs and an explicit rule version cover the pure rules.
    inputs = dict(revision=json.loads(canonical(revision)), ruleVersion=RULE_VERSION,
                  profiles={u.profile_id: profile(u.profile_id) for u in revision.content.units if u.profile_id},
                  defaultSpeedMps=cruise_speed(TEMPLATE), stepSeconds=STEP_SECONDS)
    return hashlib.sha256(canonical(inputs).encode("utf-8")).hexdigest()


def analyze(content):
    plan = nominal_plan(content)
    return dict(plan=plan, issues=scenario_issues(content) + script_issues(content, plan))


async def analyze_text(text):
    # A private complete saved snapshot owns the nominal state. Yield between
    # nominal ticks so real durable ticks never contend with a CPU worker for
    # the interpreter during SQLite/compression calls that release the GIL.
    content = ScenarioContent.model_validate_json(text)
    steps = nominal_steps(content)
    deadline = time.monotonic() + ANALYSIS_BATCH_SECONDS
    while True:
        try:
            next(steps)
        except StopIteration as finished:
            plan = finished.value
            break
        if time.monotonic() >= deadline:
            await asyncio.sleep(0)
            deadline = time.monotonic() + ANALYSIS_BATCH_SECONDS
    return canonical(dict(plan=plan, issues=scenario_issues(content) + script_issues(content, plan)))


class AnalysisCache:
    def __init__(self):
        self._cache = OrderedDict()
        self._bytes = 0
        self._gate = asyncio.Lock()

    async def get(self, revision):
        key = analysis_key(revision)
        async with self._gate:
            if key in self._cache:
                self._cache.move_to_end(key)
                return json.loads(self._cache[key])
            # One complete analysis at a time, with cooperative cancellation.
            # Failed/cancelled computations never populate the cache.
            text = await analyze_text(canonical(revision.content))
            size = len(text.encode("utf-8"))
            if size <= MAX_BYTES:
                while self._cache and (len(self._cache) >= MAX_ENTRIES or self._bytes + size > MAX_BYTES):
                    _, evicted = self._cache.popitem(last=False)
                    self._bytes -= len(evicted.encode("utf-8"))
                self._cache[key] = text
                self._bytes += size
            return json.loads(text)

    async def close(self):
        async with self._gate:
            self._cache.clear()
            self._bytes = 0
