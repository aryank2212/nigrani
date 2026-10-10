import { HOUR } from "./time.js";

// ---------- complaint types ----------
// q / h feed the plume model (relative source strength, release height in metres).
export const TYPES = {
  waste_burning: { label: "Waste burning", q: 1, h: 4, sla: 4, severity: 40 },
  industrial_smoke: { label: "Industrial smoke", q: 2.2, h: 15, sla: 12, severity: 45 },
  construction_dust: { label: "Construction dust", q: 0.6, h: 3, sla: 24, severity: 28 },
  debris: { label: "Uncovered debris", q: 0.3, h: 2, sla: 48, severity: 15 },
  road_dust: { label: "Road dust", q: 0.3, h: 2, sla: 24, severity: 18 },
};
export const TYPE_IDS = Object.keys(TYPES);

// ---------- GRAP (illustrative summary; always check the current CAQM order) ----------
export const GRAP = {
  0: { name: "No GRAP stage", band: "AQI below 201", measures: ["Routine dust control and anti-burning enforcement."] },
  1: {
    name: "Stage I · Poor", band: "AQI 201–300",
    measures: [
      "Strict action against open burning of waste and biomass.",
      "Dust-mitigation norms enforced at construction sites and on roads.",
      "Mechanised road sweeping and water sprinkling.",
    ],
  },
  2: {
    name: "Stage II · Very Poor", band: "AQI 301–400",
    measures: [
      "Everything in Stage I.",
      "Industrial units on non-approved fuels must switch or shut.",
      "Diesel generator sets restricted to emergency use.",
    ],
  },
  3: {
    name: "Stage III · Severe", band: "AQI 401–450",
    measures: [
      "Everything in Stages I and II.",
      "Non-essential construction and demolition banned.",
      "Stricter checks on industrial emissions.",
    ],
  },
  4: {
    name: "Stage IV · Severe+", band: "AQI above 450",
    measures: [
      "Everything in Stages I to III.",
      "Entry of non-essential trucks into Delhi banned.",
      "Public linear projects (roads, flyovers, pipelines) stopped.",
    ],
  },
};

const RULES = {
  waste_burning: { from: 0, ban: 1, norm: "Open burning of waste is prohibited at all times.", banText: "Open burning is prohibited, and from Stage I it gets priority enforcement." },
  industrial_smoke: { from: 2, ban: 2, norm: "Industries on non-approved fuels must stop from Stage II.", banText: "Stage II+: industries on non-approved fuels must stop." },
  construction_dust: { from: 1, ban: 3, norm: "Dust-mitigation norms apply at all construction sites.", banText: "Stage III+: non-essential construction is banned." },
  debris: { from: 1, ban: 3, norm: "Debris must be covered and removed under dust norms.", banText: "Stage III+: construction activity is banned, debris must be cleared." },
  road_dust: { from: 1, ban: 4, norm: "Road dust must be controlled by sweeping and sprinkling.", banText: "Stage IV: public linear works are stopped." },
};

export function grapStatus(type, stage) {
  const r = RULES[type];
  if (!r || stage < r.from) return { violation: false, level: "none", text: "No GRAP restriction applies at the current stage." };
  if (stage >= r.ban) return { violation: true, level: "ban", text: r.banText };
  return { violation: true, level: "norm", text: r.norm };
}

export const slaHours = (type, stage) => {
  const base = TYPES[type].sla;
  return grapStatus(type, stage).level === "ban" ? Math.max(2, base / 2) : base;
};

// ---------- SLA and escalation ----------
export function escalation(inc, now) {
  if (inc.status === "closed" || inc.status === "rejected") return 0;
  const window = Math.max(2 * HOUR, inc.slaHours * HOUR * 0.5);
  if (now > inc.dueAt + window) return 2;
  if (now > inc.dueAt) return 1;
  return 0;
}
export const ESCALATION_LABEL = ["Field officer", "Nodal officer", "DPCC control room"];

// ---------- priority ----------
export function priority(inc, { stage, exposed, now }) {
  const g = grapStatus(inc.type, stage);
  const open = inc.status !== "closed" && inc.status !== "rejected";
  const parts = [{ label: "Type of pollution", pts: TYPES[inc.type].severity }];
  const grapPts = g.level === "ban" ? 20 : g.level === "norm" ? 8 : 0;
  if (grapPts) parts.push({ label: g.level === "ban" ? "GRAP ban in force" : "Breaks GRAP norms", pts: grapPts });
  let exp = 0;
  for (const r of exposed) {
    const w = r.kind === "hospital" ? 10 : r.age === "primary" ? 9 : 6;
    exp += w * (0.5 + 0.5 * Math.min(1, r.ratio / 5));
  }
  exp = Math.min(25, Math.round(exp));
  if (exp) parts.push({ label: "Schools / hospitals downwind", pts: exp });
  const wit = Math.min(8, Math.round(2 * Math.log2(Math.max(1, inc.witnesses.length))));
  if (wit) parts.push({ label: `${inc.witnesses.length} independent reports`, pts: wit });
  const age = open ? Math.min(7, Math.round(((now - inc.reportedAt) / HOUR / 3) * 10) / 10) : 0;
  if (age >= 1) parts.push({ label: "Time left unresolved", pts: Math.round(age) });
  const score = Math.min(100, parts.reduce((a, p) => a + p.pts, 0));
  const tier = score >= 75 ? "critical" : score >= 55 ? "high" : score >= 35 ? "medium" : "low";
  return { score, tier, parts };
}

// ---------- statuses ----------
export const STATUS = {
  new: { label: "Received", tone: "neutral" },
  acknowledged: { label: "Accepted by officer", tone: "info" },
  in_progress: { label: "Action under way", tone: "info" },
  closed: { label: "Verified fixed", tone: "good" },
  reopened: { label: "Reopened: not fixed", tone: "bad" },
  rejected: { label: "Rejected at intake", tone: "neutral" },
};
export const OPEN = ["new", "acknowledged", "in_progress", "reopened"];
export const isOpen = (inc) => OPEN.includes(inc.status);

// ---------- SafeRecess school advisory (ported from app/services/risk.py) ----------
export const SCHOOL_SAY = [
  "Safe to play outside",
  "Fine, watch sensitive children",
  "Keep outdoor time short",
  "Recess indoors today",
  "Stay inside",
  "Consider closing early",
];
export function schoolAdvice(aqi, age) {
  const base = aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : aqi <= 200 ? 3 : aqi <= 300 ? 4 : 5;
  const level = Math.min(5, base + (age === "primary" ? 1 : 0));
  return { level, say: SCHOOL_SAY[level] };
}

// ---------- policy engine ----------
// The policies are written in Cedar syntax (AWS's open-source authorization language) and
// mirrored by small JS predicates, so the demo can show real allow/deny decisions in the browser.
// ponytail: mock evaluator; swap for Amazon Verified Permissions / cedar-wasm on the real backend.
export const POLICIES = [
  {
    id: "P1", effect: "permit", actions: ["CloseIncident"],
    title: "Officers close only inside their own jurisdiction",
    cedar: `permit (
  principal in Role::"officer",
  action == Action::"CloseIncident",
  resource
) when {
  principal.agency == resource.agency &&
  (principal.zone == "*" || principal.zone == resource.zone) &&
  resource.status in ["acknowledged", "in_progress", "reopened"]
};`,
    test: ({ user, incident }) => {
      if (user.role !== "officer") return { ok: false, why: "Only field officers can close incidents." };
      if (user.agency !== incident.agency) return { ok: false, why: `${incident.agency} owns this incident, not ${user.agency}.` };
      if (user.zone !== "*" && user.zone !== incident.zone) return { ok: false, why: `Incident is in ${incident.zone} zone; officer covers ${user.zone}.` };
      if (incident.status === "closed") return { ok: false, why: "This incident is already closed." };
      if (!["acknowledged", "in_progress", "reopened"].includes(incident.status)) return { ok: false, why: "Incident must be accepted before it can be closed." };
      return { ok: true, why: "Officer is inside their jurisdiction and the incident is in an actionable state." };
    },
  },
  {
    id: "P2", effect: "forbid", actions: ["CloseIncident"],
    title: "No closure without a verified after-photo",
    cedar: `forbid (
  principal,
  action == Action::"CloseIncident",
  resource
) unless {
  context.afterPhoto == true &&
  context.afterPhotoMatchesLocation == true
};`,
    test: ({ ctx }) =>
      !ctx.afterPhoto
        ? { ok: true, why: "No after-photo was attached." }
        : !ctx.matchesLocation
          ? { ok: true, why: "After-photo location does not match the original report." }
          : { ok: false, why: "After-photo attached and location matches." },
  },
  {
    id: "P3", effect: "permit", actions: ["Reassign"],
    title: "Nodal officers reassign within their agency",
    cedar: `permit (
  principal in Role::"nodal",
  action == Action::"Reassign",
  resource
) when { principal.agency == resource.agency };`,
    test: ({ user, incident }) =>
      user.role === "nodal" && user.agency === incident.agency
        ? { ok: true, why: "Nodal officer of the owning agency." }
        : { ok: false, why: "Only the nodal officer of the owning agency can reassign." },
  },
  {
    id: "P4", effect: "permit", actions: ["Reassign", "SetGrapStage", "ViewPrivate"],
    title: "Control room has city-wide authority",
    cedar: `permit (
  principal in Role::"admin",
  action in [Action::"Reassign", Action::"SetGrapStage", Action::"ViewPrivate"],
  resource
);`,
    test: ({ user }) =>
      user.role === "admin" ? { ok: true, why: "Control room role." } : { ok: false, why: "Not a control-room user." },
  },
  {
    id: "P5", effect: "permit", actions: ["ViewPrivate"],
    title: "Citizens see full detail of their own reports",
    cedar: `permit (
  principal in Role::"citizen",
  action == Action::"ViewPrivate",
  resource
) when { resource.reporter == principal };`,
    test: ({ user, incident }) =>
      user.role === "citizen" && incident.witnesses.some((w) => w.userId === user.id)
        ? { ok: true, why: "Citizen is a reporter on this incident." }
        : { ok: false, why: "Not a reporter on this incident." },
  },
  {
    id: "P6", effect: "permit", actions: ["ViewPrivate"],
    title: "Agency staff see incidents in their agency",
    cedar: `permit (
  principal in [Role::"officer", Role::"nodal"],
  action == Action::"ViewPrivate",
  resource
) when { principal.agency == resource.agency };`,
    test: ({ user, incident }) =>
      (user.role === "officer" || user.role === "nodal") && user.agency === incident.agency
        ? { ok: true, why: "Same agency." }
        : { ok: false, why: "Different agency or role." },
  },
  {
    id: "P7", effect: "permit", actions: ["ViewPublic"],
    title: "Anyone can view anonymised public incident pages",
    cedar: `permit (principal, action == Action::"ViewPublic", resource);`,
    test: () => ({ ok: true, why: "Public pages are open to everyone." }),
  },
];
export const ACTIONS = ["CloseIncident", "Reassign", "SetGrapStage", "ViewPrivate", "ViewPublic"];

export function authorize({ user, action, incident, ctx = {} }) {
  const rows = POLICIES.filter((p) => p.actions.includes(action)).map((p) => ({
    id: p.id, effect: p.effect, title: p.title, ...p.test({ user, incident, ctx }),
  }));
  const forbid = rows.find((r) => r.effect === "forbid" && r.ok);
  const permit = rows.find((r) => r.effect === "permit" && r.ok);
  const decision = !forbid && permit ? "Allow" : "Deny";
  const reason = forbid
    ? `Denied by ${forbid.id}: ${forbid.why}`
    : permit
      ? `Allowed by ${permit.id}: ${permit.why}`
      : `Denied: no policy permits this. ${rows.filter((r) => r.effect === "permit").map((r) => r.why)[0] ?? ""}`;
  return { decision, reason, rows };
}
