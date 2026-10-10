import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import aqi_source, risk


def test_category_boundaries():
    assert aqi_source.category_for_aqi(0) == "Good"
    assert aqi_source.category_for_aqi(50) == "Good"
    assert aqi_source.category_for_aqi(51) == "Moderate"
    assert aqi_source.category_for_aqi(151) == "Unhealthy"
    assert aqi_source.category_for_aqi(301) == "Hazardous"


def test_secondary_school_matches_base_band():
    assert risk.assess(30, "secondary").label == "Safe"
    assert risk.assess(75, "secondary").label == "Caution"
    assert risk.assess(156, "secondary").label == "Move Indoors"
    assert risk.assess(450, "secondary").label == "Consider Closure"


def test_primary_school_is_one_notch_stricter():
    # 75 AQI (Moderate) is "Caution" for older students, but primary kids
    # get bumped straight to "Limit Outdoor Time".
    assert risk.assess(75, "secondary").label == "Caution"
    assert risk.assess(75, "primary").label == "Limit Outdoor Time"


def test_worst_level_does_not_overflow():
    level = risk.assess(500, "primary")
    assert level.label == "Consider Closure"
