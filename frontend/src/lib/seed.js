// Generates the simulated starting data: ~85 incidents spread over 30 days, with realistic
// failure patterns (ignored complaints, fake closures that get reopened, late fixes).
// Deterministic: the same seed always produces the same story, relative to "now".
import { PLACES, placeById } from "../data/places.js";
import { USERS } from "../data/users.js";
import { TYPES, slaHours } from "./rules.js";
import { HOUR, MIN } from "./time.js";
import { offset } from "./geo.js";

function rngFrom(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultOfficer = (agency, zone) =>
  USERS.find((u) => u.role === "officer" && u.agency === agency && (u.zone === "*" || u.zone === zone)) ?? null;

const AGENCY_BEHAVIOUR = {
  MCD: { act: 0.72, ver: 0.55, late: 1.3 },
  NDMC: { act: 0.92, ver: 0.88, late: 0.7 },
  PWD: { act: 0.75, ver: 0.66, late: 1.1 },
  DDA: { act: 0.6, ver: 0.5, late: 1.5 },
  DSIIDC: { act: 0.55, ver: 0.42, late: 1.4 },
  DCB: { act: 0.95, ver: 0.95, late: 0.6 },
};

const LANDMARKS = [
  "near the main market", "behind the community hall", "opposite the bus stop", "on the service road",
  "beside the park boundary", "near the metro station gate", "in the empty plot off the school lane",
  "outside the petrol pump", "near the nala crossing", "at the corner of Block C",
];
const DESCRIPTIONS = {
  waste_burning: [
    "Garbage heap set on fire, thick smoke drifting into the lane.",
    "Someone is burning plastic and leaves, the smell is strong.",
    "Waste is being burned in the open here every evening.",
  ],
  construction_dust: [
    "Construction site with no cover, dust all over the road.",
    "Demolition going on without any water sprinkling.",
    "Cement and sand unloaded with no screening.",
  ],
  debris: [
    "Construction debris dumped on the roadside, uncovered.",
    "Pile of rubble blocking half the lane, dust rises when trucks pass.",
  ],
  industrial_smoke: [
    "Factory chimney releasing black smoke since morning.",
    "Unit burning scrap at night, heavy fumes.",
  ],
  road_dust: [
    "Road is broken and unswept, dust clouds behind every vehicle.",
    "Soil spilling from the median onto the road, no sprinkling.",
  ],
};
const ACTIONS = {
  waste_burning: ["Fire extinguished with water tender", "Waste removed, fine issued to the owner"],
  construction_dust: ["Notice issued, site told to cover and sprinkle", "Anti-smog gun deployed on site"],
  debris: ["Debris covered with tarpaulin, removal scheduled", "Truck dispatched to lift the debris"],
  industrial_smoke: ["Inspection team sent, unit told to stop the furnace", "Closure notice served"],
  road_dust: ["Mechanical sweeper and water sprinkler sent", "Soil removed from the carriageway"],
};
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const between = (rng, a, b) => a + rng() * (b - a);

function weighted(rng, items, weightOf) {
  const total = items.reduce((s, x) => s + weightOf(x), 0);
  let r = rng() * total;
  for (const x of items) { r -= weightOf(x); if (r <= 0) return x; }
  return items[items.length - 1];
}

const TYPE_MIX = {
  residential: { waste_burning: 0.45, construction_dust: 0.25, debris: 0.2, road_dust: 0.1 },
  landfill: { waste_burning: 0.75, industrial_smoke: 0.15, debris: 0.1 },
  road: { road_dust: 0.55, debris: 0.25, construction_dust: 0.2 },
  green: { waste_burning: 0.7, debris: 0.3 },
  industrial: { industrial_smoke: 0.6, waste_burning: 0.3, debris: 0.1 },
};
const PLACE_WEIGHT = { MCD: 2, NDMC: 1, PWD: 1.5, DDA: 1, DCB: 1, DSIIDC: 1.5 };

function build(spec, ctx) {
  const { now, stage, rng } = ctx;
  const place = placeById(spec.placeId);
  const reportedAt = now - spec.hoursAgo * HOUR;
  const age = now - reportedAt;
  const point = spec.point ?? offset(place, between(rng, -400, 400), between(rng, -400, 400));
  const sla = slaHours(spec.type, stage);
  const officer = defaultOfficer(place.agency, place.zone);
  const b = AGENCY_BEHAVIOUR[place.agency];
  const confidence = Math.round(between(rng, 0.82, 0.98) * 100) / 100;

  const witnesses = [{ at: reportedAt, userId: spec.userId ?? null }];
  for (let i = 1; i < (spec.witnesses ?? 1); i++) {
    witnesses.push({ at: reportedAt + Math.min(age * 0.9, (i * 9 + between(rng, 0, 8)) * MIN), userId: null });
  }

  const inc = {
    id: "",
    type: spec.type,
    placeId: place.id,
    lat: point.lat, lon: point.lon,
    landmark: spec.landmark ?? pick(rng, LANDMARKS),
    reportedAt,
    desc: spec.desc ?? pick(rng, DESCRIPTIONS[spec.type]),
    photo: { kind: "scene", state: "active" },
    ai: { label: TYPES[spec.type].label, confidence, checks: { fresh: true, geotag: true, original: true } },
    agency: place.agency, zone: place.zone,
    witnesses,
    status: "new",
    slaHours: sla,
    dueAt: reportedAt + sla * HOUR,
    assignedTo: officer?.id ?? null,
    reopenCount: 0,
    attempts: [],
    events: [],
    closure: null,
    anonymous: !!spec.anonymous,
  };
  const ev = (at, kind, text, by = null, meta) => inc.events.push({ at, kind, text, by, ...(meta ? { meta } : {}) });
  ev(reportedAt, "reported", `Reported with a photo and GPS location (${inc.landmark}).`, spec.userId ?? null);

  if (spec.rejected) {
    inc.status = "rejected";
    inc.ai = { ...inc.ai, checks: { fresh: false, geotag: true, original: spec.rejected.dup ? false : true } };
    inc.rejectReason = spec.rejected.reason;
    inc.slaHours = 0;
    ev(reportedAt + MIN, "rejected", spec.rejected.reason);
    return inc;
  }

  ev(reportedAt + MIN, "ai_verified", `Photo is fresh and original. Identified as ${TYPES[spec.type].label.toLowerCase()} (${Math.round(confidence * 100)}% confident).`);
  ev(reportedAt + 2 * MIN, "routed", `Routed to ${place.agency}, ${place.zone}${place.agency === "MCD" ? " zone" : ""} (geofence match).`);
  inc.witnesses.slice(1).forEach((w, i) => {
    if (i < 3) ev(w.at, "merged", `Another report matched this incident (${i + 2} reports now).`);
  });

  // ---- decide how far the agency got ----
  let plan = spec.plan;
  if (!plan) {
    if (age < 2 * HOUR) plan = rng() < 0.5 ? "open" : "acked";
    // Old complaints that nobody ever touched exist, but they are the exception, not the whole backlog.
    else if (rng() > 1 - (1 - b.act) * (age > 120 * HOUR ? 0.35 : 1)) plan = "open";
    else plan = rng() < b.ver ? "verified" : rng() < 0.3 ? "retry_verified" : "reopened";
  }
  const hrs = (n) => n * HOUR;
  const ackAt = reportedAt + hrs(between(rng, 0.2, 2) * b.late);
  const actAt = ackAt + hrs(between(rng, 0.3, 1.5));
  const try1 = actAt + hrs(sla * between(rng, 0.2, 1.4) * b.late);
  const try2 = try1 + hrs(sla * between(rng, 0.3, 1.2));
  const fits = (t) => t < now - 10 * MIN;

  if (plan !== "open" && !fits(ackAt)) plan = "open";
  if ((plan === "verified" || plan === "reopened" || plan === "retry_verified") && !fits(try1)) plan = fits(actAt) ? "inprogress" : "acked";
  if (plan === "retry_verified" && !fits(try2)) plan = "reopened";
  if (plan === "inprogress" && !fits(actAt)) plan = "acked";

  const attempt = (at, verdict) => {
    const conf = Math.round(between(rng, 0.8, 0.96) * 100) / 100;
    inc.attempts.push({ at, by: officer?.id ?? null, verdict, confidence: conf });
    return conf;
  };
  const acknowledge = () => {
    inc.status = "acknowledged";
    ev(ackAt, "acknowledged", `Accepted by ${officer?.name ?? "the field officer"}.`, officer?.id ?? null);
  };
  const action = () => {
    inc.status = "in_progress";
    ev(actAt, "action", pick(rng, ACTIONS[spec.type]) + ".", officer?.id ?? null);
  };
  const notFixed = (at) => {
    const conf = attempt(at, "not_fixed");
    ev(at, "closure_attempt", `Officer marked it fixed. AI compared before and after photos: still present (${Math.round(conf * 100)}% confident).`, officer?.id ?? null);
    inc.status = "reopened";
    inc.reopenCount += 1;
    inc.dueAt = at + Math.max(2, sla / 2) * HOUR;
    ev(at + MIN, "reopened", "Closure rejected. Incident reopened automatically.");
  };
  const verified = (at) => {
    const conf = attempt(at, "verified");
    ev(at, "closure_attempt", `Officer uploaded an after photo. AI confirmed same place and issue gone (${Math.round(conf * 100)}% confident).`, officer?.id ?? null);
    inc.status = "closed";
    inc.closure = { at: at + MIN, by: officer?.id ?? null, confidence: conf };
    ev(at + MIN, "closed", "Verified fixed and closed.");
  };

  if (plan === "acked") acknowledge();
  if (plan === "inprogress") { acknowledge(); action(); }
  if (plan === "verified") { acknowledge(); action(); verified(try1); }
  if (plan === "reopened") { acknowledge(); action(); notFixed(try1); }
  if (plan === "retry_verified") { acknowledge(); action(); notFixed(try1); verified(try2); }
  inc.events.sort((a, b) => a.at - b.at);
  return inc;
}

export function buildSeed(now = Date.now()) {
  const rng = rngFrom(20261010);
  const stage = 3;
  const ctx = { now, stage, rng };
  const specs = [];

  // Hand-written incidents that tell the demo story.
  const NDPS = placeById("ashok-vihar");
  specs.push(
    { placeId: "ashok-vihar", type: "waste_burning", hoursAgo: 0.7, witnesses: 6, plan: "open", userId: "u-cit-1",
      point: { lat: NDPS.lat + 0.0035, lon: NDPS.lon - 0.0042 },
      landmark: "next to the Block C park, about 500 m from North Delhi Public School",
      desc: "Big pile of garbage and plastic burning, black smoke is blowing towards the school lane." },
    { placeId: "rohini-s7", type: "construction_dust", hoursAgo: 2.5, witnesses: 3, plan: "acked" },
    { placeId: "bawana", type: "industrial_smoke", hoursAgo: 3.2, witnesses: 4, plan: "open" },
    { placeId: "bhalswa", type: "waste_burning", hoursAgo: 5.5, witnesses: 9, plan: "open" },
    { placeId: "patparganj", type: "construction_dust", hoursAgo: 7, witnesses: 2, plan: "reopened", userId: "u-cit-2" },
    { placeId: "ghazipur", type: "waste_burning", hoursAgo: 9, witnesses: 12, plan: "open" },
    { placeId: "ring-road-moolchand", type: "road_dust", hoursAgo: 1.8, witnesses: 1, plan: "acked" },
    { placeId: "anand-vihar", type: "waste_burning", hoursAgo: 1.4, witnesses: 2, plan: "inprogress" },
    { placeId: "ashok-vihar", type: "construction_dust", hoursAgo: 52, witnesses: 3, plan: "verified", userId: "u-cit-1" },
    { placeId: "patparganj", type: "debris", hoursAgo: 80, witnesses: 1, plan: "verified", userId: "u-cit-2" },
    { placeId: "ashok-vihar", type: "waste_burning", hoursAgo: 6, witnesses: 1, userId: "u-cit-1",
      rejected: { reason: "The photo was taken 3 days before the report, so it cannot be used as evidence." } },
    { placeId: "karol-bagh", type: "waste_burning", hoursAgo: 30, witnesses: 1, anonymous: true,
      rejected: { reason: "This image was already used in another report (duplicate evidence).", dup: true } },
    { placeId: "mayapuri", type: "industrial_smoke", hoursAgo: 55, witnesses: 1, anonymous: true,
      rejected: { reason: "The photo location is 6 km away from the reported location." } },
  );

  // Background noise: a month of complaints with realistic agency behaviour.
  for (let i = 0; i < 72; i++) {
    const place = weighted(rng, PLACES, (p) => PLACE_WEIGHT[p.agency]);
    const mix = TYPE_MIX[place.kind];
    const type = weighted(rng, Object.keys(mix), (t) => mix[t]);
    const hoursAgo = 24 * 30 * Math.pow(rng(), 2.2) + 0.5;
    specs.push({ placeId: place.id, type, hoursAgo, witnesses: 1 + Math.floor(Math.pow(rng(), 3) * 8), anonymous: rng() < 0.3 });
  }

  const incidents = specs.map((s) => build(s, ctx)).sort((a, b) => a.reportedAt - b.reportedAt);
  incidents.forEach((inc, i) => { inc.id = `NGR-26-${String(412 + i).padStart(4, "0")}`; });

  return {
    v: 5,
    incidents,
    users: [],
    session: { userId: null },
    counter: 412 + incidents.length,
    settings: { stage, wind: { fromDeg: 315, speedKmh: 9 }, clockOffset: 0 },
    seededAt: now,
  };
}
