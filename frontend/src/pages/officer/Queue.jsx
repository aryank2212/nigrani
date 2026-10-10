import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../../lib/store.js";
import { useIncidents, useNow, useTitle } from "../../lib/hooks.js";
import { TYPES, TYPE_IDS, isOpen } from "../../lib/rules.js";
import { FIELD_AGENCIES } from "../../data/places.js";
import { fmtAgo } from "../../lib/time.js";
import { Badge, Empty, PageHead, Segmented, Sla, Stat, StatusBadge, TierBadge } from "../../components/ui.jsx";

const PAGE = 25;

// One queue component for three roles: field officer (own jurisdiction), nodal officer (own agency), control room (everything).
export default function Queue({ mode = "officer" }) {
  const user = useUser();
  const now = useNow();
  const all = useIncidents();
  useTitle(mode === "admin" ? "All incidents" : "Queue");

  const [scope, setScope] = useState("mine");
  const [agency, setAgency] = useState("all");
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("priority");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  const scoped = useMemo(() => {
    let l = all.filter((i) => i.status !== "rejected");
    if (mode === "officer") l = l.filter((i) => i.agency === user.agency && (scope === "agency" || user.zone === "*" || i.zone === user.zone));
    if (mode === "nodal") l = l.filter((i) => i.agency === user.agency);
    if (mode === "admin" && agency !== "all") l = l.filter((i) => i.agency === agency);
    return l;
  }, [all, mode, user, scope, agency]);

  const rows = useMemo(() => {
    let l = scoped.filter((i) => {
      if (status === "open" && !isOpen(i)) return false;
      if (status === "overdue" && !(isOpen(i) && i.leftMs < 0)) return false;
      if (status === "reopened" && i.status !== "reopened") return false;
      if (status === "closed" && i.status !== "closed") return false;
      if (type !== "all" && i.type !== type) return false;
      if (q && !`${i.id} ${i.place.name} ${i.zone} ${i.landmark}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    const key = { priority: (a, b) => b.prio.score - a.prio.score, due: (a, b) => a.dueAt - b.dueAt, newest: (a, b) => b.reportedAt - a.reportedAt }[sort];
    return l.sort(key);
  }, [scoped, status, type, q, sort]);

  const open = scoped.filter(isOpen);
  const title = mode === "admin" ? "All incidents" : mode === "nodal" ? `${user.agency} queue` : "Your queue";
  const eyebrow = mode === "officer" ? `${user.name} · ${user.title}` : mode === "nodal" ? "Everything in your agency" : "Every agency, every zone";

  return (
    <div className="wrap-wide page">
      <PageHead eyebrow={eyebrow} title={title}>
        {mode === "officer" && user.zone !== "*" && (
          <Segmented label="Scope" value={scope} onChange={setScope} options={[{ value: "mine", label: `${user.zone} zone` }, { value: "agency", label: `All ${user.agency}` }]} />
        )}
        {mode === "admin" && (
          <div className="field inline"><label htmlFor="ag">Agency</label>
            <select id="ag" value={agency} onChange={(e) => setAgency(e.target.value)}>
              <option value="all">All agencies</option>
              {FIELD_AGENCIES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        )}
      </PageHead>

      <div className="grid-4 stats">
        <Stat label="Open" value={open.length} />
        <Stat label="Overdue" value={open.filter((i) => i.leftMs < 0).length} tone={open.some((i) => i.leftMs < 0) ? "bad" : undefined} />
        <Stat label="Critical priority" value={open.filter((i) => i.prio.tier === "critical").length} />
        <Stat label="Reopened (not fixed)" value={open.filter((i) => i.status === "reopened").length} />
      </div>

      <div className="filters">
        <Segmented label="Status" value={status} onChange={(v) => { setStatus(v); setShown(PAGE); }}
          options={[{ value: "open", label: "Open" }, { value: "overdue", label: "Overdue" }, { value: "reopened", label: "Reopened" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]} />
        <div className="field inline"><label htmlFor="ty">Type</label>
          <select id="ty" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            {TYPE_IDS.map((t) => <option key={t} value={t}>{TYPES[t].label}</option>)}
          </select>
        </div>
        <div className="field inline"><label htmlFor="so">Sort by</label>
          <select id="so" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="priority">Highest priority</option>
            <option value="due">Deadline soonest</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
        <div className="field inline grow"><label htmlFor="qq">Search</label>
          <input id="qq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, place or landmark" />
        </div>
      </div>

      <p className="muted small" aria-live="polite">{rows.length} {rows.length === 1 ? "incident" : "incidents"}</p>

      {rows.length === 0 ? (
        <Empty title="Nothing here">No incidents match these filters.</Empty>
      ) : (
        <ul className="queue">
          {rows.slice(0, shown).map((i) => (
            <li key={i.id}>
              <Link to={`/incident/${i.id}`} className="q-row">
                <div className="q-prio">{isOpen(i) ? <TierBadge prio={i.prio} /> : <StatusBadge status={i.status} />}</div>
                <div className="q-main">
                  <p className="q-title">{TYPES[i.type].label} <span className="muted">· {i.place.name}</span></p>
                  <p className="muted small">
                    <span className="mono">{i.id}</span> · {i.agency} {i.zone} · reported {fmtAgo(i.reportedAt, now)} · {i.witnesses.length} {i.witnesses.length === 1 ? "report" : "reports"}
                  </p>
                </div>
                <div className="q-badges">
                  {isOpen(i) && i.grap.level === "ban" && <Badge tone="warn">GRAP ban</Badge>}
                  {isOpen(i) && i.exposed.some((r) => r.kind === "school") && <Badge tone="bad">{i.exposed.filter((r) => r.kind === "school").length} school{i.exposed.filter((r) => r.kind === "school").length > 1 ? "s" : ""} downwind</Badge>}
                  {isOpen(i) && i.status !== "new" && <StatusBadge status={i.status} />}
                  <Sla inc={i} now={now} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown && <button type="button" className="btn btn-ghost" onClick={() => setShown(shown + PAGE)}>Show more</button>}
    </div>
  );
}
