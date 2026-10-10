import { FIELD_AGENCIES } from "../data/places.js";
import { isOpen } from "./rules.js";
import { DAY, HOUR } from "./time.js";

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const valid = (list, now, days) => list.filter((i) => i.status !== "rejected" && i.reportedAt >= now - days * DAY);

// "Claimed" = the officer marked it fixed at least once (what an agency would self-report).
// "Verified" = the AI confirmed the fix from an after-photo (what the scoreboard publishes).
export function agencyStats(list, now, days = 30) {
  return FIELD_AGENCIES.map((id) => {
    const mine = valid(list.filter((i) => i.agency === id), now, days);
    const total = mine.length;
    const claimed = mine.filter((i) => i.attempts.length > 0).length;
    const closed = mine.filter((i) => i.status === "closed");
    const attempts = mine.flatMap((i) => i.attempts);
    const open = mine.filter(isOpen);
    return {
      id, total, claimed, verified: closed.length,
      claimedRate: total ? claimed / total : 0,
      verifiedRate: total ? closed.length / total : 0,
      reopenRate: attempts.length ? attempts.filter((a) => a.verdict === "not_fixed").length / attempts.length : 0,
      onTimeRate: closed.length ? closed.filter((i) => i.closure.at <= i.reportedAt + i.slaHours * HOUR).length / closed.length : 0,
      medianMs: median(closed.map((i) => i.closure.at - i.reportedAt)),
      open: open.length,
      overdue: open.filter((i) => i.leftMs < 0).length,
    };
  });
}

export function cityStats(list, now, days = 30) {
  const mine = valid(list, now, days);
  const open = mine.filter(isOpen);
  const closed = mine.filter((i) => i.status === "closed");
  const attempts = mine.flatMap((i) => i.attempts);
  const schools = new Set(open.flatMap((i) => i.exposed.filter((r) => r.kind === "school").map((r) => r.id)));
  return {
    total: mine.length,
    open: open.length,
    overdue: open.filter((i) => i.leftMs < 0).length,
    critical: open.filter((i) => i.prio.tier === "critical").length,
    escalatedDpcc: open.filter((i) => i.esc === 2).length,
    verifiedRate: mine.length ? closed.length / mine.length : 0,
    medianMs: median(closed.map((i) => i.closure.at - i.reportedAt)),
    fakeClosuresCaught: attempts.filter((a) => a.verdict === "not_fixed").length,
    schoolsDownwind: schools.size,
    rejected: list.filter((i) => i.status === "rejected" && i.reportedAt >= now - days * DAY).length,
  };
}

export function hotspots(list, now, days = 30, limit = 6) {
  const by = new Map();
  for (const i of valid(list, now, days)) {
    const row = by.get(i.placeId) ?? { placeId: i.placeId, name: i.place.name, agency: i.agency, count: 0, open: 0, lat: i.place.lat, lon: i.place.lon };
    row.count += 1;
    if (isOpen(i)) row.open += 1;
    by.set(i.placeId, row);
  }
  return [...by.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
