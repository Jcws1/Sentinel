"""Bounded observed series as known at an immutable committed frame.

No interpolation, prediction, arrival clock or simulation semantics. Revisions at
one frame-effective instant use highest commit sequence. Revisions of the same
track/source/series/sample instant also use highest sequence, without removing
missing-observation boundaries. A 30 s sample gap is a presentation break only.
"""
import json
from datetime import datetime, timedelta
from typing import Literal

from pydantic import Field

from app.domain.models import Model, Id, UtcInstant, Sequence, SourceRef, TrackSample, WorldFrame


MAX_FRAMES = 1000
MAX_POINTS = 2000
MAX_GAP_SECONDS = 30


class RecordedObservation(Model):
    frame_id: Id
    sequence: Sequence
    frame_effective_at: UtcInstant
    recorded_at: UtcInstant
    sample: TrackSample


class ObservedSegment(Model):
    track_id: Id
    history_series_id: Id
    source: SourceRef
    break_reason: Literal["window-start", "missing-observation", "source-change", "altitude-reference", "discontinuity", "time-regression", "observation-gap"]
    points: list[RecordedObservation] = Field(min_length=1, max_length=MAX_POINTS)


class ObservedHistory(Model):
    schema_version: Literal["1.0"]
    mission_id: Id
    entity_id: Id
    recording_id: Id
    stream_epoch: Id
    through_frame_id: Id
    through_sequence: Sequence
    through_at: UtcInstant
    from_at: UtcInstant
    window_seconds: int = Field(ge=5, le=300)
    max_gap_seconds: Literal[30] = MAX_GAP_SECONDS
    inspected_frames: int = Field(ge=0, le=MAX_FRAMES)
    truncated: bool
    segments: list[ObservedSegment] = Field(max_length=MAX_POINTS)


def source_key(track):
    return (track.id, track.history_series_id, json.dumps(track.source.model_dump(), sort_keys=True))


def instant(value):
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ")


def project_history(anchor: WorldFrame, entity_id: str, window_seconds: int, frame_texts: list[str], truncated: bool) -> ObservedHistory:
    start = (instant(anchor.effective_at) - timedelta(seconds=window_seconds)).isoformat(timespec="milliseconds") + "Z"
    # The repository supplies at most MAX_FRAMES newest effective instants. Frame
    # revisions retain deletion/staleness as well as positions.
    revisions = {}
    for text in frame_texts:
        frame = WorldFrame.model_validate_json(text)
        previous = revisions.get(frame.effective_at)
        if previous is None or previous.sequence < frame.sequence:
            revisions[frame.effective_at] = frame
    frames = sorted(revisions.values(), key=lambda f: (f.effective_at, f.sequence))
    winners = {}
    for frame in frames:
        for track in frame.tracks.values():
            if track.entity_id != entity_id:
                continue
            key = (*source_key(track), track.latest.timestamp)
            if key not in winners or winners[key][0].sequence < frame.sequence:
                winners[key] = (frame, track)

    segments = []
    current = {}
    prior = {}
    emitted = set()
    reasons = {}
    for frame in frames:
        entity = frame.entities.get(entity_id)
        tracks = {t.id: t for t in frame.tracks.values() if t.entity_id == entity_id}
        for tid in set(prior) | set(tracks):
            track = tracks.get(tid)
            if (entity is None or entity.presence != "present" or track is None or track.state != "tracking"
                    or not start <= track.latest.timestamp <= anchor.effective_at):
                current.pop(tid, None)
                prior.pop(tid, None)
                reasons[tid] = "missing-observation"
                continue
            key = (*source_key(track), track.latest.timestamp)
            winning_frame, winning_track = winners[key]
            sample = winning_track.latest
            identity = source_key(track)
            altitude = (sample.position.altitude.reference, sample.position.altitude.datum_id)
            previous = prior.get(tid)
            reason = reasons.get(tid, "window-start")
            if previous:
                old_identity, old_altitude, old_time = previous
                if identity != old_identity:
                    reason = "source-change"
                elif altitude != old_altitude:
                    reason = "altitude-reference"
                elif key in emitted:
                    continue  # One observation, even if repeated in many frames.
                elif sample.discontinuity:
                    reason = "discontinuity"
                elif sample.timestamp <= old_time:
                    reason = "time-regression"
                elif (instant(sample.timestamp) - instant(old_time)).total_seconds() > MAX_GAP_SECONDS:
                    reason = "observation-gap"
                else:
                    reason = None
            elif sample.discontinuity:
                reason = "discontinuity"
            if reason is not None:
                current.pop(tid, None)
            if key in emitted:
                # Reappearance of an unchanged old sample is not fresh motion.
                prior[tid] = (identity, altitude, sample.timestamp)
                continue
            emitted.add(key)
            if tid not in current:
                segment = ObservedSegment(track_id=tid, history_series_id=track.history_series_id,
                                          source=track.source, break_reason=reason or "missing-observation", points=[
                    RecordedObservation(frame_id=winning_frame.frame_id, sequence=winning_frame.sequence,
                                        frame_effective_at=winning_frame.effective_at, recorded_at=winning_frame.recorded_at, sample=sample)])
                segments.append(segment)
                current[tid] = segment
            else:
                current[tid].points.append(RecordedObservation(frame_id=winning_frame.frame_id, sequence=winning_frame.sequence,
                    frame_effective_at=winning_frame.effective_at, recorded_at=winning_frame.recorded_at, sample=sample))
            prior[tid] = (identity, altitude, sample.timestamp)
            reasons.pop(tid, None)

    segments.sort(key=lambda s: (s.points[0].sample.timestamp, s.track_id, source_key_for_segment(s)))
    # Return the newest bounded observations, retaining original segment borders.
    ranked = sorted((point for segment in segments for point in segment.points),
                    key=lambda p: (p.sample.timestamp, p.sequence, p.frame_id), reverse=True)
    retained = {id(point) for point in ranked[:MAX_POINTS]}
    bounded = []
    for segment in segments:
        points = [point for point in segment.points if id(point) in retained]
        if len(points) < len(segment.points):
            truncated = True
        if points:
            bounded.append(segment.model_copy(update={"points": points}))
    return ObservedHistory(schema_version="1.0", mission_id=anchor.mission.id, entity_id=entity_id,
        recording_id=anchor.recording_id, stream_epoch=anchor.stream_epoch, through_frame_id=anchor.frame_id,
        through_sequence=anchor.sequence, through_at=anchor.effective_at, from_at=start, window_seconds=window_seconds,
        inspected_frames=len(frame_texts), truncated=truncated, segments=bounded)


def source_key_for_segment(segment):
    return json.dumps(segment.source.model_dump(), sort_keys=True)
