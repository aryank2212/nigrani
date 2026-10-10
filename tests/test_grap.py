import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import grap


def test_stage_boundaries():
    assert grap.stage_for_aqi(150).stage == 0
    assert grap.stage_for_aqi(201).stage == 1
    assert grap.stage_for_aqi(301).stage == 2
    assert grap.stage_for_aqi(401).stage == 3
    assert grap.stage_for_aqi(451).stage == 4


def test_garbage_burning_always_a_violation():
    low = grap.evaluate_violation("garbage_burning", 50)
    high = grap.evaluate_violation("garbage_burning", 480)
    assert low["is_violation"] is True
    assert high["is_violation"] is True


def test_construction_escalates_with_stage():
    mild = grap.evaluate_violation("construction_dust", 250)  # Stage I
    severe = grap.evaluate_violation("construction_dust", 420)  # Stage III
    assert mild["severity"] == "low"
    assert severe["severity"] == "high"
    assert "mitigation" in mild["rule"].lower()
    assert "banned" in severe["rule"].lower()


def test_unknown_category_flagged_for_review():
    result = grap.evaluate_violation("not_a_real_category", 300)
    assert result["is_violation"] is False
