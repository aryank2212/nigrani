# SafeRecess

**AQI-aware school safety advisories for Delhi-NCR, built on the AWS Strands Agents SDK.**

Built for the [WeMakeDevs × AWS Environmental Hacks](https://www.wemakedevs.org/aws/env) hackathon — Track 01: Air, sub-problem "school safety on bad days."

## The problem

Delhi-NCR's AQI regularly crosses "Unhealthy" and "Hazardous" during the Oct–Nov stubble-burning season. Schools get government advisories, but there's no simple, per-school tool that turns a raw AQI number into a concrete "what do we do with recess today" decision — and children are a recognised sensitive group who absorb more pollution per kilogram of body weight than adults, so general-public guidance isn't strict enough for them.

SafeRecess takes a school's location, finds the nearest live AQI reading, and turns it into a plain-language, actionable safety advisory — tuned stricter for primary-age students than for secondary.

## How it works

```
 School (lat/lon, age group)
        │
        ▼
 ┌────────────────────┐      live token set       ┌──────────────────────────┐
 │  aqi_source.py      │ ───────────────────────▶ │ WAQI API (nearest station)│
 │  (live or offline)   │ ◀─────────────────────── └──────────────────────────┘
 └─────────┬───────────┘      no token / offline
           │                        │
           │                        ▼
           │                bundled real snapshot
           │                (CPCB/DPCC via aqicn.org,
           │                 captured 2026-10-10)
           ▼
 ┌────────────────────┐
 │  risk.py             │  AQI + age group → risk level, color, actions
 └─────────┬───────────┘
           ▼
 ┌────────────────────────────┐   ANTHROPIC_API_KEY set   ┌───────────────────────┐
 │  advisory_agent.py          │ ────────────────────────▶ │ AWS Strands Agent      │
 │  (agent or rule-based)      │ ◀──────────────────────── │ (tool-calling LLM loop)│
 └─────────┬───────────────────┘   no key → template       └───────────────────────┘
           ▼
 ┌────────────────────┐        AWS_ENDPOINT_URL set   ┌───────────────────────────┐
 │  storage.py          │ ─────────────────────────▶   │ DynamoDB (LocalStack or   │
 │  (history log)        │ ◀─────────────────────────   │ real AWS — same code)     │
 └─────────┬───────────┘        not set → JSON file     └───────────────────────────┘
           ▼
     FastAPI (app/main.py) ──▶ static dashboard (app/static/)
```

**Every layer degrades gracefully with zero setup**, so the app works end-to-end out of the box, and gets strictly better (live data, LLM reasoning, real AWS persistence) as you add credentials:

| Layer | With nothing configured | With credentials |
|---|---|---|
| AQI data | Bundled real snapshot (3 live Delhi stations, captured 2026-10-10) | Live WAQI feed, nearest station to each school's coordinates |
| Advisory | Deterministic rule-based template (same risk engine) | [AWS Strands Agents SDK](https://github.com/strands-agents/sdk-python) agent with tool calls, LLM-written |
| History | Local JSON file | Real DynamoDB table (via LocalStack locally, or real AWS) |

This satisfies the hackathon's "Built on AWS" requirement through the **AWS Strands Agents SDK** (an AWS open-source project) at minimum, with an optional second AWS integration (DynamoDB) layered on top — see [Getting live data / the agent / AWS working](#getting-live-data--the-agent--aws-working) below.

## Run it

```bash
./scripts/run_dev.sh
```

Then open <http://localhost:8000>. That's it — no API keys, no AWS account, no Docker required for the base experience.

Run the tests:

```bash
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests/ -v
```

## Getting live data / the agent / AWS working

Copy `.env.example` to `.env` and fill in whichever of these you want — each is independent and optional:

1. **Live AQI** — grab a free token at <https://aqicn.org/data-platform/token/> (your own account, one minute, no card), set `WAQI_API_TOKEN`. Note: the special `demo` token does **not** work for this — it always returns a fixed Shanghai sample, a known WAQI quirk.
2. **The real LLM agent** — set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL_ID`). Without it, advisories come from a deterministic template built off the same risk engine, so the app still works — you just don't get the agent's natural-language reasoning.
3. **Real DynamoDB history** — `docker compose up -d` then `python scripts/setup_dynamodb.py` to stand up a local DynamoDB table via LocalStack, then set `AWS_ENDPOINT_URL=http://localhost:4566` (plus the dummy credentials already in `.env.example`). Point the same variable at real AWS instead and the exact same code writes to a real table — nothing in `storage.py` changes.

## Project layout

```
app/
  main.py                   FastAPI app + routes
  services/
    aqi_source.py           live WAQI fetch + offline snapshot fallback
    risk.py                 AQI → school risk level/actions
    advisory_agent.py       Strands agent (+ rule-based fallback)
    storage.py              DynamoDB (LocalStack/real) + JSON fallback
  data/
    sample_snapshot.json    real Delhi AQI readings, captured 2026-10-10
    schools.json            seed schools (illustrative names; real AQI data)
  static/                   vanilla HTML/CSS/JS dashboard
scripts/
  run_dev.sh                one-command local run
  setup_dynamodb.py         creates the DynamoDB table (LocalStack or AWS)
tests/
  test_risk.py              risk-engine unit tests
docker-compose.yml          LocalStack, for the optional DynamoDB layer
```

## Honesty notes

- The three AQI readings in `app/data/sample_snapshot.json` are real, captured live from CPCB/DPCC monitoring stations via aqicn.org on 2026-10-10. They are a point-in-time snapshot bundled for offline/demo reliability, not a live feed — see "Getting live data" above to make it live.
- The school names in `app/data/schools.json` are illustrative placeholders paired with real, nearby monitoring stations — swap in your own school/college for a more personal demo.
- This is a hackathon prototype, not a safety authority. Always verify against official government advisories before acting on it in real life.

## AI tools used

Built with [Claude Code](https://claude.com/claude-code). See `WRITEUP.md` for the submission writeup.
