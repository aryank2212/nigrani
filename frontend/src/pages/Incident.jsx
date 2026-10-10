import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useT } from "../lib/i18n.js";
import { acknowledge, allUsers, logAction, reassign, useDb, useUser } from "../lib/store.js";
import { useIncident, useNow, useTitle } from "../lib/hooks.js";
import { RECEPTORS, PLACES, FIELD_AGENCIES, placeById, AGENCIES } from "../data/places.js";
import { TYPES, ESCALATION_LABEL, authorize, isOpen, schoolAdvice, GRAP } from "../lib/rules.js";
import { attemptClosure, CLOSURE_STEPS } from "../lib/pipeline.js";
import { compass } from "../lib/geo.js";
import { HOUR, fmtDateTime, fmtDuration } from "../lib/time.js";
import { Badge, Icon, Photo, ProgressList, Segmented, Sla, StatusBadge, TierBadge, Timeline, toast } from "../components/ui.jsx";
import MapView from "../components/MapView.jsx";

const TIER_COLOR = { critical: "#d6402f", high: "#d4700d", medium: "#b98700", low: "#2f9e63" };
const ACTION_IDEAS = {
  waste_burning: ["Fire extinguished with water tender", "Waste removed, fine issued to the owner"],
  construction_dust: ["Notice issued, site told to cover and sprinkle", "Anti-smog gun deployed on site"],
  debris: ["Debris covered with tarpaulin, removal scheduled", "Truck dispatched to lift the debris"],
  industrial_smoke: ["Inspection team sent, unit told to stop the furnace", "Closure notice served"],
  road_dust: ["Mechanical sweeper and water sprinkler sent", "Soil removed from the carriageway"],
};

const hasZoneAccess = (user, inc) => user.agency === inc.agency && (user.zone === "*" || user.zone === inc.zone);

function escalationEvents(inc, now) {
  const out = [];
  const end = inc.status === "closed" ? inc.closure?.at ?? now : now;
  const window = Math.max(2 * HOUR, inc.slaHours * HOUR * 0.5);
  if (inc.status !== "rejected" && end > inc.dueAt) out.push({ at: inc.dueAt, kind: "escalated", text: "Deadline missed. Escalated to the nodal officer.", by: null });
  if (inc.status !== "rejected" && end > inc.dueAt + window) out.push({ at: inc.dueAt + window, kind: "escalated", text: "Still unresolved. Escalated to the DPCC control room.", by: null });
  return out;
}

function ClosureDialog({ inc, user, onClose }) {
  const ref = useRef(null);
  const [choice, setChoice] = useState("clean");
  const [upload, setUpload] = useState(null);
  const [demo, setDemo] = useState("fixed");
  const [phase, setPhase] = useState("pick");
  const [steps, setSteps] = useState([]);
  const [res, setRes] = useState(null);

  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setUpload(r.result); setChoice("upload"); };
    r.readAsDataURL(f);
  };

  const submit = async () => {
    setPhase("run");
    setSteps(CLOSURE_STEPS.map(() => ({ state: "pending" })));
    const after = choice === "upload" ? { kind: "upload", url: upload, demoOutcome: demo } : { kind: "scene", state: choice };
    const out = await attemptClosure(inc, user, after, (i, state, detail) => setSteps((p) => {
      const n = [...p]; n[i] = { state, detail };
      if (state === "failed") for (let j = i + 1; j < n.length; j++) n[j] = { state: "skipped" };
      return n;
    }));
    setRes(out);
    setPhase("done");
  };

  const samples = [
    { key: "clean", label: "Site cleared", hint: "AI will confirm the fix" },
    { key: "still", label: "Still burning / dusty", hint: "AI will reopen the incident" },
    { key: "wrong", label: "Photo from elsewhere", hint: "Policy will deny the closure" },
  ];

  return (
    <dialog ref={ref} className="dlg" aria-labelledby="close-h" onClose={onClose} closedby="any">
      <form method="dialog" className="dlg-x"><button className="icon-btn" aria-label="Close"><Icon name="x" size={20} /></button></form>
      <div className="dlg-body">
        <h2 id="close-h">Close {inc.id}</h2>
        {phase === "pick" ? (
          <>
            <p className="muted">A closure needs an after-photo from the same place. The AI compares it with the original and only closes the complaint if the problem is really gone.</p>
            <div className="before-after">
              <figure><Photo photo={inc.photo} type={inc.type} /><figcaption>Before (citizen report)</figcaption></figure>
              <figure>
                {choice === "upload" && upload ? <img className="scene" src={upload} alt="Your after photo" /> : <Photo photo={{ kind: "scene", state: choice }} type={inc.type} />}
                <figcaption>After (your photo)</figcaption>
              </figure>
            </div>
            <fieldset className="sample-set">
              <legend>Demo: choose the after-photo</legend>
              <div className="chips">
                {samples.map((s) => (
                  <label key={s.key} className={`chip-opt${choice === s.key ? " on" : ""}`}>
                    <input type="radio" name="after" checked={choice === s.key} onChange={() => setChoice(s.key)} />
                    <span>{s.label}<span className="muted small"> · {s.hint}</span></span>
                  </label>
                ))}
              </div>
              <div className="row">
                <label className="btn btn-ghost btn-sm file-btn">Upload your own<input type="file" accept="image/*" className="visually-hidden" onChange={pickFile} /></label>
                {choice === "upload" && (
                  <Segmented label="What should the AI conclude (demo)" value={demo} onChange={setDemo} options={[{ value: "fixed", label: "Fixed" }, { value: "still", label: "Still there" }]} />
                )}
              </div>
            </fieldset>
            <div className="step-actions">
              <span />
              <button type="button" className="btn btn-primary" onClick={submit} disabled={choice === "upload" && !upload}>Submit closure</button>
            </div>
          </>
        ) : (
          <>
            <ProgressList labels={CLOSURE_STEPS} steps={steps} />
            {phase === "done" && (
              <div className={`result ${res.outcome === "verified" ? "result-good" : "result-bad"}`} role="status">
                {res.outcome === "verified" && (<><h3>Verified fixed. Complaint closed.</h3><p>The after-photo matches the location and the problem is gone. This counts towards your agency's verified resolution rate.</p></>)}
                {res.outcome === "not_fixed" && (<><h3>Closure rejected. Complaint reopened.</h3><p>The AI still sees the problem at this location. The incident is back in the queue with a new deadline, and the attempt is recorded on the public scoreboard.</p></>)}
                {res.outcome === "denied" && (<><h3>Closure denied by policy.</h3><p>{res.auth.reason}</p></>)}
                <div className="row"><button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>Done</button></div>
              </div>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

function ActionPanel({ inc, user }) {
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [agency, setAgency] = useState(inc.agency);
  const [zone, setZone] = useState(inc.zone);
  const [why, setWhy] = useState("");
  const open = isOpen(inc);

  if (!user || user.role === "citizen") return null;
  // Once a closure succeeds the incident is no longer open, but the dialog must stay to show the verdict.
  if (!open) return closing ? <ClosureDialog inc={inc} user={user} onClose={() => setClosing(false)} /> : null;

  const staff = (user.role === "officer" || user.role === "nodal") && user.agency === inc.agency;
  const reassignAuth = authorize({ user, action: "Reassign", incident: inc });

  return (
    <div className="panel action-panel">
      <h2 className="panel-title">Your actions</h2>
      {user.role === "officer" && staff && (
        <>
          {!hasZoneAccess(user, inc) && (
            <p className="notice-box warn">This incident is in <b>{inc.zone}</b> zone, outside your jurisdiction. You can view it, but the policy engine will refuse a closure from you.</p>
          )}
          {inc.status === "new" && (
            <button type="button" className="btn btn-primary btn-block" onClick={() => { acknowledge(inc.id, user); toast("Accepted. The clock keeps running."); }}>Accept this complaint</button>
          )}
          {inc.status !== "new" && (
            <>
              <div className="field">
                <label htmlFor="act">Log what you did</label>
                <select id="act" value="" onChange={(e) => setNote(e.target.value)}>
                  <option value="">Suggested actions…</option>
                  {ACTION_IDEAS[inc.type].map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <input aria-label="Action taken" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe the action taken" />
              </div>
              <button type="button" className="btn btn-ghost btn-block" disabled={!note.trim()} onClick={() => { logAction(inc.id, user, note.trim().replace(/\.?$/, ".")); setNote(""); toast("Action logged."); }}>Log action</button>
              <button type="button" className="btn btn-primary btn-block" onClick={() => setClosing(true)}>Close with after-photo</button>
              <p className="hint">Cannot be closed without a verified after-photo from the same location.</p>
            </>
          )}
        </>
      )}
      {(user.role === "nodal" || user.role === "admin") && (
        <>
          {reassignAuth.decision === "Allow" ? (
            <>
              <p className="muted small">Wrong agency or zone? Reassign it and the clock restarts.</p>
              <div className="field">
                <label htmlFor="ag">Agency</label>
                <select id="ag" value={agency} onChange={(e) => { setAgency(e.target.value); setZone(PLACES.find((p) => p.agency === e.target.value)?.zone ?? "*"); }}>
                  {FIELD_AGENCIES.map((a) => <option key={a} value={a}>{AGENCIES[a].short}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="zn">Zone</label>
                <select id="zn" value={zone} onChange={(e) => setZone(e.target.value)}>
                  {[...new Set(PLACES.filter((p) => p.agency === agency).map((p) => p.zone))].map((z) => <option key={z}>{z}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="why">Note (optional)</label><input id="why" value={why} onChange={(e) => setWhy(e.target.value)} /></div>
              <button type="button" className="btn btn-primary btn-block" disabled={agency === inc.agency && zone === inc.zone}
                onClick={() => { reassign(inc.id, user, agency, zone, why); toast(`Reassigned to ${agency}.`); }}>Reassign</button>
            </>
          ) : <p className="muted">{reassignAuth.reason}</p>}
        </>
      )}
      {closing && <ClosureDialog inc={inc} user={user} onClose={() => setClosing(false)} />}
    </div>
  );
}

export default function Incident() {
  const { id } = useParams();
  const { t } = useT();
  const inc = useIncident(id);
  const db = useDb();
  const user = useUser();
  const now = useNow();
  useTitle(inc ? inc.id : "Incident");

  const view = useMemo(() => {
    if (!inc) return {};
    const owner = !!user && inc.witnesses.some((w) => w.userId === user.id);
    const staff = !!user && (user.role === "admin" || ((user.role === "officer" || user.role === "nodal") && user.agency === inc.agency));
    return { owner, staff };
  }, [inc, user]);

  const mapData = useMemo(() => {
    if (!inc) return {};
    const color = TIER_COLOR[inc.prio.tier];
    const exposedIds = new Set(inc.exposed.map((r) => r.id));
    const near = RECEPTORS.filter((r) => exposedIds.has(r.id) || Math.hypot((r.lat - inc.lat) * 110574, (r.lon - inc.lon) * 97000) < 3500);
    return {
      polygons: [{ points: inc.plume.polygon, color, opacity: 0.22 }],
      markers: [
        ...near.map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, shape: r.kind === "hospital" ? "diamond" : "square", size: 14, color: exposedIds.has(r.id) ? "#d6402f" : "#6b7280", ring: exposedIds.has(r.id), title: `${r.name} (${r.kind})` })),
        { id: inc.id, lat: inc.lat, lon: inc.lon, color, size: 20, shape: "circle", title: `${t(`type.${inc.type}`)}` },
      ],
      fit: [[inc.lat, inc.lon], ...inc.plume.polygon.filter((_, i) => i % 6 === 0)],
    };
  }, [inc, t]);

  if (!inc) return <div className="wrap page"><h1>Incident not found</h1><p className="muted">There is no incident with the number {id}. <Link to="/map">Browse the live map</Link>.</p></div>;

  const { owner, staff } = view;
  const events = [...inc.events, ...escalationEvents(inc, now)].sort((a, b) => a.at - b.at);
  const users = allUsers();
  const visibleEvents = events.map((e) => ((owner || staff) ? e : users.find((u) => u.id === e.by)?.role === "citizen" ? { ...e, by: null } : e));
  const wind = db.settings.wind;
  const g = inc.grap;
  const closureAttempt = [...inc.attempts].reverse().find((a) => a.photo);

  return (
    <div className="wrap-wide page incident">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/map">Live map</Link> <span aria-hidden="true">/</span> <span className="mono">{inc.id}</span></nav>
      <header className="inc-head">
        <div>
          <p className="eyebrow">{inc.agency} · {inc.zone}{inc.agency === "MCD" ? " zone" : ""} · {inc.place.name}</p>
          <h1>{t(`type.${inc.type}`)}</h1>
          <p className="muted">{inc.landmark}. Reported {fmtDateTime(inc.reportedAt)} by {inc.witnesses.length} {inc.witnesses.length === 1 ? "person" : "people"}.</p>
        </div>
        <div className="inc-badges">
          <StatusBadge status={inc.status} />
          {isOpen(inc) && <TierBadge prio={inc.prio} />}
          <Sla inc={inc} now={now} />
          {inc.reopenCount > 0 && <Badge tone="bad">Reopened {inc.reopenCount}×</Badge>}
        </div>
      </header>

      {owner && <p className="notice-box">You reported this. We will keep this page updated until the fix is verified.</p>}
      {inc.status === "rejected" && <p className="notice-box warn"><b>Rejected at intake.</b> {inc.rejectReason}</p>}

      <div className="inc-grid">
        <div className="inc-main">
          <section className="panel">
            <h2 className="panel-title">Evidence</h2>
            <div className="before-after">
              <figure><Photo photo={inc.photo} type={inc.type} /><figcaption>Citizen photo</figcaption></figure>
              {closureAttempt && <figure><Photo photo={closureAttempt.photo} type={inc.type} /><figcaption>After photo ({closureAttempt.verdict === "verified" ? "verified" : "rejected"})</figcaption></figure>}
            </div>
            {inc.desc && <p className="quote">“{inc.desc}”</p>}
            <ul className="checks-list">
              <li className={inc.ai.checks.fresh ? "ok" : "no"}><Icon name={inc.ai.checks.fresh ? "check" : "x"} size={16} /> Photo is fresh (taken just before the report)</li>
              <li className={inc.ai.checks.geotag ? "ok" : "no"}><Icon name={inc.ai.checks.geotag ? "check" : "x"} size={16} /> Photo location matches the report</li>
              <li className={inc.ai.checks.original ? "ok" : "no"}><Icon name={inc.ai.checks.original ? "check" : "x"} size={16} /> Image is original, not copied from elsewhere</li>
              {inc.status !== "rejected" && <li className="ok"><Icon name="check" size={16} /> AI identified {inc.ai.label.toLowerCase()} ({Math.round(inc.ai.confidence * 100)}% confident)</li>}
            </ul>
            <p className={`grap-line grap-${g.level}`}><b>GRAP {GRAP[db.settings.stage].name.split(" ·")[0]}:</b> {g.text}</p>
          </section>

          {inc.status !== "rejected" && (
            <section className="panel">
              <h2 className="panel-title">Who is downwind</h2>
              <p className="muted small">
                <Icon name="wind" size={14} /> Wind from {compass(wind.fromDeg)} at {wind.speedKmh} km/h (simulated). The shaded area is a simplified Gaussian-plume screening estimate of where the smoke travels, not a full dispersion study.
              </p>
              <MapView height={360} polygons={mapData.polygons} markers={mapData.markers} fit={mapData.fit} label={`Map of the smoke path for ${inc.id}`} />
              <ul className="legend-row small muted">
                <li><span className="mk-key mk-circle" style={{ "--c": TIER_COLOR[inc.prio.tier] }} /> Source</li>
                <li><span className="mk-key mk-square" style={{ "--c": "#d6402f" }} /> School in the smoke path</li>
                <li><span className="mk-key mk-diamond" style={{ "--c": "#d6402f" }} /> Hospital in the smoke path</li>
                <li><span className="mk-key mk-square" style={{ "--c": "#6b7280" }} /> Nearby, not affected</li>
              </ul>
              {inc.exposed.length === 0 ? (
                <p>No schools or hospitals are currently in the smoke path.</p>
              ) : (
                <table className="table">
                  <caption className="visually-hidden">Schools and hospitals in the smoke path</caption>
                  <thead><tr><th scope="col">Place</th><th scope="col">Distance</th><th scope="col">Recess advisory (SafeRecess)</th></tr></thead>
                  <tbody>
                    {inc.exposed.map((r) => {
                      const adv = r.kind === "school" ? schoolAdvice(placeById(r.placeId).aqi, r.age) : null;
                      return (
                        <tr key={r.id}>
                          <th scope="row">{r.name}<span className="muted small"> · {r.kind}{r.age ? `, ${r.age}` : ""}</span></th>
                          <td>{r.distM >= 1000 ? `${(r.distM / 1000).toFixed(1)} km` : `${Math.round(r.distM)} m`}</td>
                          <td>{adv ? <span className={`lvl lvl-${adv.level}`}>{adv.say}</span> : "Keep windows closed, ventilation off"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )}

          <section className="panel">
            <h2 className="panel-title">Timeline</h2>
            <Timeline events={visibleEvents} />
          </section>
        </div>

        <aside className="inc-side">
          <ActionPanel inc={inc} user={user} />
          {inc.status !== "rejected" && (
            <section className="panel">
              <h2 className="panel-title">Why this priority</h2>
              <p className="muted small">Score out of 100. Higher goes first in the officer's queue.</p>
              <ul className="parts">
                {inc.prio.parts.map((p) => (
                  <li key={p.label}><span>{p.label}</span><b>+{p.pts}</b></li>
                ))}
                <li className="total"><span>Total</span><b>{inc.prio.score}</b></li>
              </ul>
            </section>
          )}
          {inc.status !== "rejected" && (
            <section className="panel">
              <h2 className="panel-title">Deadline</h2>
              <dl className="kv">
                <div><dt>Time allowed</dt><dd>{fmtDuration(inc.slaHours * HOUR)}{g.level === "ban" ? " (halved: GRAP ban)" : ""}</dd></div>
                <div><dt>Due</dt><dd>{fmtDateTime(inc.dueAt)}</dd></div>
                <div><dt>Currently with</dt><dd>{isOpen(inc) ? ESCALATION_LABEL[inc.esc] : "Closed"}</dd></div>
              </dl>
              <p className="hint">Missed deadline: nodal officer. Still open after that: DPCC control room.</p>
            </section>
          )}
          <section className="panel">
            <h2 className="panel-title">Share</h2>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast("Link copied."); }}>Copy public link</button>
            <p className="hint">Public pages never show reporters' names.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
