import { useIncidents, useNow, useTitle } from "../lib/hooks.js";
import { AGENCIES } from "../data/places.js";
import { agencyStats, cityStats, hotspots } from "../lib/stats.js";
import { fmtDuration, fmtPct } from "../lib/time.js";
import { PageHead, Stat } from "../components/ui.jsx";
import AgencyTable from "../components/AgencyTable.jsx";

export default function Scoreboard() {
  useTitle("Scoreboard");
  const now = useNow();
  const list = useIncidents();
  const rows = agencyStats(list, now);
  const city = cityStats(list, now);
  const spots = hotspots(list, now, 30, 8);
  const worst = rows.filter((r) => r.total >= 5).sort((a, b) => b.claimedRate - b.verifiedRate - (a.claimedRate - a.verifiedRate))[0];
  const best = rows.filter((r) => r.total >= 5).sort((a, b) => b.verifiedRate - a.verifiedRate)[0];

  return (
    <div className="wrap-wide page">
      <PageHead eyebrow="Public · last 30 days · simulated data" title="Who actually fixes things" />
      {worst && (
        <p className="score-headline">
          {AGENCIES[worst.id].short} marked <b>{fmtPct(worst.claimedRate)}</b> of its complaints as handled. Photo checks confirm only <b>{fmtPct(worst.verifiedRate)}</b>.
          {best && best.id !== worst.id && <> {AGENCIES[best.id].short} leads with <b>{fmtPct(best.verifiedRate)}</b> verified.</>}
        </p>
      )}
      <div className="grid-4 stats">
        <Stat label="Complaints" value={city.total} />
        <Stat label="Verified fixed" value={fmtPct(city.verifiedRate)} />
        <Stat label="Median time to a verified fix" value={city.medianMs ? fmtDuration(city.medianMs) : "–"} />
        <Stat label="Fake closures caught" value={city.fakeClosuresCaught} hint="Officer said fixed, AI disagreed" />
      </div>

      <section className="block-sm" aria-labelledby="ag-h">
        <h2 id="ag-h" className="block-title">Agencies ranked by verified fixes</h2>
        <AgencyTable rows={rows} />
        <p className="muted small">"Said fixed" counts every complaint where an officer marked it handled. "Verified" counts only closures confirmed by an after-photo from the same place. The gap between the two is the problem this project exists to expose.</p>
      </section>

      <div className="two-col">
        <section aria-labelledby="hs-h">
          <h2 id="hs-h" className="block-title">Repeat-offender wards</h2>
          <ol className="hotspots">
            {spots.map((s) => (
              <li key={s.placeId}><span>{s.name}<span className="muted small"> · {s.agency} · {s.open} open</span></span><b>{s.count}</b></li>
            ))}
          </ol>
          <p className="muted small">Number of complaints in the last 30 days. Places that keep appearing deserve a structural fix, not another clean-up.</p>
        </section>
        <section aria-labelledby="m-h">
          <h2 id="m-h" className="block-title">How this is measured</h2>
          <ol className="method">
            <li>A complaint opens only if its photo is fresh, original and matches the location.</li>
            <li>It is routed to the agency that owns that exact spot, with a deadline set by the type of pollution and today's GRAP stage.</li>
            <li>Closing requires an after-photo from the same place. The AI compares before and after.</li>
            <li>If the problem is still there, the complaint reopens and the attempt counts as a failed closure.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
