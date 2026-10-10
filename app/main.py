"""SafeRecess API — AQI-aware school safety advisories for Delhi-NCR."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .services import advisory_agent, aqi_source, risk, storage

APP_DIR = Path(__file__).resolve().parent
SCHOOLS_PATH = APP_DIR / "data" / "schools.json"

app = FastAPI(title="SafeRecess", description="AQI-aware school safety advisories for Delhi-NCR")


def _load_schools() -> list[dict]:
    return json.loads(SCHOOLS_PATH.read_text())


def _school_by_id(school_id: str) -> dict:
    for school in _load_schools():
        if school["id"] == school_id:
            return school
    raise HTTPException(status_code=404, detail=f"Unknown school id: {school_id}")


@app.get("/api/schools")
def list_schools():
    out = []
    for school in _load_schools():
        reading = aqi_source.get_reading(school["lat"], school["lon"], school["fallback_station_id"])
        level = risk.assess(reading.aqi, school.get("age_group", "mixed"))
        storage.log_reading(
            school["id"], reading.aqi, level.label, "live" if reading.is_live else "offline"
        )
        out.append(
            {
                "id": school["id"],
                "name": school["name"],
                "area": school["area"],
                "age_group": school["age_group"],
                "aqi": reading.aqi,
                "category": reading.category,
                "is_live": reading.is_live,
                "risk_level": level.label,
                "risk_color": level.color,
                "updated_local": reading.updated_local,
            }
        )
    return out


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
