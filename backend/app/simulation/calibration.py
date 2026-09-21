"""Read-only, explicitly configured provenance registry; not empirical inference.

No report is shipped or inferred from a profile's source_summary. Operators may
configure an existing reviewed artifact with the local registry schema below.
Accepted artifact bytes and their identity are frozen in the command journal.
"""
import hashlib
import json
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field
from app.domain.base import Model, UtcInstant
from app.simulation.validation import SimulationError, content_digest

NonEmpty = Annotated[str, Field(min_length=1)]
Checksum = Annotated[str, Field(pattern="^[0-9a-f]{64}$")]


class ReviewedCalibration(Model):
    schema_version: Literal["1.0"]
    profile_id: NonEmpty
    version: NonEmpty
    evidence_status: Literal["PUBLIC_PARTIAL", "VALIDATED"]
    profile_sha256: Checksum
    dataset: NonEmpty
    collection_dates: NonEmpty
    inclusion_exclusion_rules: NonEmpty
    class_mapping: NonEmpty
    missing_data_policy: NonEmpty
    sample_counts: dict[str, Annotated[int, Field(ge=0)]] = Field(min_length=1)
    estimator: NonEmpty
    confidence_intervals: NonEmpty
    geographic_operational_limits: NonEmpty
    reviewer: NonEmpty
    dataset_sha256: Checksum
    approval_date: UtcInstant


class CalibrationRegistry:
    def __init__(self, directory=None):
        self.directory = Path(directory).resolve() if directory else None

    def verify(self, profile):
        if profile["evidence_status"] == "NOTIONAL":
            return None
        # A content-addressed name never interpolates user-controlled paths.
        digest = content_digest(profile)
        path = self.directory / (digest + ".json") if self.directory else None
        try:
            if path is None:
                raise ValueError("No registry configured")
            raw = path.read_bytes()
            report = ReviewedCalibration.model_validate_json(raw)
            if (report.profile_id, report.version, report.evidence_status, report.profile_sha256) != (
                    profile["profile_id"], profile["version"], profile["evidence_status"], digest):
                raise ValueError("Report does not identify this exact profile")
        except (OSError, ValueError):
            raise SimulationError("CALIBRATION_REPORT_REQUIRED", "/calibration_profile/evidence_status",
                                  "This evidence status requires an exact, separately stored reviewed calibration artifact") from None
        return dict(artifactSha256=hashlib.sha256(raw).hexdigest(), report=json.loads(raw))
