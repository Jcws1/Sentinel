"""Read-only, bounded operational audit over the existing journal and receipts.

Recording time orders the audit; source/effective time is retained separately.
The immutable frame and receipt rowid ceiling survive every page/filter request.
No latest checkpoint is used to rewrite an earlier event's state.
"""
import json
from collections import Counter
from datetime import timedelta
from typing import Literal

from pydantic import Field, model_validator

from app.domain.base import Model, Id, UtcInstant, Sequence
from app.recording.history import instant
from app.world.serialization import read_frame
from app.simulation.analytics import simulation_audit

MAX_SUMMARY_ROWS = 20000


def _search_forms(text: str) -> tuple[str, ...]:
    # Preserve raw JSON searches and accept original displayed text without
    # requiring operators to escape quotes/backslashes. Historical JSON may
    # encode Unicode as ASCII escapes. Common ASCII/empty queries remain one
    # predicate; neither recorded bytes nor original identities are changed.
    return tuple(dict.fromkeys((text,
                               json.dumps(text, ensure_ascii=False)[1:-1],
                               json.dumps(text, ensure_ascii=True)[1:-1])))


class AuditQuery(Model):
    frame_id: Id
    from_at: UtcInstant
    to_at: UtcInstant
    search: str = Field(default="", max_length=200)
    kind: Literal["all", "event", "request"] = "all"
    after: str | None = Field(default=None, max_length=2048)
    receipt_ceiling: int | None = Field(default=None, ge=0, le=9007199254740991)
    limit: int = Field(default=50, ge=1, le=100)
    include_summary: bool = True

    @model_validator(mode="after")
    def range_order(self):
        if not 0 <= (instant(self.to_at) - instant(self.from_at)).total_seconds() <= 86400:
            raise ValueError("Audit range must be ordered and at most 24 hours")
        if self.after and self.receipt_ceiling is None:
            raise ValueError("Pagination requires the original receipt ceiling")
        return self


class AuditRow(Model):
    id: str
    identity: str = Field(min_length=1, max_length=256)
    kind: Literal["event", "request"]
    sequence: Sequence
    type: str
    state: str | None = None
    command_id: str | None = Field(default=None, min_length=1, max_length=256)
    recorded_at: UtcInstant
    effective_at: UtcInstant | None = None
    entity_ids: list[Id] = Field(default_factory=list)
    outcome: str | None = None
    affected_entity_ids: list[Id] = Field(default_factory=list)
    detail: str


class AuditBucket(Model):
    from_at: UtcInstant
    to_at: UtcInstant
    events: int
    requests: int
    outcomes: int


class AuditSummary(Model):
    inspected_rows: int
    complete: bool
    through_recorded_at: UtcInstant | None = None
    event_counts: dict[str, int]
    request_states: dict[str, int]
    outcome_counts: dict[str, int]
    affected_entities: int
    buckets: list[AuditBucket]


class AuditPage(Model):
    schema_version: Literal["1.0"] = "1.0"
    mission_id: Id
    recording_id: Id
    frame_id: Id
    through_sequence: Sequence
    through_recorded_at: UtcInstant
    source_at: UtcInstant
    from_at: UtcInstant
    to_at: UtcInstant
    receipt_ceiling: int
    rows: list[AuditRow] = Field(max_length=100)
    next_after: str | None = None
    summary: AuditSummary | None = None


class AnalyticsContracts(Model):
    query: AuditQuery
    page: AuditPage


def audit_row(raw):
    value = json.loads(raw["body"])
    if raw["kind"] == "request":
        entities = {m["entityId"] for key in ("memberOutcomes", "controlOutcomes", "behaviorOutcomes")
                    for m in value.get(key, []) if "entityId" in m}
        return AuditRow(id=f'request:{raw["seq"]}', identity=value["requestId"], kind="request", sequence=raw["seq"],
                        type=value["operation"], state="accepted" if value["accepted"] else "rejected",
                        command_id=value["requestId"], recorded_at=raw["at"], entity_ids=sorted(entities),
                        detail=f'{value["code"]}: {value["message"]}')
    ext = value.get("extensions", {})
    state = None
    command = None
    for namespace in ("sentinel.interactive", "sentinel.movement", "sentinel.script", "sentinel.behavior", "sentinel.outcome"):
        detail = ext.get(namespace, {})
        command = command or detail.get("commandId") or detail.get("requestId")
        state = state or detail.get("state")
    if state is None and value["type"].startswith("movement."):
        state = value["type"].split(".", 1)[1]
    outcome = "SIMULATED_MUTUAL_LOSS" if value["type"] == "demo.simulated-engagement" else None
    affected = value.get("entityIds", []) if outcome else []
    extra = simulation_audit(value)
    return AuditRow(id=f'event:{raw["seq"]}', identity=extra.get("identity", value["id"]), kind=extra.get("kind", "event"),
                    sequence=raw["seq"], type=value["type"], state=extra.get("state", state),
                    command_id=extra.get("command_id", command), recorded_at=raw["at"], effective_at=value["effectiveAt"],
                    entity_ids=value.get("entityIds", []), outcome=extra.get("outcome", outcome),
                    affected_entity_ids=extra.get("affected_entity_ids", affected),
                    detail=json.dumps(ext, ensure_ascii=False, separators=(",", ":")))


def summarize(rows, query, complete):
    events, requests, outcomes, affected = Counter(), Counter(), Counter(), set()
    start, end = instant(query.from_at), instant(query.to_at)
    bucket_count = min(12, max(1, int((end-start).total_seconds()*1000)))
    width = max(.001, (end - start).total_seconds() / bucket_count)
    buckets = [AuditBucket(from_at=(start + timedelta(seconds=i * width)).isoformat(timespec="milliseconds") + "Z",
                           to_at=(min(end, start + timedelta(seconds=(i + 1) * width))).isoformat(timespec="milliseconds") + "Z",
                           events=0, requests=0, outcomes=0) for i in range(bucket_count)]
    for row in rows:
        b = buckets[min(len(buckets)-1, int((instant(row.recorded_at)-start).total_seconds() / width))]
        if row.kind == "request":
            requests[row.state or "unknown"] += 1
            buckets[buckets.index(b)] = b.model_copy(update={"requests": b.requests + 1})
        else:
            events[row.type] += 1
            buckets[buckets.index(b)] = b.model_copy(update={"events": b.events + 1, "outcomes": b.outcomes + bool(row.outcome)})
        if row.outcome:
            outcomes[row.outcome] += 1
            affected.update(row.affected_entity_ids)
    return AuditSummary(inspected_rows=len(rows), complete=complete, through_recorded_at=rows[-1].recorded_at if rows else None,
                        event_counts=dict(events), request_states=dict(requests), outcome_counts=dict(outcomes),
                        affected_entities=len(affected), buckets=buckets)


def read_audit(repository, mission_id, query):
    # No schema installation, checkpoint writes, cadence changes or second writer.
    with repository._lock:
        text = repository.text_at(mission_id, query.frame_id)
        if text is None:
            raise KeyError("Committed frame not found")
        frame = read_frame(text)
        if query.to_at > frame.recorded_at:
            raise ValueError("Range ends after the committed recording cutoff")
        maximum = repository.db.execute("SELECT COALESCE(MAX(rowid),0) FROM command_receipts WHERE mission_id=? AND json_extract(receipt_json,'$.recordedAt')<=?", (mission_id, frame.recorded_at)).fetchone()[0]
        ceiling = min(query.receipt_ceiling, maximum) if query.receipt_ceiling is not None else maximum
        # Event frame sequence differs from event sequence. Join the original frame.
        sql = """WITH audit AS (
          SELECT 'event' AS kind,e.sequence AS seq,e.recorded_at AS at,e.event_json AS body
          FROM events e JOIN frames f ON f.frame_id=e.frame_id
          WHERE e.recording_id=? AND f.sequence<=?
          UNION ALL
          SELECT 'request',c.rowid,json_extract(c.receipt_json,'$.recordedAt'),c.receipt_json
          FROM command_receipts c WHERE c.mission_id=? AND c.rowid<=?
            AND (json_extract(c.receipt_json,'$.sequence') IS NULL OR json_extract(c.receipt_json,'$.sequence')<=?)
        ) SELECT * FROM audit WHERE at>=? AND at<=? AND (?='all' OR
          CASE WHEN json_extract(body,'$.type')='simulation.v1.command-received' THEN 'request' ELSE kind END=?)"""
        search_forms = _search_forms(query.search)
        sql += ' AND (' + ' OR '.join('instr(lower(body),lower(?))>0' for _ in search_forms) + ')'
        params = [frame.recording_id, frame.sequence, mission_id, ceiling, frame.sequence,
                  query.from_at, query.to_at, query.kind, query.kind, *search_forms]
        sample = None
        if query.include_summary:
            sample = repository.db.execute(sql + ' ORDER BY at,kind,seq LIMIT ?', (*params, MAX_SUMMARY_ROWS + 1)).fetchall()
        page_sql = sql
        if query.after:
            try:
                at, kind, sequence = json.loads(query.after)
                if not isinstance(at, str) or kind not in ("event", "request") or not isinstance(sequence, int):
                    raise ValueError()
                instant(at)
            except (ValueError, TypeError):
                raise ValueError("Invalid audit cursor") from None
            page_sql += ' AND (at,kind,seq)>(?,?,?)'
            params.extend((at, kind, sequence))
        raw = repository.db.execute(page_sql + ' ORDER BY at,kind,seq LIMIT ?', (*params, query.limit + 1)).fetchall()
    # Projection/aggregation does not hold the writer's connection lock.
    summary = summarize([audit_row(r) for r in sample[:MAX_SUMMARY_ROWS]], query, len(sample) <= MAX_SUMMARY_ROWS) if sample is not None else None
    rows = raw[:query.limit]
    cursor = json.dumps([rows[-1]["at"], rows[-1]["kind"], rows[-1]["seq"]], separators=(",", ":")) if len(raw) > query.limit else None
    return AuditPage(mission_id=mission_id, recording_id=frame.recording_id, frame_id=frame.frame_id,
                     through_sequence=frame.sequence, through_recorded_at=frame.recorded_at, source_at=frame.effective_at,
                     from_at=query.from_at, to_at=query.to_at, receipt_ceiling=ceiling,
                     rows=[audit_row(r) for r in rows], next_after=cursor, summary=summary)
