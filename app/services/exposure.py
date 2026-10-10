"""Downwind exposure scoring: is this incident's smoke/dust drifting toward
a school or hospital right now?

Wind comes from Open-Meteo (free, no API key). The plume itself is modelled
as a simple triangular downwind cone, not a full Gaussian dispersion
simulation — a deliberate, documented simplification for a screening tool,
not a dispersion study. Nearby schools/hospitals come from the same curated
locality data used for jurisdiction routing.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Optional

import requests

from .jurisdiction import haversine_km

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "localities.json"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

MAX_EXPOSURE_RADIUS_KM = 3.0
PLUME_HALF_ANGLE_DEG = 30.0


def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial compass bearing from point 1 to point 2, in degrees (0=N, 90=E)."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_lambda = math.radians(lon2 - lon1)
    x = math.sin(d_lambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lambda)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _angular_diff(a: float, b: float) -> float:
    diff = abs(a - b) % 360
    return min(diff, 360 - diff)


def _all_sites() -> list[dict]:
    raw = json.loads(DATA_PATH.read_text())
    sites = []
    for loc in raw["localities"]:
        for s in loc.get("schools", []):
            sites.append({"type": "school", "name": s["name"], "lat": s["lat"], "lon": s["lon"]})
        for h in loc.get("hospitals", []):
            sites.append({"type": "hospital", "name": h["name"], "lat": h["lat"], "lon": h["lon"]})
    return sites


_SITES = _all_sites()


def fetch_wind(lat: float, lon: float) -> Optional[dict]:
    """Returns {speed_ms, direction_from_deg} — direction the wind is blowing
    FROM (meteorological convention) — or None if the API is unreachable."""
    try:
        resp = requests.get(
            OPEN_METEO_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "wind_speed_10m,wind_direction_10m",
                "wind_speed_unit": "ms",
            },
            timeout=6,
        )
        resp.raise_for_status()
        current = resp.json()["current"]
        return {
            "speed_ms": current["wind_speed_10m"],
            "direction_from_deg": current["wind_direction_10m"],
            "observed_at": current["time"],
        }
    except (requests.RequestException, KeyError, ValueError):
        return None


def score_exposure(lat: float, lon: float) -> dict:
    """Score how many sensitive sites (schools/hospitals) are downwind of
    (lat, lon) right now, and how exposed each one is."""
    wind = fetch_wind(lat, lon)
    if wind is None:
        return {
            "wind": None,
            "downwind_sites": [],
            "exposure_score": 0.0,
            "note": "Wind data unavailable — exposure could not be scored.",
        }

    downwind_bearing = (wind["direction_from_deg"] + 180) % 360

    affected = []
    for site in _SITES:
        dist_km = haversine_km(lat, lon, site["lat"], site["lon"])
        if dist_km > MAX_EXPOSURE_RADIUS_KM:
            continue
        bearing_to_site = _bearing_deg(lat, lon, site["lat"], site["lon"])
        angle_off = _angular_diff(bearing_to_site, downwind_bearing)
        if angle_off > PLUME_HALF_ANGLE_DEG:
            continue
        distance_weight = max(0.0, 1 - dist_km / MAX_EXPOSURE_RADIUS_KM)
        angle_weight = max(0.0, 1 - angle_off / PLUME_HALF_ANGLE_DEG)
        site_weight = distance_weight * angle_weight
        affected.append(
            {
                "type": site["type"],
                "name": site["name"],
                "distance_km": round(dist_km, 2),
                "angle_off_plume_deg": round(angle_off, 1),
                "weight": round(site_weight, 3),
            }
        )

    affected.sort(key=lambda s: -s["weight"])
    # Hospitals weighted slightly higher than schools: patients are often
    # more acutely vulnerable to a short-term smoke spike than students.
    exposure_score = sum(s["weight"] * (1.3 if s["type"] == "hospital" else 1.0) for s in affected)

    return {
        "wind": wind,
        "downwind_bearing_deg": round(downwind_bearing, 1),
        "downwind_sites": affected,
        "exposure_score": round(exposure_score, 3),
        "note": None,
    }
