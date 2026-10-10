import { AGENCIES } from "../data/places.js";
import { fmtDuration, fmtPct } from "../lib/time.js";

// Claimed vs verified resolution, side by side: the number an agency would report about itself
// next to the number the AI before/after check actually confirms.
export default function AgencyTable({ rows }) {
  const sorted = [...rows].sort((a, b) => b.verifiedRate - a.verifiedRate);
  return (
    <div className="table-wrap">
      <table className="table agency-table">
        <caption className="visually-hidden">Agency resolution rates over the last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Agency</th>
            <th scope="col">Complaints</th>
            <th scope="col" className="col-bars">Said fixed vs verified fixed</th>
            <th scope="col">Reopened</th>
            <th scope="col">Median fix time</th>
            <th scope="col">Overdue now</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => (
            <tr key={r.id}>
              <th scope="row"><span className="rank">{idx + 1}</span> {AGENCIES[r.id].short}<span className="muted small block-sm">{AGENCIES[r.id].name}</span></th>
              <td>{r.total}</td>
              <td className="col-bars">
                <div className="bar-pair">
                  <div className="bar-row"><span className="bar-label">Said fixed</span><span className="bar"><i className="bar-claimed" style={{ width: `${r.claimedRate * 100}%` }} /></span><b>{fmtPct(r.claimedRate)}</b></div>
                  <div className="bar-row"><span className="bar-label">Verified</span><span className="bar"><i className="bar-verified" style={{ width: `${r.verifiedRate * 100}%` }} /></span><b>{fmtPct(r.verifiedRate)}</b></div>
                </div>
              </td>
              <td>{r.total ? fmtPct(r.reopenRate) : "–"}</td>
              <td>{r.medianMs ? fmtDuration(r.medianMs) : "–"}</td>
              <td>{r.overdue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
