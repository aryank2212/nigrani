// The simulated backend. All state lives in one immutable object persisted to localStorage, so a
// report filed as a citizen really does show up in an officer's queue after switching accounts.
// ponytail: single shared localStorage db. Replace these actions with API calls when the
// real AWS backend (API Gateway + Lambda + DynamoDB) exists; components only call these.
import { useSyncExternalStore } from "react";
import { buildSeed, defaultOfficer } from "./seed.js";
import { USERS, DEMO_PASSWORD, DEMO_OTP } from "../data/users.js";
import { slaHours } from "./rules.js";
import { HOUR } from "./time.js";

const KEY = "nigrani.db";
const VERSION = 5;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.v === VERSION) return parsed;
    }
  } catch { /* fall through to a fresh seed */ }
  return buildSeed();
}

let db = load();
const listeners = new Set();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota: keep working in memory */ }
}
function commit(next) {
  db = next;
  persist();
  listeners.forEach((l) => l());
}
persist();

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue) {
      try { db = JSON.parse(e.newValue); listeners.forEach((l) => l()); } catch { /* ignore */ }
    }
  });
}

export const getDb = () => db;
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const useDb = () => useSyncExternalStore(subscribe, getDb);
export const now = () => Date.now() + db.settings.clockOffset;

export const allUsers = (d = db) => [...USERS, ...d.users];
export const currentUser = (d = db) => allUsers(d).find((u) => u.id === d.session.userId) ?? null;
export const useUser = () => currentUser(useDb());

// ---------- auth ----------
export function loginWithPassword(email, password) {
  const user = USERS.find((u) => u.email === email.trim().toLowerCase());
  if (!user || password !== DEMO_PASSWORD) throw new Error("Email or password is not correct.");
  commit({ ...db, session: { userId: user.id } });
  return user;
}

export function loginWithOtp(phone, otp, name) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) throw new Error("Enter a 10-digit mobile number.");
  if (otp !== DEMO_OTP) throw new Error("That code is not correct.");
  let user = allUsers().find((u) => u.role === "citizen" && u.phone === digits);
  if (!user) {
    user = { id: `u-cit-${Date.now()}`, role: "citizen", name: name?.trim() || "New citizen", phone: digits, area: "" };
    commit({ ...db, users: [...db.users, user], session: { userId: user.id } });
  } else {
    commit({ ...db, session: { userId: user.id } });
  }
  return user;
}

export const switchUser = (id) => commit({ ...db, session: { userId: id } });
export const logout = () => commit({ ...db, session: { userId: null } });

// ---------- incidents ----------
function updateIncident(id, fn) {
  commit({ ...db, incidents: db.incidents.map((i) => (i.id === id ? fn(i) : i)) });
}
const withEvent = (inc, kind, text, by = null, meta) => ({
  ...inc,
  events: [...inc.events, { at: now(), kind, text, by, ...(meta ? { meta } : {}) }],
});

export function insertIncident(draft) {
  const id = `NGR-26-${String(db.counter).padStart(4, "0")}`;
  const sla = slaHours(draft.type, db.settings.stage);
  const t = now();
  const officer = defaultOfficer(draft.agency, draft.zone);
  const inc = {
    attempts: [], closure: null, reopenCount: 0, events: [],
    ...draft, id, reportedAt: t, slaHours: sla, dueAt: t + sla * HOUR, assignedTo: officer?.id ?? null,
  };
  commit({ ...db, counter: db.counter + 1, incidents: [...db.incidents, inc] });
  return inc;
}

export function addWitness(id, userId) {
  updateIncident(id, (inc) => ({
    ...withEvent(inc, "merged", `Another report matched this incident (${inc.witnesses.length + 1} reports now).`, userId),
    witnesses: [...inc.witnesses, { at: now(), userId }],
  }));
}

export const acknowledge = (id, user) =>
  updateIncident(id, (inc) => ({
    ...withEvent(inc, "acknowledged", `Accepted by ${user.name}.`, user.id),
    status: "acknowledged", assignedTo: user.id,
  }));

export const logAction = (id, user, text) =>
  updateIncident(id, (inc) => ({ ...withEvent(inc, "action", text, user.id), status: "in_progress" }));

export const reassign = (id, user, agency, zone, note) =>
  updateIncident(id, (inc) => {
    const officer = defaultOfficer(agency, zone);
    return {
      ...withEvent(inc, "reassigned", `${user.name} reassigned this to ${agency}${zone && zone !== "*" ? `, ${zone}` : ""}.${note ? ` Note: ${note}` : ""}`, user.id),
      agency, zone: zone || inc.zone, assignedTo: officer?.id ?? null, status: "new",
      dueAt: now() + inc.slaHours * HOUR,
    };
  });

export const recordDenied = (id, user, reason) =>
  updateIncident(id, (inc) => withEvent(inc, "closure_denied", `Closure attempt by ${user.name} was denied. ${reason}`, user.id));

export function recordAttempt(id, user, { verdict, confidence, photo }) {
  updateIncident(id, (inc) => {
    const t = now();
    const attempts = [...inc.attempts, { at: t, by: user.id, verdict, confidence, photo }];
    const pct = Math.round(confidence * 100);
    if (verdict === "verified") {
      return {
        ...withEvent(withEvent({ ...inc, attempts }, "closure_attempt", `After photo uploaded. AI confirmed same place and issue gone (${pct}% confident).`, user.id), "closed", "Verified fixed and closed."),
        status: "closed", closure: { at: t, by: user.id, confidence, photo },
      };
    }
    const reopened = withEvent(withEvent({ ...inc, attempts }, "closure_attempt", `Officer marked it fixed. AI compared before and after photos: still present (${pct}% confident).`, user.id), "reopened", "Closure rejected. Incident reopened automatically.");
    return { ...reopened, status: "reopened", reopenCount: inc.reopenCount + 1, dueAt: t + Math.max(2, inc.slaHours / 2) * HOUR };
  });
}

// ---------- simulation controls ----------
export const setStage = (stage) => commit({ ...db, settings: { ...db.settings, stage } });
export const setWind = (wind) => commit({ ...db, settings: { ...db.settings, wind: { ...db.settings.wind, ...wind } } });
export const advanceClock = (ms) => commit({ ...db, settings: { ...db.settings, clockOffset: db.settings.clockOffset + ms } });
export function resetDemo() {
  const keep = db.session;
  commit({ ...buildSeed(), session: keep });
}
