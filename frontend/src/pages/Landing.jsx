import { Link } from "react-router-dom";
import { useT } from "../lib/i18n.js";
import { useDb } from "../lib/store.js";
import { useIncidents, useNow, useTitle } from "../lib/hooks.js";
import { GRAP, isOpen } from "../lib/rules.js";
import { cityStats } from "../lib/stats.js";
import { fmtDuration } from "../lib/time.js";
import { Icon, LinkButton, TierBadge } from "../components/ui.jsx";

const PROBLEM = [
  { n: "8,324 of 11,871", d: "air pollution complaints on MCD's 311 app were still pending in October 2024.", src: "Outlook Business" },
  { n: "923 of 33,379", d: "complaints on CPCB's Sameer app were resolved when it reported to the Supreme Court.", src: "Down To Earth" },
  { n: "99 of 183", d: "complaints closed by one department were reopened by citizens: closed, but not fixed.", src: "Deccan Herald" },
];

export default function Landing() {
  useTitle("");
  const { t } = useT();
  const db = useDb();
  const now = useNow();
  const list = useIncidents();
  const stats = cityStats(list, now);
  const stage = db.settings.stage;
  const atRisk = list
    .filter((i) => isOpen(i) && i.exposed.some((r) => r.kind === "school"))
    .sort((a, b) => b.prio.score - a.prio.score)
    .slice(0, 3);

  return (
    <>
      <section className="wrap-wide hero">
        <Link to="/grap" className="chip chip-link">
          <span className="chip-dot" aria-hidden="true" /> GRAP {GRAP[stage].name} is in force today
        </Link>
        <h1 className="hero-title">{t("hero.title")}</h1>
        <p className="lede">{t("hero.sub")}</p>
        <div className="hero-cta">
          <LinkButton to="/report">{t("hero.cta")} <Icon name="arrow" size={18} /></LinkButton>
          <LinkButton to="/scoreboard" variant="ghost">{t("hero.cta2")}</LinkButton>
        </div>
      </section>

      <section className="wrap-wide block" aria-labelledby="why-h">
        <h2 id="why-h" className="block-title">Why complaints go nowhere</h2>
        <div className="grid-3">
          {PROBLEM.map((p) => (
            <figure key={p.n} className="fact">
              <p className="fact-n">{p.n}</p>
              <figcaption>{p.d}<span className="muted small"> Source: {p.src}.</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="wrap-wide block" aria-labelledby="live-h">
        <div className="block-head">
          <h2 id="live-h" className="block-title">Live from this city (simulated)</h2>
          <Link to="/scoreboard" className="more">Full scoreboard <Icon name="arrow" size={16} /></Link>
        </div>
        <div className="grid-4">
          <div className="big-stat"><p className="bs-n">{stats.open}</p><p className="bs-l">complaints open right now</p></div>
          <div className="big-stat"><p className="bs-n">{stats.schoolsDownwind}</p><p className="bs-l">schools currently downwind of an open fire or dust source</p></div>
          <div className="big-stat"><p className="bs-n">{stats.fakeClosuresCaught}</p><p className="bs-l">fake closures caught by before/after checks this month</p></div>
          <div className="big-stat"><p className="bs-n">{stats.medianMs ? fmtDuration(stats.medianMs) : "–"}</p><p className="bs-l">median time to a verified fix</p></div>
        </div>
      </section>

      {atRisk.length > 0 && (
        <section className="wrap-wide block" aria-labelledby="risk-h">
          <h2 id="risk-h" className="block-title">Smoke heading towards schools right now</h2>
          <ul className="cards-3">
            {atRisk.map((i) => {
              const school = i.exposed.find((r) => r.kind === "school");
              return (
                <li key={i.id}>
                  <Link to={`/incident/${i.id}`} className="card card-link">
                    <TierBadge prio={i.prio} />
                    <p className="card-title">{t(`type.${i.type}`)} near {i.place.name}</p>
                    <p className="muted">Wind is carrying the smoke towards <b>{school.name}</b>, about {Math.round(school.distM)} m away.</p>
                    <span className="more">See the smoke path <Icon name="arrow" size={16} /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="wrap-wide block" aria-labelledby="how-h">
        <h2 id="how-h" className="block-title">{t("how.title")}</h2>
        <ol className="how">
          {[1, 2, 3, 4, 5].map((n) => (
            <li key={n}>
              <span className="how-n" aria-hidden="true">{n}</span>
              <h3>{t(`how.${n}.t`)}</h3>
              <p className="muted">{t(`how.${n}.d`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="wrap-wide block cta-band">
        <div>
          <h2 className="block-title">Built for everyone who touches a complaint</h2>
          <p className="muted">Citizens report. Field officers act. Nodal officers watch deadlines. The control room sees the whole city. Try each one with a demo account.</p>
        </div>
        <div className="hero-cta">
          <LinkButton to="/login">Sign in with a demo account</LinkButton>
        </div>
      </section>
    </>
  );
}
