import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import jurisdiction


def test_routes_to_nearest_locality():
    result = jurisdiction.find_jurisdiction(28.5650, 77.1750)  # R.K. Puram centroid
    assert result["locality_id"] == "rk-puram"
    assert result["in_zone"] is True
    assert "MCD" in result["agency"]


def test_crosses_state_line_correctly():
    noida = jurisdiction.find_jurisdiction(28.6237, 77.3636)
    gurugram = jurisdiction.find_jurisdiction(28.4949, 77.0869)
    assert noida["state"] == "Uttar Pradesh"
    assert gurugram["state"] == "Haryana"


def test_far_point_is_nearest_but_flagged_out_of_zone():
    # Far from every curated centroid: still returns a nearest match, but in_zone=False
    result = jurisdiction.find_jurisdiction(29.5, 78.5)
    assert result["locality_id"] is not None
    assert result["in_zone"] is False


def test_haversine_known_distance():
    # Roughly 1 degree of latitude ~= 111km
    dist = jurisdiction.haversine_km(28.0, 77.0, 29.0, 77.0)
    assert 108 < dist < 113
