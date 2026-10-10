"""Duplicate merging and hotspot clustering for incidents.

Two distinct jobs, both spatial:
1. `find_duplicate` — on a new report, check nearby *open* incidents of the
   same category within a time window, so ten people reporting the same
   fire become one incident with ten witnesses instead of ten tickets.
   A tight distance threshold (GPS noise is usually <50m) with a simple
   nearest-match is more predictable for a live demo than full clustering.
2. `cluster_hotspots` — across a larger incident history, runs real DBSCAN
   (haversine metric) to find organic repeat-offender hotspots for the
   public scoreboard, independent of the curated locality list.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import numpy as np
from sklearn.cluster import DBSCAN

from .jurisdiction import haversine_km

DUPLICATE_RADIUS_KM = 0.15  # ~150m: tight enough to avoid merging genuinely separate sites
DUPLICATE_WINDOW_HOURS = 48

EARTH_RADIUS_KM = 6371.0


def find_duplicate(
    lat: float,
    lon: float,
    timestamp: datetime,
    category: str,
    open_incidents: list[dict],
) -> Optional[str]:
    """open_incidents: [{"id", "lat", "lon", "category", "created_at" (datetime), ...}].
    Returns the id of the best-matching open incident to merge into, or None."""
    best_id = None
    best_dist = DUPLICATE_RADIUS_KM
    cutoff = timestamp - timedelta(hours=DUPLICATE_WINDOW_HOURS)

    for inc in open_incidents:
        if inc["category"] != category:
            continue
        if inc["created_at"] < cutoff:
            continue
        dist = haversine_km(lat, lon, inc["lat"], inc["lon"])
        if dist < best_dist:
            best_dist = dist
            best_id = inc["id"]

    return best_id


def cluster_hotspots(incidents: list[dict], eps_km: float = 0.3, min_samples: int = 3) -> list[dict]:
    """incidents: [{"id", "lat", "lon", ...}, ...]. Returns one entry per
    cluster with at least `min_samples` incidents, sorted by size descending.
    Points that don't belong to any cluster (DBSCAN label -1) are dropped —
    a hotspot is by definition a repeated location, not a one-off."""
    if len(incidents) < min_samples:
        return []

    coords_rad = np.radians([[inc["lat"], inc["lon"]] for inc in incidents])
    eps_rad = eps_km / EARTH_RADIUS_KM

    labels = DBSCAN(eps=eps_rad, min_samples=min_samples, metric="haversine").fit_predict(coords_rad)

    clusters: dict[int, list[dict]] = {}
    for inc, label in zip(incidents, labels):
        if label == -1:
            continue
        clusters.setdefault(label, []).append(inc)

    hotspots = []
    for members in clusters.values():
        lats = [m["lat"] for m in members]
        lons = [m["lon"] for m in members]
        hotspots.append(
            {
                "centroid_lat": round(sum(lats) / len(lats), 5),
                "centroid_lon": round(sum(lons) / len(lons), 5),
                "incident_count": len(members),
                "incident_ids": [m["id"] for m in members],
            }
        )

    hotspots.sort(key=lambda h: -h["incident_count"])
    return hotspots
