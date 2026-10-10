# Nigrani — submission writeup

*Draft for the Environmental Hacks submission form (problem / build / where AWS fits). Edit freely before submitting — especially "Team" and "Demo video".*

## Track

Air (also touches Waste).

## The problem

Delhi already collects tens of thousands of pollution complaints a month through apps like 311 and Green Delhi. Most go nowhere: routed to the wrong one of ~21 overlapping agencies, never acted on in time, or marked "resolved" with nothing actually fixed — audits have found government departments resolving zero complaints within their own deadlines, and high reopen rates on the ones they do close.

Nigrani doesn't replace those apps — it's the AI layer that verifies, routes, prioritises and audits what citizens already report into them.

## What we built

- **Evidence verification**: an AWS Strands Agents SDK agent sees the citizen's photo directly (native multi-modal input) and judges what it shows and whether it looks authentic — grounded by an independent, non-AI EXIF GPS/timestamp consistency check that runs first.
- **GRAP-aware violation checking**: today's regional AQI maps to a GRAP stage (I–IV), and each complaint category is checked against what that stage actually bans — garbage burning is always a violation; construction becomes a full ban only at Stage III/IV.
- **Jurisdiction routing**: a geofence lookup across 12 curated Delhi-NCR localities spanning MCD zones, NDMC, the Cantonment Board, DDA, and neighbouring Noida/Gurugram authorities — the fix for "21 departments, nobody knows who owns this."
- **Downwind exposure scoring**: live wind data (Open-Meteo) combined with a documented-simplified plume cone against real nearby schools and hospitals — a fire upwind of an empty field scores lower than the same fire upwind of a primary school.
- **Duplicate merging + hotspot clustering**: tight-radius merging folds repeat reports of the same incident into one with a witness count; real DBSCAN clustering finds organic repeat-offender hotspots for the public dashboard.
- **Before/after closure verification**: an officer's "fixed" photo is compared against the original by the same agent — only confirmed fixes get marked resolved; anything else reopens automatically, which is the whole point.
- **A public scoreboard**: per-agency resolution rate and reopen rate, computed from what Nigrani verified, not self-reported.

Every AWS-dependent step degrades gracefully: with no credentials configured, the pipeline still runs end to end and correctly marks complaints for manual review rather than fabricating a verdict.

## Where AWS fits

- **AWS Strands Agents SDK** (open source) drives the verification and closure-comparison agents.
- **Amazon Bedrock** runs the vision-capable model behind that agent (falls back to direct Anthropic if Bedrock isn't configured).
- **Amazon S3** stores report/closure photos; **Amazon DynamoDB** stores incidents — both run against LocalStack for local development and real AWS unchanged for deployment.
- Deploy path: the FastAPI backend is container-ready (`Dockerfile`) for Lambda/App Runner/ECS; Step Functions (deadline escalation) and SNS (officer alerts) are the next layer, using LocalStack's local emulation of both during development.

## Honesty, stated openly

We don't have access to real government complaint data, so the dashboard is seeded with 30 illustrative complaints at real Delhi-NCR locations with invented descriptions — run through the real GRAP/jurisdiction/exposure code, not hardcoded. The 12-locality jurisdiction model is a simplified stand-in for official ward/zone GeoJSON. The GRAP rule table is a simplified encoding of CAQM's publicly known stage structure, not a live feed (none exists publicly). This is a prototype, not an enforcement authority — verdicts are AI-assisted, not final.

## What's next

- Step Functions deadline timers + SNS escalation when an officer misses their SLA.
- Cedar policies encoding jurisdiction rules as code (e.g. "an officer can only close complaints in their own jurisdiction").
- Swap the curated locality list for official MCD/NDMC ward GeoJSON.

## AI tools used

Built with [Claude Code](https://claude.com/claude-code) (Claude, Anthropic).

## Team

*(fill in team members + AWS Builder Center profile links before submitting)*
