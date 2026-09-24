from datetime import datetime, timezone

from app.domain.models import WorldFrame


def _age_seconds(frame: WorldFrame, timestamp: str) -> float:
    end = datetime.strptime(frame.effective_at, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    start = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    return max(0.0, (end - start).total_seconds())


def build_context(frame: WorldFrame) -> dict:
    """Build a bounded canonical snapshot. Free-text extensions never enter the prompt."""
    entities = []
    for entity in sorted(frame.entities.values(), key=lambda item: item.id)[:80]:
        track = next((item for item in frame.tracks.values() if item.entity_id == entity.id), None)
        row = {
            "id": entity.id,
            "affiliation": entity.affiliation,
            "condition": entity.condition,
            "presence": entity.presence,
            "kind": entity.kind,
            "classificationCode": entity.classification.code if entity.classification else None,
        }
        if track:
            row["track"] = {
                "id": track.id,
                "state": track.state,
                "sourceId": track.source.id,
                "sourceMode": track.source.mode,
                "ageSeconds": round(_age_seconds(frame, track.latest.timestamp), 3),
                "position": {
                    "longitudeDeg": track.latest.position.longitude_deg,
                    "latitudeDeg": track.latest.position.latitude_deg,
                    "altitudeMetres": track.latest.position.altitude.metres,
                    "altitudeReference": track.latest.position.altitude.reference,
                },
                "velocity": track.latest.velocity.model_dump(by_alias=True) if track.latest.velocity else None,
                "confidence": track.latest.confidence,
            }
        entities.append(row)
    return {
        "mission": {
            "id": frame.mission.id,
            "name": frame.mission.name,
            "domain": frame.mission.domain,
            "lifecycle": frame.mission.lifecycle,
        },
        "frame": {
            "id": frame.frame_id,
            "sequence": frame.sequence,
            "effectiveAt": frame.effective_at,
            "recordedAt": frame.recorded_at,
        },
        "counts": {
            "entities": len(frame.entities),
            "tracks": len(frame.tracks),
            "assets": len(frame.assets),
            "sensors": len(frame.sensors),
            "tasks": len(frame.tasks),
            "eventsIncluded": len(frame.recent_events),
        },
        "entities": entities,
        "assets": [
            {"id": item.id, "entityId": item.entity_id, "availability": item.availability,
             "capabilityCodes": item.capability_codes, "taskIds": item.task_ids}
            for item in sorted(frame.assets.values(), key=lambda item: item.id)[:80]
        ],
        "sensors": [
            {"id": item.id, "entityId": item.entity_id, "modality": item.modality, "status": item.status}
            for item in sorted(frame.sensors.values(), key=lambda item: item.id)[:40]
        ],
        "tasks": [
            {"id": item.id, "type": item.type, "status": item.status, "assetIds": item.asset_ids,
             "subjectEntityIds": item.subject_entity_ids, "zoneIds": item.zone_ids}
            for item in sorted(frame.tasks.values(), key=lambda item: item.id)[:60]
        ],
        "events": [
            {"id": item.id, "sequence": item.sequence, "type": item.type, "severity": item.severity,
             "effectiveAt": item.effective_at, "entityIds": item.entity_ids,
             "taskIds": item.task_ids, "sourceId": item.source.id}
            for item in frame.recent_events[-50:]
        ],
        "limitations": [
            "Only the committed frame and its bounded recent events are supplied.",
            "Absence from this snapshot is not evidence that an object does not exist.",
            "No prediction, terrain clearance, intent, or authorization is supplied.",
            "Entity labels and arbitrary extension fields are excluded as untrusted text.",
        ],
    }

