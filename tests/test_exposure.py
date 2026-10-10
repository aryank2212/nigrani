import math
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import exposure


def test_bearing_north_and_east():
    # A point directly north should bear ~0deg; directly east ~90deg.
    north = exposure._bearing_deg(28.0, 77.0, 28.01, 77.0)
    east = exposure._bearing_deg(28.0, 77.0, 28.0, 77.01)
    assert -1 < north < 1
    assert 89 < east < 91


def test_angular_diff_wraps_correctly():
    assert exposure._angular_diff(350, 10) == 20
    assert exposure._angular_diff(10, 350) == 20
    assert exposure._angular_diff(0, 180) == 180


def test_site_downwind_is_picked_up():
    # Fake a school 1km due east of the complaint point.
    fake_sites = [{"type": "school", "name": "Test School", "lat": 28.0, "lon": 77.009}]
    # Wind blowing FROM the west (270deg) means it blows TOWARD the east (90deg) -> downwind hits the school.
    with patch.object(exposure, "_SITES", fake_sites), \
         patch.object(exposure, "fetch_wind", return_value={"speed_ms": 3.0, "direction_from_deg": 270, "observed_at": "now"}):
        result = exposure.score_exposure(28.0, 77.0)
    assert len(result["downwind_sites"]) == 1
    assert result["downwind_sites"][0]["name"] == "Test School"
    assert result["exposure_score"] > 0


def test_site_upwind_is_excluded():
    # Same school, but wind now blows FROM the east (90deg) -> toward the west -> school is upwind, not downwind.
    fake_sites = [{"type": "school", "name": "Test School", "lat": 28.0, "lon": 77.009}]
    with patch.object(exposure, "_SITES", fake_sites), \
         patch.object(exposure, "fetch_wind", return_value={"speed_ms": 3.0, "direction_from_deg": 90, "observed_at": "now"}):
        result = exposure.score_exposure(28.0, 77.0)
    assert len(result["downwind_sites"]) == 0
    assert result["exposure_score"] == 0


def test_no_wind_data_degrades_gracefully():
    with patch.object(exposure, "fetch_wind", return_value=None):
        result = exposure.score_exposure(28.0, 77.0)
    assert result["wind"] is None
    assert result["exposure_score"] == 0.0
    assert result["note"]
