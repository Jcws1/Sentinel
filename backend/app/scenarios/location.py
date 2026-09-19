"""Explicit horizontal geometry; absent context is the frozen Singapore v1 model."""
from math import cos, degrees, radians
from typing import Literal
from pydantic import model_validator
from app.domain.base import Model, Longitude, Latitude

RADIUS = 6378137.0
LEGACY_ORIGIN = (103.85, 1.29)
HALF_EXTENT = 5000.0
ROUNDTRIP_TOLERANCE = 0.0001  # 0.1 mm; only v2 nine-decimal coordinate round trips.


class GeometryOrigin(Model):
    longitude_deg: Longitude
    latitude_deg: Latitude


class LocalGeometry(Model):
    model_id: Literal["local-horizontal-v2"]
    origin: GeometryOrigin
    half_extent_metres: Literal[5000]

    @model_validator(mode="after")
    def supported_footprint(self):
        lon, lat = self.origin.longitude_deg, self.origin.latitude_deg
        if abs(lat) > 80:
            raise ValueError("Scenario origin latitude must be between -80 and 80 degrees.")
        dx = degrees(HALF_EXTENT / (RADIUS * cos(radians(lat))))
        dy = degrees(HALF_EXTENT / RADIUS)
        if lon - dx < -180 or lon + dx > 180 or abs(lat) + dy > 85.051129:
            raise ValueError("The entire operating area must fit without crossing the date line or map latitude limits.")
        return self


def geometry_for(owner):
    """Accept a validated scenario, run or frame, without copying the world."""
    if owner is None or isinstance(owner, LocalGeometry):
        return owner
    if isinstance(owner, dict):
        if "modelId" in owner:
            if owner["modelId"] != "local-horizontal-v2":
                raise ValueError("Unsupported local geometry model")
            return owner
        return owner.get("localGeometry") or geometry_for(owner.get("interactive"))
    return getattr(owner, "local_geometry", None) or geometry_for(getattr(owner, "interactive", None))


def origin_for(owner=None):
    geometry = geometry_for(owner)
    if geometry is None:
        return LEGACY_ORIGIN
    if isinstance(geometry, LocalGeometry):
        return geometry.origin.longitude_deg, geometry.origin.latitude_deg
    return geometry["origin"]["longitudeDeg"], geometry["origin"]["latitudeDeg"]


def model_for(owner=None):
    return "local-horizontal-v2" if geometry_for(owner) is not None else "local-horizontal-v1"
