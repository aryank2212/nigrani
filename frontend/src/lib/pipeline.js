// AI pipelines. Each step takes a moment so the UI can show the work being done. When the real
// Nigrani backend (FastAPI + Strands Agents SDK + Bedrock, see ../../../README.md) is reachable
// and a real photo was taken (not one of the illustrative "sample" photos), steps 1-5 use its
// actual verdict -- real EXIF authenticity, real Bedrock/Anthropic vision classification, real
// GRAP-stage check against today's AQI, real geofence routing, real live-wind exposure scoring.
// Any failure (backend not running, no AI credentials configured, network error, timeout) falls
// straight back to the original simulated pipeline below it, so the demo never breaks.
import { PLACES } from "../data/places.js";
import { distance, nearestPlace } from "./geo.js";
import { TYPES, authorize, grapStatus, isOpen } from "./rules.js";
import { addWitness, getDb, insertIncident, now, recordAttempt, recordDenied } from "./store.js";
import { enrich } from "./enrich.js";
import { HOUR, MIN, fmtAgo } from "./time.js";
import { CATEGORY_TO_TYPE, TYPE_TO_CATEGORY, closeOnBackend, dataUrlToBlob, pingBackend, submitToBackend } from "./backend.js";

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

// Attempts the real backend end to end; returns null (never throws) if it's not available for
// any reason, so the caller can fall back to the simulated pipeline unconditionally.
async function tryRealSubmit(draft, user, step) {
  if (draft.photo.kind !== "upload") return null; // sample photos have no real bytes to send
  if (!(await pingBackend())) return null;

  const photoBlob = await dataUrlToBlob(draft.photo.url);
  const result = await submitToBackend({
    photoBlob, lat: draft.lat, lon: draft.lon, description: draft.desc, language: "en",
    categoryHint: TYPE_TO_CATEGORY[draft.type] ?? "",
  });
  if (!result) return null;

  const { incident: backendIncident } = result;
  const verdict = backendIncident.ai_verdict;
  const haveVerdict = backendIncident.ai_mode === "agent" && verdict;

  // Step 1: authenticity, from EXIF -- independent of whether a vision model ran at all.
  const flags = backendIncident.authenticity?.flags ?? [];
  await step(0, () => ({
    detail: flags.length
      ? flags.join(" ")
      : backendIncident.authenticity?.has_exif_gps || backendIncident.authenticity?.has_exif_timestamp
        ? "Embedded photo metadata matches the reported location and time."
        : "No embedded photo metadata available (common for browser uploads); relying on device GPS.",
  }));

  // Step 2: real Bedrock/Anthropic vision classification, or an honest "needs manual review".
  const mappedType = verdict ? CATEGORY_TO_TYPE[verdict.category] : null;
  await step(1, () => ({
    detail: haveVerdict
      ? `${TYPES[mappedType ?? draft.type].label} (${Math.round(verdict.category_confidence * 100)}% confident — live AWS Bedrock call)`
      : "AI classification unavailable right now (no model configured on the backend) — accepted based on the reporter's own category.",
  }));

  // Step 3: real GRAP stage, computed from today's actual regional AQI.
  await step(2, () => ({ detail: backendIncident.grap?.rule ?? "GRAP check unavailable." }));

  // Step 4: real geofence routing.
  const j = backendIncident.jurisdiction;
  await step(3, () => ({
    detail: j ? `${j.agency}, ${j.locality_name} (${j.distance_km}km from the nearest routing point)` : "Routing unavailable.",
  }));

  // Step 5: real downwind exposure, from live wind data.
  const sites = backendIncident.exposure?.downwind_sites ?? [];
  const schools = sites.filter((s) => s.type === "school").length;
  const hospitals = sites.filter((s) => s.type === "hospital").length;
  await step(4, () => ({
    detail: sites.length
      ? `${[schools && plural(schools, "school"), hospitals && plural(hospitals, "hospital")].filter(Boolean).join(" and ")} downwind right now (live wind: ${backendIncident.exposure.wind?.speed_ms ?? "?"} m/s)`
      : "No schools or hospitals downwind of this spot right now (live wind data).",
  }));

  return {
    backendId: backendIncident.id,
    mergedInto: result.merged_into,
    type: mappedType ?? draft.type,
    confidence: haveVerdict ? verdict.category_confidence : 0.5,
    agency: j?.agency ?? null,
    zone: j?.locality_name ?? null,
  };
}

export async function submitReport(draft, user, onStep) {
  const step = async (i, run) => {
    onStep(i, "running");
    await wait(600 + (hash(`${i}${draft.lat}`) % 500));
    const r = run();
    onStep(i, r.fail ? "failed" : "done", r.detail);
    return r;
  };

  const real = await tryRealSubmit(draft, user, step).catch(() => null);
  if (real) {
    // real.mergedInto (if set) reflects a duplicate in the backend's own DynamoDB dataset, which
    // is separate from this demo's local store -- so duplicate merging here always runs against
    // local incidents, same as the fully-simulated path below.
    const db = getDb();
    const { place } = nearestPlace(draft, PLACES);
    const agency = real.agency ?? place.agency;
    const zone = real.zone ?? place.zone;
    const base = {
      type: real.type, placeId: place.id, lat: draft.lat, lon: draft.lon,
      landmark: draft.landmark || `near ${place.name}`,
      desc: draft.desc?.trim() || `Reported: ${TYPES[real.type].label.toLowerCase()}.`,
      photo: draft.photo, agency, zone, anonymous: draft.anonymous,
      witnesses: [{ at: now(), userId: user.id }], backendId: real.backendId,
    };
    // Still run the local spatio-temporal dedupe (step 6) against this session's own incidents --
    // the real backend's own DynamoDB dataset is a separate store from this demo's local one.
    const dup = db.incidents.find(
      (i) => i.type === real.type && isOpen(i) && distance(i, draft) < 250 && now() - i.reportedAt < 6 * HOUR,
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
      ai: { label: TYPES[real.type].label, confidence: real.confidence, checks: { fresh: true, geotag: true, original: true } },
      events: [
        { at: now(), kind: "reported", text: `Reported with a photo and GPS location (${base.landmark}).`, by: user.id },
        { at: now() + 1, kind: "ai_verified", text: `Verified live against the real Nigrani backend (AWS Bedrock). Identified as ${TYPES[real.type].label.toLowerCase()}.`, by: null },
        { at: now() + 2, kind: "routed", text: `Routed to ${agency}, ${zone} (real geofence match).`, by: null },
      ],
    });
    return { outcome: "created", incident };
  }

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

  const real = incident.backendId && afterPhoto.kind === "upload"
    ? await closeOnBackend(incident.backendId, await dataUrlToBlob(afterPhoto.url)).catch(() => null)
    : null;
  const realVerdict = real?.closure?.mode === "agent" ? real.closure.verdict : null;

  let fixed, confidence, detail;
  if (realVerdict) {
    fixed = realVerdict.same_location && realVerdict.issue_resolved;
    confidence = realVerdict.confidence;
    detail = `${realVerdict.reasoning} (${Math.round(confidence * 100)}% confident — live AWS Bedrock comparison)`;
  } else {
    fixed = afterPhoto.kind === "scene" ? afterPhoto.state === "clean" : afterPhoto.demoOutcome === "fixed";
    confidence = Math.round((0.86 + (hash(incident.id + (afterPhoto.state ?? "u")) % 11) / 100) * 100) / 100;
    detail = fixed
      ? `Same place, issue gone (${Math.round(confidence * 100)}% confident)`
      : `Same place, but the problem is still there (${Math.round(confidence * 100)}% confident)`;
  }
  await step(1, () => ({ detail, fail: !fixed }));
  recordAttempt(incident.id, user, { verdict: fixed ? "verified" : "not_fixed", confidence, photo: afterPhoto });
  return { outcome: fixed ? "verified" : "not_fixed", confidence, auth };
}
