# SafeRecess — submission writeup

*Draft for the Environmental Hacks submission form (problem / build / where AWS fits). Edit freely before submitting — especially the "Team" and "Demo video" sections.*

## Track

Air — "school safety on bad days."

## The problem

Delhi-NCR's AQI regularly crosses "Unhealthy" and "Hazardous" during the October–November stubble-burning season — exactly the week this hackathon runs in. Schools get broad government advisories, but there's no simple, per-school tool that turns a raw AQI number into a concrete "what do we do with recess today" decision. Children are a recognised sensitive group — they breathe more air per kilogram of body weight than adults, and their lungs are still developing — so general-public guidance isn't strict enough for them, and primary-age children need stricter thresholds than secondary students.

SafeRecess takes a school's location and age group, finds the nearest AQI reading, and turns it into a plain-language, actionable safety advisory: a risk level, the single most important action, and a short checklist — tuned stricter for younger children.

## What we built

- A risk-scoring engine mapping AQI → a 6-level school-safety scale (Safe → Consider Closure), with primary schools bumped one level stricter than secondary at the same AQI.
- Live AQI lookup by school coordinates (nearest-station), with a bundled real offline snapshot (three live Delhi-NCR station readings — Satyawati College, R.K. Puram, Anand Vihar — captured on 2026-10-10) so the app runs with zero signup.
- An advisory layer built on the **AWS Strands Agents SDK**: a tool-calling agent that looks up the live reading and risk assessment, then writes a short, calm, actionable advisory. Falls back to a deterministic template from the same risk engine when no LLM key is configured, so the app always produces a correct result.
- Optional AWS DynamoDB history logging (via LocalStack locally, or real AWS unchanged) of every reading, keyed by school.
- A small dashboard: a color-coded card per school (AQI, risk level, live/offline badge), click through for the full advisory.

## Where AWS fits

- **AWS Strands Agents SDK** (open source) drives the advisory-generation agent and its tool calls — this is the project's primary AWS integration, and it needs no AWS account to run.
- **Amazon DynamoDB** (optional second integration) stores the reading history; the same boto3 code runs against LocalStack for local development or a real AWS account for deployment — nothing in the code changes between the two.
- Deploy path (not required to run, but ready): the FastAPI app is a drop-in fit for **AWS Lambda + API Gateway** (or **AWS Amplify Hosting** for a static build of the frontend), both covered by the AWS Free Tier.

## What's next

- Swap in real school partner data and a verified live AQI token for the demo region.
- Add a forecast view (next 24–48h trend) instead of just current conditions.
- SMS/WhatsApp alerts via SNS when a school crosses into "Move Indoors" or worse.

## AI tools used

Built with [Claude Code](https://claude.com/claude-code) (Claude, Anthropic).

## Team

*(fill in team members + AWS Builder Center profile links before submitting)*
