import { useState } from "react";
import { allUsers } from "../../lib/store.js";
import { useIncidents, useTitle } from "../../lib/hooks.js";
import { ACTIONS, POLICIES, authorize, isOpen } from "../../lib/rules.js";
import { ROLE_LABEL } from "../../data/users.js";
import { Badge, Icon, PageHead } from "../../components/ui.jsx";

export default function Policies() {
  useTitle("Policies");
  const users = allUsers();
  const incidents = useIncidents().filter(isOpen).sort((a, b) => b.prio.score - a.prio.score).slice(0, 40);
  const [uid, setUid] = useState("u-off-mcd");
  const [action, setAction] = useState("CloseIncident");
  const [iid, setIid] = useState(incidents[0]?.id);
  const [afterPhoto, setAfter] = useState(true);
  const [matches, setMatches] = useState(true);

  const user = users.find((u) => u.id === uid);
  const incident = incidents.find((i) => i.id === iid) ?? incidents[0];
  const res = incident && user ? authorize({ user, action, incident, ctx: { afterPhoto, matchesLocation: matches } }) : null;

  return (
    <div className="wrap-wide page">
      <PageHead eyebrow="Authorization" title="Access policies" />
      <p className="muted lead-p">The rules of the process are code, not convention. Each policy below is written in Cedar, AWS's open-source authorization language, so "an officer can only close complaints in their own jurisdiction" is enforced every time and can be audited. Try a request in the playground. (In this demo a small in-browser evaluator mirrors the policies.)</p>

      <section className="panel" aria-labelledby="pg-h">
        <h2 id="pg-h" className="panel-title">Policy playground</h2>
        <div className="pg-form">
          <div className="field"><label htmlFor="pu">Who</label>
            <select id="pu" value={uid} onChange={(e) => setUid(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}{u.agency && u.role !== "citizen" ? ` · ${u.agency}` : ""}{u.zone && u.zone !== "*" ? ` · ${u.zone}` : ""}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="pa">Wants to</label>
            <select id="pa" value={action} onChange={(e) => setAction(e.target.value)}>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="pi">On incident</label>
            <select id="pi" value={incident?.id} onChange={(e) => setIid(e.target.value)}>
              {incidents.map((i) => <option key={i.id} value={i.id}>{i.id} · {i.place.name} · {i.agency} {i.zone} · {i.status}</option>)}
            </select>
          </div>
          {action === "CloseIncident" && (
            <div className="pg-checks">
              <label className="check"><input type="checkbox" checked={afterPhoto} onChange={(e) => setAfter(e.target.checked)} /><span>After-photo attached</span></label>
              <label className="check"><input type="checkbox" checked={matches} onChange={(e) => setMatches(e.target.checked)} /><span>Photo location matches the report</span></label>
            </div>
          )}
        </div>

        {res && (
          <div className={`result ${res.decision === "Allow" ? "result-good" : "result-bad"}`} role="status">
            <h3>{res.decision === "Allow" ? "Allow" : "Deny"}</h3>
            <p>{res.reason}</p>
            <table className="table">
              <caption className="visually-hidden">Policies evaluated</caption>
              <thead><tr><th scope="col">Policy</th><th scope="col">Effect</th><th scope="col">Applies</th><th scope="col">Why</th></tr></thead>
              <tbody>
                {res.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.id}<span className="muted small block-sm">{r.title}</span></th>
                    <td><Badge tone={r.effect === "forbid" ? "bad" : "info"}>{r.effect}</Badge></td>
                    <td>{r.ok ? <Icon name="check" size={16} /> : <span className="muted">no</span>}<span className="visually-hidden">{r.ok ? "yes" : "no"}</span></td>
                    <td>{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">Cedar's rule: any matching <b>forbid</b> wins; otherwise a matching <b>permit</b> is needed; otherwise the request is denied.</p>
          </div>
        )}
      </section>

      <section className="block-sm" aria-labelledby="pl-h">
        <h2 id="pl-h" className="block-title">The policies</h2>
        <div className="policy-list">
          {POLICIES.map((p) => (
            <article key={p.id} className="panel policy">
              <header><span className="mono">{p.id}</span><Badge tone={p.effect === "forbid" ? "bad" : "info"}>{p.effect}</Badge><h3>{p.title}</h3></header>
              <pre tabIndex={0}><code>{p.cedar}</code></pre>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
