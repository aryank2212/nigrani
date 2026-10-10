import { Link } from "react-router-dom";
import { useUser } from "../../lib/store.js";
import { useIncidents, useNow, useTitle } from "../../lib/hooks.js";
import { ESCALATION_LABEL, TYPES, isOpen } from "../../lib/rules.js";
import { USERS } from "../../data/users.js";
import { AGENCIES } from "../../data/places.js";
import { agencyStats } from "../../lib/stats.js";
import { fmtDuration, fmtPct } from "../../lib/time.js";
import { Empty, PageHead, Sla, Stat, TierBadge } from "../../components/ui.jsx";

export default function Nodal() {
  useTitle("Dashboard");
  const user = useUser();
  const now = useNow();
  const all = useIncidents();
  const mine = all.filter((i) => i.agency === user.agency && i.status !== "rejected");
  const open = mine.filter(isOpen);
  const me = agencyStats(all, now).find((r) => r.id === user.agency);
  const withMe = open.filter((i) => i.esc === 1);
  const withDpcc = open.filter((i) => i.esc === 2);
  // Items waiting on the nodal officer come first; ones already past DPCC's deadline follow.
  const attention = [...withMe.sort((a, b) => a.dueAt - b.dueAt), ...withDpcc.sort((a, b) => b.prio.score - a.prio.score)];

  const officers = USERS.filter((u) => u.role === "officer" && u.agency === user.agency).map((o) => {
    const theirs = mine.filter((i) => o.zone === "*" || i.zone === o.zone);
    const attempts = theirs.flatMap((i) => i.attempts);
    return {
      o, open: theirs.filter(isOpen).length, overdue: theirs.filter((i) => isOpen(i) && i.leftMs < 0).length,
      attempts: attempts.length, verified: attempts.filter((a) => a.verdict === "verified").length,
    };
  });

  const zones = [...new Set(mine.map((i) => i.zone))].map((z) => {
    const list = mine.filter((i) => i.zone === z);
    return { z, total: list.length, open: list.filter(isOpen).length, overdue: list.filter((i) => isOpen(i) && i.leftMs < 0).length, verified: list.filter((i) => i.status === "closed").length };
  }).sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  const maxZone = Math.max(1, ...zones.map((z) => z.total));

  return (
    <div className="wrap-wide page">
      <PageHead eyebrow={`${user.name} · ${AGENCIES[user.agency].name}`} title="Nodal dashboard" />

      <div className="grid-4 stats">
        <Stat label="Open complaints" value={open.length} />
        <Stat label="Waiting on you" value={withMe.length} tone={withMe.length ? "bad" : undefined} hint="Field officer missed the deadline" />
        <Stat label="Gone to DPCC" value={withDpcc.length} tone={withDpcc.length ? "bad" : undefined} hint="Missed the nodal deadline too" />
        <Stat label="Verified fix rate (30 days)" value={fmtPct(me.verifiedRate)} hint={`Officers said ${fmtPct(me.claimedRate)}${me.medianMs ? ` · median fix ${fmtDuration(me.medianMs)}` : ""}`} />
      </div>

      <section className="block-sm" aria-labelledby="att-h">
        <h2 id="att-h" className="block-title">Needs your attention</h2>
        {attention.length === 0 ? <Empty title="Nothing escalated">Every open complaint is still inside its deadline.</Empty> : (
          <ul className="queue">
            {attention.slice(0, 8).map((i) => (
              <li key={i.id}>
                <Link to={`/incident/${i.id}`} className="q-row">
                  <div className="q-prio"><TierBadge prio={i.prio} /></div>
                  <div className="q-main">
                    <p className="q-title">{TYPES[i.type].label} <span className="muted">· {i.place.name}</span></p>
                    <p className="muted small"><span className="mono">{i.id}</span> · {i.zone} · now with {ESCALATION_LABEL[i.esc]}</p>
                  </div>
                  <div className="q-badges"><Sla inc={i} now={now} /></div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="two-col">
        <section aria-labelledby="off-h">
          <h2 id="off-h" className="block-title">Your officers</h2>
          <table className="table">
            <caption className="visually-hidden">Field officers and their workload</caption>
            <thead><tr><th scope="col">Officer</th><th scope="col">Open</th><th scope="col">Overdue</th><th scope="col">Closures verified</th></tr></thead>
            <tbody>
              {officers.map(({ o, open: op, overdue, attempts, verified }) => (
                <tr key={o.id}>
                  <th scope="row">{o.name}<span className="muted small block-sm">{o.title}</span></th>
                  <td>{op}</td><td>{overdue}</td>
                  <td>{attempts ? `${verified} of ${attempts}` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="zone-h">
          <h2 id="zone-h" className="block-title">By zone</h2>
          <ul className="zone-bars">
            {zones.map((z) => (
              <li key={z.z}>
                <div className="zb-head"><span>{z.z}</span><span className="muted small">{z.open} open · {z.overdue} overdue · {z.verified} fixed</span></div>
                <span className="bar"><i className="bar-verified" style={{ width: `${(z.verified / maxZone) * 100}%` }} /><i className="bar-open" style={{ width: `${(z.open / maxZone) * 100}%` }} /></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
