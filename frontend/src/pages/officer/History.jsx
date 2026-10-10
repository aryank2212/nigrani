import { Link } from "react-router-dom";
import { useUser } from "../../lib/store.js";
import { useIncidents, useTitle } from "../../lib/hooks.js";
import { TYPES } from "../../lib/rules.js";
import { HOUR, fmtDateTime, fmtDuration, fmtPct } from "../../lib/time.js";
import { Badge, Empty, PageHead, Stat } from "../../components/ui.jsx";

export default function History() {
  useTitle("Closed");
  const user = useUser();
  const mine = useIncidents()
    .filter((i) => i.agency === user.agency && (user.zone === "*" || i.zone === user.zone) && i.attempts.length > 0)
    .sort((a, b) => b.attempts.at(-1).at - a.attempts.at(-1).at);

  const attempts = mine.flatMap((i) => i.attempts);
  const verified = attempts.filter((a) => a.verdict === "verified").length;
  const onTime = mine.filter((i) => i.status === "closed" && i.closure.at <= i.reportedAt + i.slaHours * HOUR).length;

  return (
    <div className="wrap-wide page">
      <PageHead eyebrow={`${user.name} · ${user.zone === "*" ? user.agency : `${user.agency}, ${user.zone}`}`} title="Closure history" />
      <div className="grid-4 stats">
        <Stat label="Closure attempts" value={attempts.length} />
        <Stat label="Verified by AI" value={verified} hint={attempts.length ? fmtPct(verified / attempts.length) : undefined} />
        <Stat label="Rejected: still not fixed" value={attempts.length - verified} />
        <Stat label="Closed within deadline" value={onTime} />
      </div>
      <p className="muted">Every closure needs an after-photo that the AI checks. Attempts that fail are reopened and count against the agency on the public scoreboard, so a closure only helps when the problem is truly gone.</p>
      {mine.length === 0 ? (
        <Empty title="No closures yet">Closed and reopened incidents will appear here.</Empty>
      ) : (
        <table className="table">
          <caption className="visually-hidden">Closure attempts</caption>
          <thead><tr><th scope="col">Incident</th><th scope="col">Type</th><th scope="col">Last attempt</th><th scope="col">Result</th><th scope="col">Time to fix</th></tr></thead>
          <tbody>
            {mine.map((i) => {
              const last = i.attempts.at(-1);
              return (
                <tr key={i.id}>
                  <th scope="row"><Link to={`/incident/${i.id}`} className="mono">{i.id}</Link><span className="muted small"> {i.place.name}</span></th>
                  <td>{TYPES[i.type].label}</td>
                  <td>{fmtDateTime(last.at)}</td>
                  <td>{last.verdict === "verified" ? <Badge tone="good">Verified fixed</Badge> : <Badge tone="bad">Reopened</Badge>}{i.attempts.length > 1 && <span className="muted small"> · {i.attempts.length} attempts</span>}</td>
                  <td>{i.status === "closed" ? fmtDuration(i.closure.at - i.reportedAt) : "Still open"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
