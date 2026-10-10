# Nigrani

**AI verification, routing and audit for Delhi-NCR pollution complaints — built on the AWS Strands Agents SDK and Amazon Bedrock.**

Built for the [WeMakeDevs × AWS Environmental Hacks](https://www.wemakedevs.org/aws/env) hackathon — Track 01: Air.

## The problem

Delhi already collects tens of thousands of pollution complaints a month, through apps like 311 and Green Delhi. Most die in the system: routed to the wrong one of ~21 departments, never acted on, or marked "resolved" with nothing actually fixed (reopen audits have found government departments resolving zero complaints within deadline, with high reopen rates on the ones they do close).

Nigrani doesn't replace those apps — it's the AI layer that verifies, routes, prioritises and audits what citizens report into them: is the photo real and current, is it actually a GRAP violation *today*, which of the ~20 overlapping civic agencies actually owns this spot, is it drifting toward a school or hospital right now, and — when an officer claims it's fixed — did it actually get fixed.

## How it works

A citizen submits a photo + GPS location + a short description. From there:

```
 Photo + location + description
          │
          ▼
 ┌──────────────────────┐
 │ evidence.py            │  EXIF GPS/timestamp consistency check (no model needed)
 └──────────┬────────────┘
          ▼
 ┌──────────────────────────────┐   Bedrock/Anthropic configured   ┌─────────────────────────┐
 │ complaint_agent.py             │ ───────────────────────────────▶ │ Strands Agent (vision)   │
 │ (agent or "needs manual       │ ◀─────────────────────────────── │ sees the photo directly, │
 │  review" if no model set)      │   not configured → "unavailable" │ calls tools below         │
 └──────────┬────────────────────┘                                   └─────────────────────────┘
          │                         tool calls, grounded in real data, never guessed by the model
          ├──▶ grap.py          today's regional AQI → GRAP stage → is this category a violation
          ├──▶ jurisdiction.py  nearest of 12 curated localities → responsible civic agency
          └──▶ exposure.py      live wind (Open-Meteo) → downwind schools/hospitals, scored
          │
          ▼
 ┌──────────────────────┐
 │ dedupe.py              │  merge into an existing open report if one matches (tight radius + time window)
 └──────────┬────────────┘
          ▼
 ┌──────────────────────┐  S3_BUCKET set   ┌─────────────┐      ┌──────────────────────┐  AWS_ENDPOINT_URL set  ┌───────────┐
 │ photo_storage.py       │ ───────────────▶ │ Amazon S3    │      │ incidents_storage.py    │ ──────────────────────▶ │ DynamoDB   │
 │                        │ ◀─────────────── │              │      │                        │ ◀────────────────────── │            │
 └────────────────────────┘  not set → disk └─────────────┘      └──────────┬─────────────┘  not set → JSON file  └───────────┘
                                                                            ▼
                                                               FastAPI (app/main.py)
                                                          officer queue · public scoreboard
```

Closing a complaint works the same way in reverse: an officer uploads an "after" photo, the agent compares before/after and only marks it **resolved** if it confirms the same location *and* the issue is actually gone — otherwise it **reopens**, which is the whole point (catching fake closures).

**Every AWS-dependent layer degrades gracefully with zero setup**, so the pipeline runs end-to-end out of the box and gets strictly better as credentials are added:

| Layer | With nothing configured | With credentials |
|---|---|---|
| Vision verification | `category: "unclear"`, `status: "needs_manual_classification"` — **never a fabricated verdict** | Strands agent on Bedrock (or direct Anthropic) classifies the photo, checks authenticity, sets priority |
| Photo storage | Local disk (`app/data/photos/`) | Amazon S3 (set `S3_BUCKET`) |
| Incident storage | Local JSON file | DynamoDB (via LocalStack locally, or real AWS — same code, set `AWS_ENDPOINT_URL`) |

This satisfies "Built on AWS" through the **AWS Strands Agents SDK** (open source) at minimum, with **Amazon Bedrock**, **S3**, and **DynamoDB** layered on as real AWS services once credentials are available — see [Getting it fully working](#getting-it-fully-working) below. GRAP stage, jurisdiction routing, and exposure scoring need **no AI at all** — they're deterministic Python over real data (live AQI, live wind, curated locality data) and are fully working right now.

## Run it

```bash
./scripts/run_dev.sh
```

Then open <http://localhost:8000>. No API keys, no AWS account, no Docker required for the base experience — submitting a complaint works immediately, just without automatic photo classification.

Run the tests (34 passing, covering the plume-cone geometry, DBSCAN clustering, EXIF math, and the graceful-degradation paths):

```bash
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests/ -v
```

## API reference (for the frontend)

Base URL in dev: `http://localhost:8000`. CORS is wide open (`*`). Interactive docs with live "try it" are auto-generated at **`/docs`** and **`/redoc`**; raw schema at `/openapi.json`. These shapes are stable — ping me before changing them rather than just changing them.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | Liveness check |
| `POST` | `/api/complaints` | Multipart: `photo` (file), `lat`, `lon`, `description`, `language`. Returns `{"merged_into": id\|null, "incident": {...}}` |
| `GET` | `/api/complaints?status=open` | List, `status` optional (`open`, `closed_pending_verification`, `resolved`, `reopened`, `needs_manual_classification`) |
| `GET` | `/api/complaints/{id}` | One incident, full shape below |
| `GET` | `/api/complaints/{id}/photo` | Raw image bytes (the original report photo) |
| `POST` | `/api/complaints/{id}/close` | Multipart: `photo` (file, the "after" photo). Returns the updated incident |
| `GET` | `/api/complaints/{id}/closure-photo` | Raw image bytes (the closure photo), once closed |
| `GET` | `/api/dashboard/stats` | `{total_incidents, total_open, total_resolved, total_reopened, by_agency: [{agency, total, resolved, reopened, open, resolution_rate, reopen_rate}]}` — the public scoreboard |
| `GET` | `/api/dashboard/hotspots?status=open` | `[{centroid_lat, centroid_lon, incident_count, incident_ids}]` — real DBSCAN clusters |
| `GET` | `/api/localities` | The 12 curated localities (id, name, lat/lon, agency) — useful for map pins |
| `GET` | `/api/schools*` | SafeRecess's original school-AQI-advisory endpoints, kept as a secondary feature — see the git history for their shapes |

**Incident shape** (`/api/complaints/{id}` and list items):
```json
{
  "id": "uuid",
  "category": "garbage_burning",
  "lat": 28.565, "lon": 77.175,
  "description": "...", "language": "en",
  "photo_content_type": "image/jpeg",
  "status": "open",
  "created_at": 1791627540.9, "updated_at": 1791627540.9,
  "witness_count": 1,
  "duplicate_of": null,
  "ai_mode": "agent",
  "ai_note": null,
  "ai_verdict": {
    "category": "garbage_burning", "category_confidence": 0.9,
    "photo_context_plausible": true, "priority": "high",
    "summary": "Active waste fire with no mitigation; high downwind exposure."
  },
  "authenticity": {"has_exif_gps": false, "has_exif_timestamp": false, "flags": []},
  "grap": {"is_violation": true, "severity": "high", "grap_stage": 1, "grap_stage_name": "Stage I – Poor", "rule": "..."},
  "jurisdiction": {"locality_id": "rk-puram", "locality_name": "R.K. Puram", "agency": "MCD – South Zone", "agency_type": "...", "state": "Delhi", "distance_km": 0.0, "in_zone": true},
  "exposure": {"wind": {"speed_ms": 2.0, "direction_from_deg": 124, "observed_at": "..."}, "downwind_bearing_deg": 304, "downwind_sites": [{"type": "school", "name": "...", "distance_km": 0.4, "weight": 0.7}], "exposure_score": 0.7},
  "closure": null
}
```
Status values, in the order a complaint normally flows through them: `open` (or `needs_manual_classification` if no AI is configured) → `closed_pending_verification` (officer submitted an after-photo but it couldn't be auto-verified) or `resolved` (agent confirmed it) or `reopened` (agent found it wasn't actually fixed). `priority` (`low`/`medium`/`high`) and `jurisdiction.agency` are the two fields most worth surfacing prominently in an officer queue; `exposure.downwind_sites` is the one worth a map/visual, since "a school is downwind right now" is the single most compelling thing this tool can show.

## Getting it fully working

Copy `.env.example` to `.env`. Each of these is independent — the pipeline works without any of them, just with less automation:

1. **Vision verification (the core feature)** — either:
   - **Amazon Bedrock** (preferred — this is the "Built on AWS" story): enable model access for a Claude model in the Bedrock console for your account (this can take a few minutes to approve, start it early), then set `BEDROCK_MODEL_ID` (e.g. `anthropic.claude-sonnet-4-5-...`) and standard AWS credentials (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`, or `AWS_PROFILE`).
   - **Direct Anthropic API** (faster to set up, no AWS needed): set `ANTHROPIC_API_KEY`.
2. **S3 photo storage** — set `S3_BUCKET` to a real bucket name (plus AWS credentials as above), or point `AWS_ENDPOINT_URL=http://localhost:4566` at LocalStack for local testing (`docker compose up -d`).
3. **DynamoDB incident storage** — `docker compose up -d` then `python scripts/setup_dynamodb.py` to create both tables against LocalStack, then set `AWS_ENDPOINT_URL=http://localhost:4566` (dummy credentials are fine for LocalStack — see `.env.example`). Point the same variable at real AWS instead and the exact same code writes to real tables.
4. **Seed demo data** — `python scripts/seed_data.py` loads 30 illustrative complaints (real Delhi-NCR locations, invented descriptions) through the real GRAP/jurisdiction/exposure code, so the dashboard and officer queue have something to show immediately.

## Project layout

```
app/
  main.py                      FastAPI app + all routes
  services/
    complaint_agent.py         the core Strands agent: sees the photo, calls tools below
    grap.py                    AQI → GRAP stage, category-specific violation rules
    jurisdiction.py            nearest-locality geofence → responsible civic agency
    exposure.py                live wind (Open-Meteo) + downwind plume cone scoring
    evidence.py                EXIF GPS/timestamp authenticity checks (no model needed)
    dedupe.py                  duplicate merging + real DBSCAN hotspot clustering
    incidents_storage.py       DynamoDB (LocalStack/real) + JSON fallback
    photo_storage.py           S3 (LocalStack/real) + local-disk fallback
    aqi_source.py, risk.py, advisory_agent.py, storage.py   SafeRecess, absorbed as a secondary feature
  data/
    localities.json            12 curated Delhi-NCR localities + jurisdiction + nearby schools/hospitals
    seed_complaints.json       30 illustrative seed complaints (raw facts; derived fields computed live)
  static/                      the original SafeRecess dashboard — not the Nigrani frontend (see below)
scripts/
  run_dev.sh, setup_dynamodb.py, seed_data.py
tests/                         34 tests, including mocked up/downwind geometry and DBSCAN outlier rejection
docker-compose.yml             LocalStack: dynamodb, s3, sns, stepfunctions, lambda, iam
Dockerfile                     backend container, for Lambda/App Runner/ECS deployment later
```

**Frontend**: the citizen report form, officer queue, and public dashboard UI are being built separately against the API above — `app/static/` is the old SafeRecess school dashboard, not Nigrani's UI.

## Honesty notes

- `app/data/seed_complaints.json`: Nigrani has no access to real government complaint data. These 30 entries are illustrative (real Delhi-NCR locations, invented descriptions), loaded through the real GRAP/jurisdiction/exposure code rather than hardcoded — only the photo and its AI verdict are faked, since there's no real photo to classify. Say this openly in the demo video.
- `app/data/localities.json`: a simplified 12-locality jurisdiction model, not official ward/zone GeoJSON. Good enough to route a demo complaint correctly; a production system should use MCD/NDMC/DDA open-data boundaries.
- `grap.py`'s rule table is a simplified encoding of CAQM's publicly known GRAP stage structure, not the live CAQM schedule (no public real-time API exists for it).
- This is a hackathon prototype, not an official enforcement tool. Verdicts are AI-assisted, not authoritative — a human still makes the call.

## AI tools used

Built with [Claude Code](https://claude.com/claude-code). See `WRITEUP.md` for the submission writeup.
