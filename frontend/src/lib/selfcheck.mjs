// Run with: npm run check
// Smallest checks that fail if the core demo logic breaks: seed integrity, plume geometry,
// the policy engine, and the report -> verify -> close pipeline.
import assert from "node:assert/strict";
import { buildSeed } from "./seed.js";
import { enrich } from "./enrich.js";
import { authorize, escalation } from "./rules.js";
import { USERS } from "../data/users.js";
import { HOUR } from "./time.js";
import { photoProblem } from "./pipeline.js";

const now = Date.now();
const db = buildSeed(now);
const list = db.incidents.map((i) => enrich(i, db, now));

// seed: unique ids, events in order, nothing happens in the future
assert.equal(new Set(list.map((i) => i.id)).size, list.length);
for (const i of list) {
  assert.ok(i.events.every((e) => e.at <= now + 2 * HOUR), `${i.id} has a future event`);
  const times = i.events.map((e) => e.at);
  assert.deepEqual(times, [...times].sort((a, b) => a - b), `${i.id} events out of order`);
}

// the hero fire is NW of the school, wind from NW, so the school is in the smoke path
const hero = list.find((i) => i.landmark.includes("North Delhi Public School"));
assert.ok(hero.exposed.some((r) => r.id === "sch-ndps"), "school should be downwind of the hero fire");
assert.equal(hero.agency, "MCD");

// flip the wind to blow from the SE and the school is no longer exposed
const flipped = enrich(hero, { ...db, settings: { ...db.settings, wind: { fromDeg: 135, speedKmh: 9 } } }, now);
assert.ok(!flipped.exposed.some((r) => r.id === "sch-ndps"), "wind flip should clear exposure");

// escalation: past the deadline -> nodal, well past -> DPCC
const open = { status: "new", dueAt: now - 1, slaHours: 4 };
assert.equal(escalation(open, now), 1);
assert.equal(escalation({ ...open, dueAt: now - 5 * HOUR }, now), 2);

// policies: an officer cannot close outside their zone, nor without a matching after-photo
const civil = USERS.find((u) => u.id === "u-off-mcd"); // MCD, Civil Lines
const inZone = { agency: "MCD", zone: "Civil Lines", status: "acknowledged", witnesses: [] };
const ctxOk = { afterPhoto: true, matchesLocation: true };
assert.equal(authorize({ user: civil, action: "CloseIncident", incident: inZone, ctx: ctxOk }).decision, "Allow");
assert.equal(authorize({ user: civil, action: "CloseIncident", incident: { ...inZone, zone: "Central" }, ctx: ctxOk }).decision, "Deny");
assert.equal(authorize({ user: civil, action: "CloseIncident", incident: inZone, ctx: { afterPhoto: true, matchesLocation: false } }).decision, "Deny");
assert.equal(authorize({ user: civil, action: "CloseIncident", incident: inZone, ctx: { afterPhoto: false, matchesLocation: true } }).decision, "Deny");

// intake: stale or copied photos are refused
assert.ok(photoProblem({ kind: "scene", state: "old" }));
assert.ok(photoProblem({ kind: "scene", state: "dup" }));
assert.equal(photoProblem({ kind: "scene", state: "active" }), null);

console.log(`ok: ${list.length} seeded incidents, plume, policy and intake checks passed`);
