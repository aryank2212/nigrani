"""SafeRecess API — AQI-aware school safety advisories for Delhi-NCR."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .services import advisory_agent, aqi_source, risk, storage

APP_DIR = Path(__file__).resolve().parent
SCHOOLS_PATH = APP_DIR / "data" / "schools.json"

app = FastAPI(title="SafeRecess", description="AQI-aware school safety advisories for Delhi-NCR")

# Wide open for the hackathon: the frontend may be served from a different
# dev port/framework (Vite, Next.js, ...) than this backend. Tighten this to
# specific origins before any real deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


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
    storage.log_reading(
        school["id"], reading.aqi, level.label, "live" if reading.is_live else "offline"
    )
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


@app.get("/api/health")
def health():
    return {"status": "ok"}


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
