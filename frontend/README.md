# Nigrani frontend

Web app for **Nigrani**, the AI layer that verifies, routes and audits Delhi-NCR air pollution complaints.
This is a **front-end only** build: every backend step (AI photo checks, jurisdiction lookup, deadlines,
before/after verification, authorization) is simulated in the browser so the whole process can be demoed.

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # self-check of the seed data, plume model, policy engine and intake rules
npm run build
```

## Demo accounts

| Role | Sign in with | Lands on |
|---|---|---|
| Citizen (Priya Sharma) | phone `9810012345`, code `123456` | My reports |
| Citizen (Rahul Verma) | phone `9810067890`, code `123456` | My reports |
| Field officer | `officer.mcd@nigrani.demo` (Civil Lines), `officer.mcd2@…` (Shahdara South), `officer.ndmc@…`, `officer.pwd@…`, `officer.dda@…`, `officer.dsiidc@…`, `officer.dcb@…` | Queue |
| Nodal officer | `nodal.mcd@nigrani.demo`, `nodal.ndmc@…`, `nodal.pwd@…`, `nodal.dda@…`, `nodal.dsiidc@…`, `nodal.dcb@…` | Dashboard |
| Control room (DPCC / CAQM) | `admin@nigrani.demo` | Control room |

Department password: `demo1234`. The login page has one-click buttons for all of them, and the account
menu (top right) switches between them at any time. Any new phone number creates a citizen account.

## Suggested demo path

1. **Citizen** → *Report*: pick the "Burning waste" sample, **Drop the pin next to** the existing report in
   Ashok Vihar and send. The six AI steps run live and the report is merged as a new witness.
   Try the "Old photo" sample to see a rejection.
2. **Field officer** (`officer.mcd`) → open the top incident → *Accept* → *Close with after-photo*.
   Choose "Still burning" (AI reopens it), "Photo from elsewhere" (policy denies it), or "Site cleared" (verified).
3. **Nodal officer** → escalations, officer workload, zones.
4. **Control room** → change the GRAP stage or wind direction and watch priorities and smoke paths recompute;
   move the clock forward to see deadlines escalate; try requests in *Policies*.
5. **Public** → *Scoreboard* (said fixed vs verified fixed), *Live map*, *What's banned*.

All state lives in `localStorage` (`nigrani.db`). **Reset demo data** in the top bar restores the starting story.

## What is real and what is simulated

| Real logic, running in the browser | Simulated |
|---|---|
| Gaussian-plume smoke path and school/hospital exposure (`lib/geo.js`) | Vision-model verdicts (photo type, fresh/original, before/after) |
| GRAP stage rules and deadlines (`lib/rules.js`) | Weather feed (wind is a control-room setting) |
| Priority score with a visible breakdown | Ward boundaries (nearest-locality lookup instead of a geofence) |
| Spatio-temporal duplicate merge (250 m / 6 h) | School, hospital and zone data (illustrative placeholders) |
| Cedar-style policies (`lib/rules.js`, `POLICIES`), forbid-wins evaluation | All complaints, accounts, SMS codes |

Where the real backend plugs in: `lib/store.js` (data), `lib/pipeline.js` (Strands agent + Bedrock vision),
`lib/rules.js` `authorize` (Amazon Verified Permissions / Cedar).

## Layout

```
src/
  pages/        public pages, plus citizen/ officer/ nodal/ admin/
  components/   Layout (nav, role guard), MapView (Leaflet), Scene (placeholder photos), ui
  lib/          store (simulated backend), seed, pipeline, rules, geo, stats, i18n
  data/         places (localities, schools, hospitals), users
```

Hindi is available for the landing hero, login and the whole citizen journey (toggle in the nav).
