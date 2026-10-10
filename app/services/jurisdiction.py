"""Jurisdiction lookup: which civic agency owns a complaint at a given point.

Delhi-NCR enforcement is split across ~20 agencies (MCD zones, NDMC,
Cantonment Board, DDA, neighbouring state authorities) with no unified
public geofence API. This module ships a curated set of locality
centroids + radii (app/data/localities.json) as a simplified stand-in —
good enough to route a demo complaint correctly, not a substitute for
official ward/zone GeoJSON in production (see the note in that file).
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "localities.json"

EARTH_RADIUS_KM = 6371.0


@dataclass
class Locality:
    id: str
    name: str
    lat: float
    lon: float
    radius_km: float
    agency: str
    agency_type: str
    state: str
    schools: list[dict]
    hospitals: list[dict]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _load_localities() -> list[Locality]:
    raw = json.loads(DATA_PATH.read_text())
    return [
        Locality(
            id=loc["id"],
            name=loc["name"],
            lat=loc["lat"],
            lon=loc["lon"],
            radius_km=loc["radius_km"],
            agency=loc["agency"],
            agency_type=loc["agency_type"],
            state=loc["state"],
            schools=loc.get("schools", []),
            hospitals=loc.get("hospitals", []),
        )
        for loc in raw["localities"]
    ]


_LOCALITIES = _load_localities()


def find_jurisdiction(lat: float, lon: float) -> dict:
    """Return the nearest locality, with distance and whether the point falls
    inside its defined radius (in_zone=False means 'nearest, but outside any
    curated zone' — still routed there as a best-effort fallback)."""
    nearest: Optional[Locality] = None
    nearest_dist = math.inf
    for loc in _LOCALITIES:
        dist = haversine_km(lat, lon, loc.lat, loc.lon)
        if dist < nearest_dist:
            nearest_dist = dist
            nearest = loc

    if nearest is None:
        return {
            "locality_id": None,
            "locality_name": None,
            "agency": "Unknown",
            "agency_type": "Unknown",
            "state": "Unknown",
            "distance_km": None,
            "in_zone": False,
        }

    return {
        "locality_id": nearest.id,
        "locality_name": nearest.name,
        "agency": nearest.agency,
        "agency_type": nearest.agency_type,
        "state": nearest.state,
        "distance_km": round(nearest_dist, 2),
        "in_zone": nearest_dist <= nearest.radius_km,
    }


def get_locality(locality_id: str) -> Optional[Locality]:
    for loc in _LOCALITIES:
        if loc.id == locality_id:
            return loc
    return None


def all_localities() -> list[Locality]:
    return list(_LOCALITIES)
