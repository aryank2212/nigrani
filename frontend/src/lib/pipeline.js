// Simulated AI pipelines. Each step takes a moment so the UI can show the work being done; the
// logic is real (plume model, GRAP table, geofence, clustering, policy engine) but the vision
// model's verdict is simulated. ponytail: replace the vision verdicts with Strands + Bedrock calls.
import { PLACES } from "../data/places.js";
import { distance, nearestPlace } from "./geo.js";
import { TYPES, authorize, grapStatus, isOpen } from "./rules.js";
import { addWitness, getDb, insertIncident, now, recordAttempt, recordDenied } from "./store.js";
import { enrich } from "./enrich.js";
import { HOUR, MIN, fmtAgo } from "./time.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const REPORT_STEPS = [
  "Checking the photo is fresh and original",
  "Identifying what the photo shows",
  "Checking today's GRAP rules",
  "Finding the agency responsible for this spot",
  "Estimating who is downwind of the smoke",
  "Looking for matching reports nearby",
];

export const CLOSURE_STEPS = [
  "Checking jurisdiction and photo evidence against policy",
  "Comparing the before and after photos",
];

const FRESH_LIMIT = 30 * MIN;

export function photoProblem(photo) {
  if (photo.kind === "scene") {
    if (photo.state === "old") return "The photo's metadata shows it was taken 3 days ago, so it cannot be used as evidence of what is happening now.";
    if (photo.state === "dup") return "This image was already used in another report (duplicate evidence).";
    return null;
  }
  const age = Date.now() - (photo.lastModified ?? Date.now());
  if (age > FRESH_LIMIT && !photo.override) return `This photo was taken ${fmtAgo(Date.now() - age, Date.now())}. Photos older than 30 minutes are not accepted.`;
  return null;
}

export async function submitReport(draft, user, onStep) {
  const step = async (i, run) => {
    onStep(i, "running");
    await wait(600 + (hash(`${i}${draft.lat}`) % 500));
    const r = run();
    onStep(i, r.fail ? "failed" : "done", r.detail);
    return r;
  };
  const db = getDb();
  const { place, distM } = nearestPlace(draft, PLACES);
  const base = {
    type: draft.type, placeId: place.id, lat: draft.lat, lon: draft.lon,
    landmark: draft.landmark || `near ${place.name}`,
    desc: draft.desc?.trim() || `Reported: ${TYPES[draft.type].label.toLowerCase()}.`,
    photo: draft.photo, agency: place.agency, zone: place.zone, anonymous: draft.anonymous,
    witnesses: [{ at: now(), userId: user.id }],
  };
  const confidence = Math.round((0.82 + (hash(draft.photo.url ?? draft.photo.state ?? "x") % 16) / 100) * 100) / 100;

  const reject = (reason, dup) => {
    const incident = insertIncident({
      ...base, status: "rejected", rejectReason: reason,
      ai: { label: TYPES[draft.type].label, confidence: 0, checks: { fresh: false, geotag: true, original: !dup } },
      events: [
        { at: now(), kind: "reported", text: "Reported with a photo and GPS location.", by: user.id },
        { at: now() + 1, kind: "rejected", text: reason, by: null },
      ],
    });
    return { outcome: "rejected", incident, reason };
  };

  // 1. photo
  const problem = photoProblem(draft.photo);
  const s1 = await step(0, () => (problem ? { fail: true, detail: problem } : { detail: "Taken just now, location matches, no copies found online." }));
  if (s1.fail) return reject(problem, draft.photo.state === "dup");

  // 2. classify
  await step(1, () => ({ detail: `${TYPES[draft.type].label} (${Math.round(confidence * 100)}% confident)` }));

  // 3. GRAP
  const stage = db.settings.stage;
  const grap = grapStatus(draft.type, stage);
  await step(2, () => ({ detail: grap.violation ? `Violation: ${grap.text}` : grap.text }));

  // 4. jurisdiction
  const outside = distM > 30_000;
  const s4 = await step(3, () =>
    outside
      ? { fail: true, detail: "This location is outside the Delhi-NCR area covered by this demo." }
      : { detail: `${place.agency}, ${place.zone}${place.agency === "MCD" ? " zone" : ""}` });
  if (s4.fail) return reject("The location is outside the area Nigrani covers.");

  // 5. exposure
  const probe = enrich({ ...base, id: "tmp", status: "new", reportedAt: now(), dueAt: now(), slaHours: 4, attempts: [], events: [] }, db, now());
  const schools = probe.exposed.filter((r) => r.kind === "school").length;
  const hospitals = probe.exposed.filter((r) => r.kind === "hospital").length;
  await step(4, () => ({
    detail: schools + hospitals
      ? `${[schools && plural(schools, "school"), hospitals && plural(hospitals, "hospital")].filter(Boolean).join(" and ")} downwind`
      : "No schools or hospitals in the smoke path",
  }));

  // 6. dedupe (spatio-temporal: within 250 m and 6 hours)
  const dup = db.incidents.find(
    (i) => i.type === draft.type && isOpen(i) && distance(i, draft) < 250 && now() - i.reportedAt < 6 * HOUR,
  );
  await step(5, () => ({
    detail: dup ? `Matches ${dup.id}, reported ${fmtAgo(dup.reportedAt, now())}. Merged as a new witness.` : "No matching report nearby, so this is a new incident",
  }));

  if (dup) {
    addWitness(dup.id, user.id);
    return { outcome: "merged", incident: getDb().incidents.find((i) => i.id === dup.id) };
  }
  const incident = insertIncident({
    ...base, status: "new",
    ai: { label: TYPES[draft.type].label, confidence, checks: { fresh: true, geotag: true, original: true } },
    events: [
      { at: now(), kind: "reported", text: `Reported with a photo and GPS location (${base.landmark}).`, by: user.id },
      { at: now() + 1, kind: "ai_verified", text: `Photo is fresh and original. Identified as ${TYPES[draft.type].label.toLowerCase()} (${Math.round(confidence * 100)}% confident).`, by: null },
      { at: now() + 2, kind: "routed", text: `Routed to ${place.agency}, ${place.zone}${place.agency === "MCD" ? " zone" : ""} (geofence match).`, by: null },
    ],
  });
  return { outcome: "created", incident };
}

// afterPhoto: { kind: "scene", state: "clean" | "still" | "wrong" } or { kind: "upload", url, demoOutcome: "fixed" | "still" }
export async function attemptClosure(incident, user, afterPhoto, onStep) {
  const step = async (i, run) => {
    onStep(i, "running");
    await wait(900);
    const r = run();
    onStep(i, r.fail ? "failed" : "done", r.detail);
    return r;
  };

  const ctx = { afterPhoto: !!afterPhoto, matchesLocation: !(afterPhoto.kind === "scene" && afterPhoto.state === "wrong") };
  const auth = authorize({ user, action: "CloseIncident", incident, ctx });
  const s1 = await step(0, () => (auth.decision === "Allow" ? { detail: auth.reason } : { fail: true, detail: auth.reason }));
  if (s1.fail) {
    recordDenied(incident.id, user, auth.reason);
    return { outcome: "denied", auth };
  }

  const fixed = afterPhoto.kind === "scene" ? afterPhoto.state === "clean" : afterPhoto.demoOutcome === "fixed";
  const confidence = Math.round((0.86 + (hash(incident.id + (afterPhoto.state ?? "u")) % 11) / 100) * 100) / 100;
  await step(1, () => ({
    detail: fixed
      ? `Same place, issue gone (${Math.round(confidence * 100)}% confident)`
      : `Same place, but the problem is still there (${Math.round(confidence * 100)}% confident)`,
    fail: !fixed,
  }));
  recordAttempt(incident.id, user, { verdict: fixed ? "verified" : "not_fixed", confidence, photo: afterPhoto });
  return { outcome: fixed ? "verified" : "not_fixed", confidence, auth };
}
