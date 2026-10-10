import { useT } from "../lib/i18n.js";
import { useDb } from "../lib/store.js";
import { useTitle } from "../lib/hooks.js";
import { GRAP, TYPE_IDS, TYPES, grapStatus, slaHours } from "../lib/rules.js";
import { Badge, Icon, LinkButton, PageHead } from "../components/ui.jsx";

const TONE = { ban: "bad", norm: "warn", none: "neutral" };
const WORD = { ban: "Banned today", norm: "Breaks GRAP norms", none: "No extra restriction" };

export default function Grap() {
  useTitle("What's banned today");
  const { t } = useT();
  const stage = useDb().settings.stage;

  return (
    <div className="wrap-wide page">
      <PageHead eyebrow="GRAP · Graded Response Action Plan" title="What's banned today" />
      <section className="stage-now" aria-labelledby="now-h">
        <p className="eyebrow">In force right now (simulated)</p>
        <h2 id="now-h">{GRAP[stage].name}</h2>
        <p className="muted">{GRAP[stage].band}</p>
        <ul>{GRAP[stage].measures.map((m) => <li key={m}><Icon name="check" size={16} /> {m}</li>)}</ul>
      </section>

      <section className="block-sm" aria-labelledby="rep-h">
        <h2 id="rep-h" className="block-title">What you can report today</h2>
        <p className="muted">Nigrani checks every complaint against today's stage. A complaint about something banned today is marked as a violation and gets a shorter deadline.</p>
        <table className="table">
          <caption className="visually-hidden">Status of each type of pollution at the current GRAP stage</caption>
          <thead><tr><th scope="col">Problem</th><th scope="col">Today</th><th scope="col">Why</th><th scope="col">Officer must act within</th></tr></thead>
          <tbody>
            {TYPE_IDS.map((id) => {
              const g = grapStatus(id, stage);
              return (
                <tr key={id}>
                  <th scope="row">{t(`type.${id}`)}</th>
                  <td><Badge tone={TONE[g.level]}>{WORD[g.level]}</Badge></td>
                  <td>{g.text}</td>
                  <td>{slaHours(id, stage)} h</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="hero-cta"><LinkButton to="/report">{t("hero.cta")}</LinkButton></div>
      </section>

      <section className="block-sm" aria-labelledby="all-h">
        <h2 id="all-h" className="block-title">All stages</h2>
        <div className="stages">
          {[1, 2, 3, 4].map((s) => (
            <article key={s} className={`panel stage${s === stage ? " now" : ""}`}>
              <h3>{GRAP[s].name}</h3>
              <p className="muted small">{GRAP[s].band}</p>
              <ul>{GRAP[s].measures.map((m) => <li key={m}>{m}</li>)}</ul>
            </article>
          ))}
        </div>
        <p className="muted small">A simplified summary for the demo. Always check the current order from the Commission for Air Quality Management (CAQM).</p>
      </section>
    </div>
  );
}
