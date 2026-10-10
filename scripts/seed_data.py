"""Load app/data/seed_complaints.json into incident storage.

Only the photo and its AI verdict are faked (no real photo exists for
seed data); GRAP violation, jurisdiction, and exposure are computed via
the real modules, using today's actual regional AQI and live wind data --
same code path a real complaint goes through. Run with the same env vars
as the app (AWS_ENDPOINT_URL etc.) to seed into DynamoDB instead of the
local JSON fallback.

Usage:
    python scripts/seed_data.py
    AWS_ENDPOINT_URL=http://localhost:4566 AWS_ACCESS_KEY_ID=test \\
        AWS_SECRET_ACCESS_KEY=test python scripts/seed_data.py
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import aqi_source, exposure, grap, incidents_storage, jurisdiction

SEED_PATH = Path(__file__).resolve().parent.parent / "app" / "data" / "seed_complaints.json"


def main():
    spec = json.loads(SEED_PATH.read_text())
    regional_aqi = aqi_source.regional_aqi()
    print(f"Seeding against today's regional AQI: {regional_aqi}")

    created = 0
    for raw in spec["complaints"]:
        lat, lon, category = raw["lat"], raw["lon"], raw["category"]
        created_at = time.time() - raw["days_ago"] * 86400

        grap_result = grap.evaluate_violation(category, regional_aqi)
        jurisdiction_result = jurisdiction.find_jurisdiction(lat, lon)
        exposure_result = exposure.score_exposure(lat, lon)

        item = {
            "category": category,
            "lat": lat,
            "lon": lon,
            "description": raw["description"],
            "language": raw["language"],
            "photo_key": "seed-placeholder",
            "status": raw["status"],
            "created_at": created_at,
            "witness_count": raw["witness_count"],
            "duplicate_of": None,
            "ai_mode": "seed",
            "ai_verdict": {
                "category": category,
                "category_confidence": raw["ai_confidence"],
                "photo_context_plausible": True,
                "priority": raw["ai_priority"],
                "summary": raw["description"][:140],
            },
            "grap": grap_result,
            "jurisdiction": jurisdiction_result,
            "exposure": exposure_result,
            "closure": None,
        }
        incidents_storage.create_incident(item)
        created += 1

    print(f"Seeded {created} complaints.")


if __name__ == "__main__":
    main()
