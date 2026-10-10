import { Link } from "react-router-dom";
import { useT } from "../../lib/i18n.js";
import { useUser } from "../../lib/store.js";
import { useIncidents, useNow, useTitle } from "../../lib/hooks.js";
import { STATUS } from "../../lib/rules.js";
import { fmtAgo } from "../../lib/time.js";
import { Empty, LinkButton, PageHead, Photo, Sla, StatusBadge } from "../../components/ui.jsx";

export default function MyReports() {
  useTitle("My reports");
  const { t } = useT();
  const user = useUser();
  const now = useNow();
  const mine = useIncidents()
    .filter((i) => i.witnesses.some((w) => w.userId === user.id))
    .sort((a, b) => b.reportedAt - a.reportedAt);

  const latest = (i) => [...i.events].sort((a, b) => b.at - a.at)[0];

  return (
    <div className="wrap page narrow">
      <PageHead eyebrow={user.name} title={t("my.title")}>
        <LinkButton to="/report">{t("nav.report")}</LinkButton>
      </PageHead>
      {mine.length === 0 ? (
        <Empty title={t("my.empty")}><LinkButton to="/report">{t("hero.cta")}</LinkButton></Empty>
      ) : (
        <ul className="report-list">
          {mine.map((i) => (
            <li key={i.id}>
              <Link to={`/incident/${i.id}`} className="card card-link report-row">
                <Photo photo={i.photo} type={i.type} className="photo-thumb" />
                <div>
                  <p className="card-title">{t(`type.${i.type}`)} · {i.place.name}</p>
                  <p className="mono small muted">{i.id} · {fmtAgo(i.reportedAt, now)}{i.witnesses.length > 1 ? ` · ${i.witnesses.length} reports` : ""}</p>
                  <p className="row-badges"><StatusBadge status={i.status} /><Sla inc={i} now={now} /></p>
                  <p className="muted small">{STATUS[i.status] && latest(i)?.text}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
