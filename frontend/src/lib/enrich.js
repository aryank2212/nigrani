import { RECEPTORS, placeById } from "../data/places.js";
import { distance, plume } from "./geo.js";
import { TYPES, grapStatus, priority, escalation } from "./rules.js";

// Adds everything derived from an incident's raw record: smoke plume, downwind schools and
// hospitals, GRAP status, priority score, escalation level and SLA clock.
export function enrich(inc, db, now) {
  const { wind, stage } = db.settings;
  const place = placeById(inc.placeId);
  const rejected = inc.status === "rejected";
  const t = TYPES[inc.type];
  const pl = plume(inc, wind, { q: t.q, h: t.h });
  const exposed = rejected
    ? []
    : RECEPTORS.map((r) => ({ ...r, ratio: pl.exposureAt(r), distM: distance(inc, r) }))
        .filter((r) => r.ratio >= 1)
        .sort((a, b) => b.ratio - a.ratio);
  return {
    ...inc,
    place, plume: pl, exposed,
    grap: grapStatus(inc.type, stage),
    prio: priority(inc, { stage, exposed, now }),
    esc: escalation(inc, now),
    leftMs: inc.dueAt - now,
  };
}
