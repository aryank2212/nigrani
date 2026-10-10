import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../lib/i18n.js";
import { useIncidents, useNow, useTitle } from "../lib/hooks.js";
import { TYPES, TYPE_IDS, isOpen } from "../lib/rules.js";
import { FIELD_AGENCIES, RECEPTORS } from "../data/places.js";
import { fmtAgo } from "../lib/time.js";
import { Badge, PageHead, Segmented, Sla, StatusBadge, TierBadge } from "../components/ui.jsx";
import MapView from "../components/MapView.jsx";

const TIER_COLOR = { critical: "#d6402f", high: "#d4700d", medium: "#b98700", low: "#2f9e63" };
const TIER_SIZE = { critical: 20, high: 17, medium: 14, low: 12 };

export default function PublicMap() {
  useTitle("Live map");
  const { t } = useT();
  const now = useNow();
  const all = useIncidents().filter((i) => i.status !== "rejected");
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("all");
  const [agency, setAgency] = useState("all");
  const [plumes, setPlumes] = useState(true);
  const [schools, setSchools] = useState(true);
  const [sel, setSel] = useState(null);

  const rows = useMemo(
    () => all
      .filter((i) => (status === "all" ? true : status === "open" ? isOpen(i) : i.status === "closed"))
      .filter((i) => type === "all" || i.type === type)
      .filter((i) => agency === "all" || i.agency === agency)
      .sort((a, b) => b.prio.score - a.prio.score),
    [all, status, type, agency],
  );

  const polygons = useMemo(
    () => (plumes ? rows.filter((i) => isOpen(i) && (i.prio.tier === "critical" || i.prio.tier === "high")).slice(0, 14).map((i) => ({ points: i.plume.polygon, color: TIER_COLOR[i.prio.tier], opacity: 0.16 })) : []),
    [rows, plumes],
  );
  const markers = useMemo(() => {
    const m = rows.map((i) => ({
      id: i.id, lat: i.lat, lon: i.lon, color: i.status === "closed" ? "#6b7280" : TIER_COLOR[i.prio.tier], size: TIER_SIZE[i.prio.tier],
      title: `${t(`type.${i.type}`)}, ${i.place.name}`, ring: sel === i.id, onClick: () => setSel(i.id),
    }));
    if (!schools) return m;
    return [
      ...RECEPTORS.map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, shape: r.kind === "hospital" ? "diamond" : "square", size: 11, color: "#4b5563", title: `${r.name} (${r.kind})` })),
      ...m,
    ];
  }, [rows, schools, sel, t]);

  const selected = rows.find((i) => i.id === sel);

  return (
    <div className="wrap-wide page">
      <PageHead eyebrow="Public" title="Live incident map" />
      <div className="filters">
        <Segmented label="Show" value={status} onChange={setStatus} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Fixed" }, { value: "all", label: "All" }]} />
        <div className="field inline"><label htmlFor="mt">Type</label>
          <select id="mt" value={type} onChange={(e) => setType(e.target.value)}><option value="all">All types</option>{TYPE_IDS.map((x) => <option key={x} value={x}>{TYPES[x].label}</option>)}</select>
        </div>
        <div className="field inline"><label htmlFor="ma">Agency</label>
          <select id="ma" value={agency} onChange={(e) => setAgency(e.target.value)}><option value="all">All agencies</option>{FIELD_AGENCIES.map((a) => <option key={a}>{a}</option>)}</select>
        </div>
        <label className="check"><input type="checkbox" checked={plumes} onChange={(e) => setPlumes(e.target.checked)} /><span>Smoke paths</span></label>
        <label className="check"><input type="checkbox" checked={schools} onChange={(e) => setSchools(e.target.checked)} /><span>Schools and hospitals</span></label>
      </div>

      <div className="map-layout">
        <div>
          <MapView height={560} markers={markers} polygons={polygons} label="Map of pollution incidents across Delhi-NCR" />
          <ul className="legend-row small muted">
            <li><span className="mk-key mk-circle" style={{ "--c": "#d6402f" }} /> Critical</li>
            <li><span className="mk-key mk-circle" style={{ "--c": "#d4700d" }} /> High</li>
            <li><span className="mk-key mk-circle" style={{ "--c": "#b98700" }} /> Medium</li>
            <li><span className="mk-key mk-circle" style={{ "--c": "#2f9e63" }} /> Low</li>
            <li><span className="mk-key mk-square" style={{ "--c": "#4b5563" }} /> School</li>
            <li><span className="mk-key mk-diamond" style={{ "--c": "#4b5563" }} /> Hospital</li>
          </ul>
        </div>
        <aside aria-label="Incident list">
          {selected && (
            <div className="panel sel-card">
              <TierBadge prio={selected.prio} />
              <p className="card-title">{t(`type.${selected.type}`)} · {selected.place.name}</p>
              <p className="muted small">{selected.agency} {selected.zone} · reported {fmtAgo(selected.reportedAt, now)}</p>
              <p className="row-badges"><StatusBadge status={selected.status} /><Sla inc={selected} now={now} /></p>
              <Link className="btn btn-primary btn-sm" to={`/incident/${selected.id}`}>Open incident</Link>
            </div>
          )}
          <p className="muted small" aria-live="polite">{rows.length} incidents shown</p>
          <ul className="queue compact">
            {rows.slice(0, 14).map((i) => (
              <li key={i.id}>
                <button type="button" className={`q-row${sel === i.id ? " on" : ""}`} onClick={() => setSel(i.id)}>
                  <div className="q-prio">{isOpen(i) ? <TierBadge prio={i.prio} /> : <Badge tone="good">Fixed</Badge>}</div>
                  <div className="q-main"><p className="q-title">{TYPES[i.type].label}</p><p className="muted small">{i.place.name} · {i.agency}</p></div>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
