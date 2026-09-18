"""Versioned, notional local-demo speeds. Profiles never confer authority."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Finite

UnitProfileId = Literal["hornet-10-v1", "sting-v1", "lancet-3-v1", "shahed-136-v1"]
PROFILE_VALUES = {
    "hornet-10-v1": ("Quadcopter / strike", "Wild Hornets 10-inch FPV", 80, 120,
        "https://wildhornets.com/en/fpv-drone-with-10-inch-propellers-analog"),
    "sting-v1": ("STING interceptor", "Wild Hornets STING", 170, 280,
        "https://wildhornets.com/en/sting-interceptor"),
    "lancet-3-v1": ("Lancet-3", "ZALA Lancet-3", 110, 110,
        "https://en.wikipedia.org/wiki/ZALA_Lancet"),
    "shahed-136-v1": ("Shahed-136", "HESA Shahed-136", 185, 185,
        "https://en.wikipedia.org/wiki/HESA_Shahed_136"),
}

def allowed_profile(profile_id, affiliation):
    return profile_id is None or profile_id in {
        "friendly": {"hornet-10-v1", "sting-v1"},
        "hostile": {"hornet-10-v1", "lancet-3-v1", "shahed-136-v1"},
    }.get(affiliation, set())

class UnitProfile(Model):
    id: UnitProfileId
    label: str
    variant: str
    cruise_mps: Finite = Field(gt=0)
    pursuit_mps: Finite = Field(gt=0)
    reference: str
    reference_date: Literal["2026-09-18"] = "2026-09-18"
    model: Literal["notional-unit-speed-v1"] = "notional-unit-speed-v1"

    @model_validator(mode="after")
    def frozen_values(self):
        label, variant, cruise, pursuit, reference = PROFILE_VALUES[self.id]
        if (self.label, self.variant, self.cruise_mps, self.pursuit_mps, self.reference) != (label, variant, cruise/3.6, pursuit/3.6, reference):
            raise ValueError("Versioned unit profile values changed")
        return self

def profile(profile_id):
    label, variant, cruise, pursuit, reference = PROFILE_VALUES[profile_id]
    return UnitProfile(id=profile_id, label=label, variant=variant, cruise_mps=cruise/3.6,
        pursuit_mps=pursuit/3.6, reference=reference).model_dump(by_alias=True)

def entity_speed(frame, entity_id, pursuit=False):
    from app.commands.kinematics import cruise_speed
    values = frame.get("unitProfiles", {}).get(entity_id)
    return values["pursuitMps" if pursuit else "cruiseMps"] if values else cruise_speed(frame["interactive"]["templateId"])

def placement_speed(unit):
    from app.commands.kinematics import cruise_speed
    return PROFILE_VALUES[unit.profile_id][2]/3.6 if unit.profile_id else cruise_speed("singapore-local-v2")
