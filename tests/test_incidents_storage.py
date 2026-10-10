import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import incidents_storage as st


def test_create_get_update_list_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "_FALLBACK_PATH", tmp_path / "incidents.json")
    monkeypatch.delenv("AWS_ENDPOINT_URL", raising=False)
    # Force a fresh "no dynamo configured" check for this test.
    monkeypatch.setattr(st, "_dynamo_checked", False)
    monkeypatch.setattr(st, "_dynamo_table", None)

    created = st.create_incident({"lat": 28.565, "lon": 77.175, "category": "garbage_burning", "status": "open"})
    assert created["id"]
    assert created["status"] == "open"

    fetched = st.get_incident(created["id"])
    assert fetched == created

    updated = st.update_incident(created["id"], {"status": "resolved"})
    assert updated["status"] == "resolved"
    assert updated["updated_at"] >= created["updated_at"]

    all_open = st.list_incidents(status="open")
    all_resolved = st.list_incidents(status="resolved")
    assert created["id"] not in [i["id"] for i in all_open]
    assert created["id"] in [i["id"] for i in all_resolved]


def test_get_unknown_incident_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "_FALLBACK_PATH", tmp_path / "incidents.json")
    monkeypatch.setattr(st, "_dynamo_checked", False)
    monkeypatch.setattr(st, "_dynamo_table", None)
    assert st.get_incident("does-not-exist") is None
    assert st.update_incident("does-not-exist", {"status": "resolved"}) is None
