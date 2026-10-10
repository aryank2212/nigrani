"""Live and offline Air Quality Index (AQI) data access.

Live path calls the WAQI (World Air Quality Index) public API, which is
token-gated. Offline path reads a bundled snapshot captured from aqicn.org
(CPCB / DPCC data) on 2026-10-10, so the app runs end-to-end with zero signup.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOT_PATH = DATA_DIR / "sample_snapshot.json"
WAQI_FEED_URL = "https://api.waqi.info/feed/geo:{lat};{lon}/"

_live_cache: dict[tuple[float, float], tuple[float, "Reading"]] = {}
_LIVE_CACHE_TTL_SECONDS = 300


@dataclass
class Reading:
    name: str
    aqi: int
    category: str
    dominant_pollutant: str
    pm25_2day_min: Optional[int]
    pm25_2day_max: Optional[int]
    temp_c: Optional[float]
    updated_local: str
    is_live: bool


def category_for_aqi(aqi: int) -> str:
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Moderate"
    if aqi <= 150:
        return "Unhealthy for Sensitive Groups"
    if aqi <= 200:
        return "Unhealthy"
    if aqi <= 300:
        return "Very Unhealthy"
    return "Hazardous"


def _load_snapshot() -> dict:
    with open(SNAPSHOT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _reading_from_snapshot(fallback_station_id: str) -> Reading:
    snapshot = _load_snapshot()
    s = snapshot["stations"][fallback_station_id]
    return Reading(
        name=s["name"],
        aqi=s["aqi"],
        category=s["category"],
        dominant_pollutant=s["dominant_pollutant"],
        pm25_2day_min=s.get("pm25_2day_min"),
        pm25_2day_max=s.get("pm25_2day_max"),
        temp_c=s.get("temp_c"),
        updated_local=s["updated_local"],
        is_live=False,
    )


def _fetch_live(lat: float, lon: float) -> Optional[Reading]:
    token = os.environ.get("WAQI_API_TOKEN", "").strip()
    if not token:
        return None

    cache_key = (round(lat, 3), round(lon, 3))
    cached = _live_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < _LIVE_CACHE_TTL_SECONDS:
        return cached[1]

    try:
        resp = requests.get(
            WAQI_FEED_URL.format(lat=lat, lon=lon),
            params={"token": token},
            timeout=6,
        )
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("status") != "ok":
            return None
        data = payload["data"]
        aqi = int(data.get("aqi"))
        reading = Reading(
            name=data.get("city", {}).get("name", "Live station"),
            aqi=aqi,
            category=category_for_aqi(aqi),
            dominant_pollutant=data.get("dominentpol", "pm25"),
            pm25_2day_min=None,
            pm25_2day_max=None,
            temp_c=(data.get("iaqi", {}).get("t", {}) or {}).get("v"),
            updated_local=data.get("time", {}).get("s", ""),
            is_live=True,
        )
        _live_cache[cache_key] = (time.time(), reading)
        return reading
    except (requests.RequestException, KeyError, ValueError, TypeError):
        return None


def get_reading(lat: float, lon: float, fallback_station_id: str) -> Reading:
    """Live reading nearest (lat, lon) if WAQI_API_TOKEN is set and reachable, else the bundled snapshot."""
    live = _fetch_live(lat, lon)
    if live is not None:
        return live
    return _reading_from_snapshot(fallback_station_id)
