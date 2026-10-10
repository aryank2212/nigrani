import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { advanceClock, resetDemo, setStage, setWind, useDb, useUser } from "../../lib/store.js";
import { useIncidents, useNow, useTitle } from "../../lib/hooks.js";
import { GRAP, TYPES, authorize, isOpen } from "../../lib/rules.js";
import { agencyStats, cityStats, hotspots } from "../../lib/stats.js";
import { compass } from "../../lib/geo.js";
import { HOUR, fmtDateTime, fmtDuration } from "../../lib/time.js";
import { Badge, Empty, PageHead, Segmented, Stat, TierBadge, toast } from "../../components/ui.jsx";
import AgencyTable from "../../components/AgencyTable.jsx";
import MapView from "../../components/MapView.jsx";

const TIER_COLOR = { critical: "#d6402f", high: "#d4700d", medium: "#b98700", low: "#2f9e63" };
const TIER_SIZE = { critical: 20, high: 17, medium: 14, low: 12 };

function SimControls() {
  const db = useDb();
  const user = useUser();
  const now = useNow();
  const { stage, wind, clockOffset } = db.settings;
  const auth = authorize({ user, action: "SetGrapStage" });
  return (
    <section className="panel" aria-labelledby="sim-h">
      <h2 id="sim-h" className="panel-title">Simulation controls</h2>
      <p className="muted small">Demo-only levers. Change the rules or the weather and watch every priority, deadline and smoke path recompute. {auth.reason}</p>

      <div className="field">
        <span className="label" id="stage-l">GRAP stage in force</span>
        <Segmented label="GRAP stage" value={String(stage)} onChange={(v) => { setStage(Number(v)); toast(`${GRAP[v].name} is now in force.`); }}
          options={[0, 1, 2, 3, 4].map((s) => ({ value: String(s), label: s === 0 ? "None" : ["", "I", "II", "III", "IV"][s] }))} />
        <p className="hint">{GRAP[stage].name} · {GRAP[stage].band}</p>
      </div>

      <div className="field">
        <label htmlFor="wd">Wind from {compass(wind.fromDeg)} ({wind.fromDeg}°)</label>
        <input id="wd" type="range" min="0" max="355" step="5" value={wind.fromDeg} onChange={(e) => setWind({ fromDeg: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label htmlFor="ws">Wind speed {wind.speedKmh} km/h</label>
        <input id="ws" type="range" min="3" max="30" step="1" value={wind.speedKmh} onChange={(e) => setWind({ speedKmh: Number(e.target.value) })} />
      </div>

      <div className="field">
        <span className="label">Simulated time: {fmtDateTime(now)}{clockOffset ? ` (+${fmtDuration(clockOffset)})` : ""}</span>
        <div className="row">
          {[1, 6, 24].map((h) => <button key={h} type="button" className="btn btn-ghost btn-sm" onClick={() => { advanceClock(h * HOUR); toast(`Moved the clock ${h} hour${h > 1 ? "s" : ""} ahead. Overdue complaints escalate.`); }}>+{h}h</button>)}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { resetDemo(); toast("Demo data reset."); }}>Reset everything</button>
        </div>
      </div>
    </section>
  );
}

export default function Command() {
  useTitle("Control room");
  const nav = useNavigate();
  const now = useNow();
  const list = useIncidents();
  const stats = cityStats(list, now);
  const agencies = agencyStats(list, now);
  const spots = hotspots(list, now);
  const dpcc = list.filter((i) => isOpen(i) && i.esc === 2).sort((a, b) => b.prio.score - a.prio.score);

  const markers = useMemo(
    () => list.filter(isOpen).map((i) => ({
      id: i.id, lat: i.lat, lon: i.lon, color: TIER_COLOR[i.prio.tier], size: TIER_SIZE[i.prio.tier], ring: i.esc === 2,
      title: `${TYPES[i.type].label}, ${i.place.name} (${i.prio.tier})`, onClick: () => nav(`/incident/${i.id}`),
    })),
    [list, nav],
  );

  return (
    <div className="wrap-wide page">
      <PageHead eyebrow="DPCC / CAQM" title="Control room" />
      <div className="grid-6 stats">
        <Stat label="Open" value={stats.open} />
        <Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? "bad" : undefined} />
        <Stat label="Critical" value={stats.critical} />
        <Stat label="With DPCC" value={stats.escalatedDpcc} tone={stats.escalatedDpcc ? "bad" : undefined} hint="Past both deadlines" />
        <Stat label="Schools downwind" value={stats.schoolsDownwind} />
        <Stat label="Fake closures caught" value={stats.fakeClosuresCaught} hint="Last 30 days" />
      </div>

      <div className="two-col wide-left">
        <div>
          <section className="panel" aria-labelledby="map-h">
            <h2 id="map-h" className="panel-title">Open incidents</h2>
            <MapView height={400} markers={markers} label="Map of open incidents across Delhi-NCR" />
            <p className="muted small">Bigger and redder means higher priority. A ring marks incidents that have escalated to the control room.</p>
          </section>
          <section className="panel" aria-labelledby="dp-h">
            <h2 id="dp-h" className="panel-title">Escalated to the control room</h2>
            {dpcc.length === 0 ? <Empty title="Nothing escalated">No complaint has missed both deadlines. Move the clock forward to see escalations.</Empty> : (
              <ul className="queue">
                {dpcc.slice(0, 6).map((i) => (
                  <li key={i.id}>
                    <Link to={`/incident/${i.id}`} className="q-row">
                      <div className="q-prio"><TierBadge prio={i.prio} /></div>
                      <div className="q-main">
                        <p className="q-title">{TYPES[i.type].label} <span className="muted">· {i.place.name}</span></p>
                        <p className="muted small"><span className="mono">{i.id}</span> · {i.agency} {i.zone} · overdue {fmtDuration(i.leftMs)}</p>
                      </div>
                      <div className="q-badges">{i.exposed.some((r) => r.kind === "school") && <Badge tone="bad">School downwind</Badge>}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div><SimControls />
          <section className="panel" aria-labelledby="hs-h">
            <h2 id="hs-h" className="panel-title">Repeat-offender wards (30 days)</h2>
            <ol className="hotspots">
              {spots.map((s) => (
                <li key={s.placeId}><span>{s.name}<span className="muted small"> · {s.agency}</span></span><b>{s.count}</b></li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <section className="block-sm" aria-labelledby="aud-h">
        <h2 id="aud-h" className="block-title">Agency audit</h2>
        <AgencyTable rows={agencies} />
      </section>
    </div>
  );
}
