"""Nigrani API — verifies, routes, and audits Delhi-NCR pollution complaints.

Also still serves the original SafeRecess school-AQI-advisory endpoints
(/api/schools/...), absorbed as a secondary feature per the project pivot.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .services import (
    advisory_agent,
    aqi_source,
    complaint_agent,
    dedupe,
    evidence,
    exposure,
    grap,
    incidents_storage,
    jurisdiction,
    photo_storage,
    risk,
    storage,
)

APP_DIR = Path(__file__).resolve().parent
SCHOOLS_PATH = APP_DIR / "data" / "schools.json"

app = FastAPI(title="Nigrani", description="AI verification and routing for Delhi-NCR pollution complaints")

# Wide open for the hackathon: the frontend may be served from a different
# dev port/framework (Vite, Next.js, ...) than this backend. Tighten this to
# specific origins before any real deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Complaints: submit, verify, route, close
# ---------------------------------------------------------------------------


def _incident_public(incident: dict) -> dict:
    """Strip internal-only fields (raw photo keys) before returning to clients."""
    out = {k: v for k, v in incident.items() if k not in ("photo_key",)}
    if incident.get("closure"):
        out["closure"] = {k: v for k, v in incident["closure"].items() if k != "photo_key"}
    return out


@app.post("/api/complaints")
async def submit_complaint(
    photo: UploadFile,
    lat: float = Form(...),
    lon: float = Form(...),
    description: str = Form(""),
    language: str = Form("en"),
    category_hint: str = Form(""),
):
    photo_bytes = await photo.read()
    if not photo_bytes:
        raise HTTPException(status_code=400, detail="Empty photo upload.")
    now = datetime.now(timezone.utc)
    content_type = photo.content_type or "image/jpeg"

    meta = evidence.read_photo_meta(photo_bytes)
    authenticity = evidence.check_authenticity(meta, lat, lon, now.replace(tzinfo=None))

    agent_result = complaint_agent.verify_complaint(photo_bytes, lat, lon, description)
    verdict = agent_result["verdict"]
    if verdict:
        category = verdict["category"]
    elif category_hint in grap.CATEGORIES:
        # No AI configured: trust the citizen's own category rather than defaulting to
        # "unclear", so GRAP/jurisdiction/exposure still mean something while waiting on
        # a vision model to be wired in.
        category = category_hint
    else:
        category = "unclear"

    grap_result = grap.evaluate_violation(category, aqi_source.regional_aqi())
    jurisdiction_result = jurisdiction.find_jurisdiction(lat, lon)
    exposure_result = exposure.score_exposure(lat, lon)

    # Duplicate check: only against incidents whose category is already resolved
    # (skip when the verdict itself is unavailable, since category="unclear" would
    # over-merge unrelated reports).
    duplicate_id = None
    if verdict is not None:
        open_incidents = [
            {
                "id": i["id"],
                "lat": i["lat"],
                "lon": i["lon"],
                "category": i["category"],
                "created_at": datetime.fromtimestamp(i["created_at"], tz=timezone.utc).replace(tzinfo=None),
            }
            for i in incidents_storage.list_incidents(status="open")
        ]
        duplicate_id = dedupe.find_duplicate(lat, lon, now.replace(tzinfo=None), category, open_incidents)

    if duplicate_id is not None:
        existing = incidents_storage.get_incident(duplicate_id)
        updated = incidents_storage.update_incident(
            duplicate_id, {"witness_count": existing.get("witness_count", 1) + 1}
        )
        return {"merged_into": duplicate_id, "incident": _incident_public(updated)}

    photo_key = photo_storage.save_photo(photo_bytes, content_type)
    incident = incidents_storage.create_incident(
        {
            "category": category,
            "lat": lat,
            "lon": lon,
            "description": description,
            "language": language,
            "photo_key": photo_key,
            "photo_content_type": content_type,
            "status": "open" if verdict is not None else "needs_manual_classification",
            "created_at": now.timestamp(),
            "witness_count": 1,
            "duplicate_of": None,
            "ai_mode": agent_result["mode"],
            "ai_note": agent_result["note"],
            "ai_verdict": verdict,
            "authenticity": authenticity,
            "grap": grap_result,
            "jurisdiction": jurisdiction_result,
            "exposure": exposure_result,
            "closure": None,
        }
    )
    return {"merged_into": None, "incident": _incident_public(incident)}


@app.get("/api/complaints")
def list_complaints(status: Optional[str] = None):
    return [_incident_public(i) for i in incidents_storage.list_incidents(status=status)]


@app.get("/api/complaints/{complaint_id}")
def get_complaint(complaint_id: str):
    incident = incidents_storage.get_incident(complaint_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Unknown complaint id: {complaint_id}")
    return _incident_public(incident)


@app.get("/api/complaints/{complaint_id}/photo")
def get_complaint_photo(complaint_id: str):
    incident = incidents_storage.get_incident(complaint_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Unknown complaint id: {complaint_id}")
    data = photo_storage.load_photo(incident["photo_key"])
    if data is None:
        raise HTTPException(status_code=404, detail="No photo available for this complaint (likely seed data).")
    return Response(content=data, media_type=incident.get("photo_content_type", "image/jpeg"))


@app.get("/api/complaints/{complaint_id}/closure-photo")
def get_closure_photo(complaint_id: str):
    incident = incidents_storage.get_incident(complaint_id)
    if incident is None or not incident.get("closure"):
        raise HTTPException(status_code=404, detail="No closure photo for this complaint.")
    data = photo_storage.load_photo(incident["closure"]["photo_key"])
    if data is None:
        raise HTTPException(status_code=404, detail="Closure photo not found.")
    return Response(content=data, media_type=incident["closure"].get("photo_content_type", "image/jpeg"))


@app.post("/api/complaints/{complaint_id}/close")
async def close_complaint(complaint_id: str, photo: UploadFile):
    incident = incidents_storage.get_incident(complaint_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Unknown complaint id: {complaint_id}")

    after_bytes = await photo.read()
    if not after_bytes:
        raise HTTPException(status_code=400, detail="Empty photo upload.")
    content_type = photo.content_type or "image/jpeg"

    before_bytes = photo_storage.load_photo(incident["photo_key"])
    after_key = photo_storage.save_photo(after_bytes, content_type)

    if before_bytes is None:
        # Seed data / original photo missing -- can't do a visual before/after.
        closure_result = {"verdict": None, "mode": "unavailable", "note": "Original photo unavailable for comparison."}
    else:
        closure_result = complaint_agent.verify_closure(
            before_bytes, after_bytes, incident["category"], incident["lat"], incident["lon"]
        )

    verdict = closure_result["verdict"]
    if verdict is None:
        new_status = "closed_pending_verification"
    elif verdict["same_location"] and verdict["issue_resolved"]:
        new_status = "resolved"
    else:
        new_status = "reopened"

    updated = incidents_storage.update_incident(
        complaint_id,
        {
            "status": new_status,
            "closure": {
                "photo_key": after_key,
                "photo_content_type": content_type,
                "closed_at": time.time(),
                "mode": closure_result["mode"],
                "verdict": verdict,
            },
        },
    )
    return _incident_public(updated)


# ---------------------------------------------------------------------------
# Public dashboard: scoreboard + hotspots
# ---------------------------------------------------------------------------

_CLOSED_STATUSES = {"resolved", "reopened"}


@app.get("/api/dashboard/stats")
def dashboard_stats():
    incidents = incidents_storage.list_incidents()
    by_agency: dict[str, dict] = {}
    for inc in incidents:
        agency = inc.get("jurisdiction", {}).get("agency", "Unknown")
        bucket = by_agency.setdefault(
            agency, {"agency": agency, "total": 0, "resolved": 0, "reopened": 0, "open": 0}
        )
        bucket["total"] += 1
        if inc["status"] == "resolved":
            bucket["resolved"] += 1
        elif inc["status"] == "reopened":
            bucket["reopened"] += 1
        elif inc["status"] in ("open", "closed_pending_verification", "needs_manual_classification"):
            bucket["open"] += 1

    scoreboard = []
    for bucket in by_agency.values():
        closed_attempts = bucket["resolved"] + bucket["reopened"]
        bucket["resolution_rate"] = round(bucket["resolved"] / closed_attempts, 2) if closed_attempts else None
        bucket["reopen_rate"] = round(bucket["reopened"] / closed_attempts, 2) if closed_attempts else None
        scoreboard.append(bucket)
    scoreboard.sort(key=lambda b: -b["total"])

    return {
        "total_incidents": len(incidents),
        "total_open": sum(1 for i in incidents if i["status"] not in _CLOSED_STATUSES),
        "total_resolved": sum(1 for i in incidents if i["status"] == "resolved"),
        "total_reopened": sum(1 for i in incidents if i["status"] == "reopened"),
        "by_agency": scoreboard,
    }


@app.get("/api/dashboard/hotspots")
def dashboard_hotspots(status: Optional[str] = "open"):
    incidents = incidents_storage.list_incidents(status=status)
    points = [{"id": i["id"], "lat": i["lat"], "lon": i["lon"]} for i in incidents]
    return dedupe.cluster_hotspots(points)


@app.get("/api/localities")
def list_localities():
    return [
        {
            "id": loc.id,
            "name": loc.name,
            "lat": loc.lat,
            "lon": loc.lon,
            "agency": loc.agency,
            "agency_type": loc.agency_type,
            "state": loc.state,
        }
        for loc in jurisdiction.all_localities()
    ]


# ---------------------------------------------------------------------------
# SafeRecess (absorbed): school AQI safety advisories
# ---------------------------------------------------------------------------


def _load_schools() -> list[dict]:
    return json.loads(SCHOOLS_PATH.read_text())


def _school_by_id(school_id: str) -> dict:
    for school in _load_schools():
        if school["id"] == school_id:
            return school
    raise HTTPException(status_code=404, detail=f"Unknown school id: {school_id}")


def _school_status(school: dict) -> dict:
    reading = aqi_source.get_reading(school["lat"], school["lon"], school["fallback_station_id"])
    level = risk.assess(reading.aqi, school.get("age_group", "mixed"))
    storage.log_reading(school["id"], reading.aqi, level.label, "live" if reading.is_live else "offline")
    return {
        "id": school["id"],
        "name": school["name"],
        "area": school["area"],
        "age_group": school["age_group"],
        "aqi": reading.aqi,
        "category": reading.category,
        "is_live": reading.is_live,
        "risk_level": level.label,
        "risk_level_index": level.level,
        "risk_color": level.color,
        "updated_local": reading.updated_local,
    }


@app.get("/api/schools")
def list_schools():
    return [_school_status(school) for school in _load_schools()]


@app.get("/api/schools/{school_id}")
def school_detail(school_id: str):
    return _school_status(_school_by_id(school_id))


@app.get("/api/schools/{school_id}/advisory")
def school_advisory(school_id: str):
    school = _school_by_id(school_id)
    advisory = advisory_agent.generate_advisory(school)
    return {"school": school, **advisory}


@app.get("/api/schools/{school_id}/history")
def school_history(school_id: str):
    _school_by_id(school_id)  # 404s if unknown
    return storage.get_history(school_id)


app.mount("/static", StaticFiles(directory=str(APP_DIR / "static")), name="static")


@app.get("/")
def index():
    return FileResponse(str(APP_DIR / "static" / "index.html"))
