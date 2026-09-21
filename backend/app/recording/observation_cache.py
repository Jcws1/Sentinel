"""Bounded, disposable projections of fully validated immutable frame bytes.

History never needs to retain the full world graph for every observation. The
original reader validates each complete unknown stored frame on a cache miss,
including legacy adaptation and storage checksum verification. Exact bytes that
were already fully validated and successfully committed in this process can reuse
that proof. No proof survives restart. Entries contain
only canonical selected-entity observation bytes, and every read returns a fresh
model. This cache is not recording state and is never consulted by a writer.
"""
from collections import OrderedDict
from hashlib import sha256
import json
from threading import RLock
from typing import Literal

from app.domain.models import Id, Model, Sequence, Track, UtcInstant, WorldFrame
from app.recording.storage_codec import decode_text
from app.world.serialization import read_frame


MAX_CACHE_ENTRIES = 1000
MAX_CACHE_BYTES = 16 * 1024 * 1024
MAX_COMMITTED_PROOFS = 1000


def stored_digest(stored: str | bytes) -> bytes:
    return sha256(stored.encode("utf-8") if isinstance(stored, str) else stored).digest()


class ObservationFrame(Model):
    frame_id: Id
    sequence: Sequence
    effective_at: UtcInstant
    recorded_at: UtcInstant
    entity_presence: Literal["present", "unobserved", "removed"] | None
    tracks: dict[Id, Track]


def observe_frame(frame: WorldFrame, entity_id: str) -> ObservationFrame:
    entity = frame.entities.get(entity_id)
    return ObservationFrame(frame_id=frame.frame_id, sequence=frame.sequence,
        effective_at=frame.effective_at, recorded_at=frame.recorded_at,
        entity_presence=entity.presence if entity else None,
        tracks={key: track for key, track in frame.tracks.items() if track.entity_id == entity_id})


class HistoryFrameCache:
    def __init__(self):
        self._entries: OrderedDict[tuple[str, bytes], bytes] = OrderedDict()
        self._bytes = 0
        self._lock = RLock()
        # Successful current-process commits already validated the complete
        # canonical world. Only exact byte fingerprints are retained here.
        self._committed: OrderedDict[bytes, None] = OrderedDict()
        self._proof_lock = RLock()
        self.hits = 0
        self.misses = 0

    def remember_committed(self, digests):
        # Called only after SQL COMMIT by the full-validation writer boundary.
        # This short metadata lock is independent of expensive history decoding.
        with self._proof_lock:
            for digest in digests:
                self._committed[digest] = None
                self._committed.move_to_end(digest)
            while len(self._committed) > MAX_COMMITTED_PROOFS:
                self._committed.popitem(last=False)

    def _was_committed(self, digest):
        with self._proof_lock:
            return digest in self._committed

    @staticmethod
    def _project_committed(text, entity_id):
        # The entire canonical payload matched a successful full-validation
        # commit. Still validate the selected projection; no untrusted raw world
        # or mutable model can enter through this path.
        value = json.loads(text)
        entity = value["entities"].get(entity_id)
        return ObservationFrame.model_validate_json(json.dumps(dict(
            frameId=value["frameId"], sequence=value["sequence"], effectiveAt=value["effectiveAt"],
            recordedAt=value["recordedAt"], entityPresence=entity["presence"] if entity else None,
            tracks={key: track for key, track in value["tracks"].items() if track["entityId"] == entity_id})))

    def read(self, stored: str | bytes, entity_id: str) -> ObservationFrame:
        # Exact stored bytes include mission, recording, epoch, frame and sequence.
        # Even a changed/corrupt row under the same frame ID cannot reuse a hit.
        identity = (entity_id, stored_digest(stored))
        # This is a separate cache lock, never the repository/writer lock. It also
        # avoids duplicate validation when overlapping bounded reads arrive.
        with self._lock:
            value = self._entries.get(identity)
            if value is not None:
                self.hits += 1
                self._entries.move_to_end(identity)
            else:
                self.misses += 1
                text = decode_text(stored)  # Envelope checks apply even to proven bytes.
                projected = (self._project_committed(text, entity_id) if self._was_committed(identity[1])
                             else observe_frame(read_frame(text), entity_id))
                value = projected.model_dump_json(by_alias=True).encode("utf-8")
                if len(value) <= MAX_CACHE_BYTES:
                    self._entries[identity] = value
                    self._bytes += len(value)
                    while len(self._entries) > MAX_CACHE_ENTRIES or self._bytes > MAX_CACHE_BYTES:
                        _, removed = self._entries.popitem(last=False)
                        self._bytes -= len(removed)
        return ObservationFrame.model_validate_json(value)

    def inspect(self) -> dict[str, int]:
        with self._lock, self._proof_lock:
            return {"entries": len(self._entries), "bytes": self._bytes, "hits": self.hits, "misses": self.misses,
                    "committed_proofs": len(self._committed)}

    def clear(self):
        with self._lock:
            self._entries.clear()
            self._bytes = 0
        with self._proof_lock:
            self._committed.clear()
