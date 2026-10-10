import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import dedupe

NOW = datetime(2026, 10, 10, 12, 0, 0)


def test_finds_nearby_same_category_duplicate():
    open_incidents = [
        {"id": "a", "lat": 28.6000, "lon": 77.2000, "category": "garbage_burning", "created_at": NOW - timedelta(hours=2)},
    ]
    # ~15m away, same category, within window -> should match
    match = dedupe.find_duplicate(28.60013, 77.2000, NOW, "garbage_burning", open_incidents)
    assert match == "a"


def test_ignores_different_category():
    open_incidents = [
        {"id": "a", "lat": 28.6000, "lon": 77.2000, "category": "garbage_burning", "created_at": NOW - timedelta(hours=1)},
    ]
    match = dedupe.find_duplicate(28.60001, 77.2000, NOW, "construction_dust", open_incidents)
    assert match is None


def test_ignores_stale_incident_outside_window():
    open_incidents = [
        {"id": "a", "lat": 28.6000, "lon": 77.2000, "category": "garbage_burning", "created_at": NOW - timedelta(hours=72)},
    ]
    match = dedupe.find_duplicate(28.60001, 77.2000, NOW, "garbage_burning", open_incidents)
    assert match is None


def test_ignores_far_away_incident():
    open_incidents = [
        {"id": "a", "lat": 28.6000, "lon": 77.2000, "category": "garbage_burning", "created_at": NOW},
    ]
    # ~1km away -- well outside the 150m duplicate radius
    match = dedupe.find_duplicate(28.609, 77.2000, NOW, "garbage_burning", open_incidents)
    assert match is None


def test_cluster_hotspots_groups_tight_points_and_drops_outliers():
    incidents = [
        {"id": "1", "lat": 28.6000, "lon": 77.2000},
        {"id": "2", "lat": 28.6002, "lon": 77.2001},
        {"id": "3", "lat": 28.5999, "lon": 77.1999},
        {"id": "4", "lat": 29.5000, "lon": 78.5000},  # far outlier, alone
    ]
    hotspots = dedupe.cluster_hotspots(incidents, eps_km=0.3, min_samples=3)
    assert len(hotspots) == 1
    assert hotspots[0]["incident_count"] == 3
    assert set(hotspots[0]["incident_ids"]) == {"1", "2", "3"}


def test_cluster_hotspots_empty_below_min_samples():
    incidents = [
        {"id": "1", "lat": 28.6000, "lon": 77.2000},
        {"id": "2", "lat": 28.6001, "lon": 77.2001},
    ]
    assert dedupe.cluster_hotspots(incidents, min_samples=3) == []
