import { useEffect, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import Scene from "./Scene.jsx";
import { STATUS, ESCALATION_LABEL } from "../lib/rules.js";
import { HOUR, fmtDateTime, fmtDuration } from "../lib/time.js";
import { allUsers } from "../lib/store.js";

// ---------- icons ----------
const PATHS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  arrow: "M5 12h14M13 6l6 6-6 6",
  chevron: "M9 6l6 6-6 6",
  pin: "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11zM12 12.2a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8z",
  clock: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  alert: "M12 8v5M12 16.5v.01M10.3 4.2L2.8 17.5A2 2 0 004.5 20.5h15a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z",
  camera: "M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z",
  menu: "M4 7h16M4 12h16M4 17h16",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0",
  wind: "M3 9h11a3 3 0 10-3-3M3 15h14a3 3 0 11-3 3M3 12h8",
};
export const Icon = ({ name, size = 18 }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={PATHS[name]} />
  </svg>
);

// ---------- badges ----------
export const Badge = ({ tone = "neutral", children, className = "" }) => (
  <span className={`badge badge-${tone} ${className}`}>{children}</span>
);

export const StatusBadge = ({ status }) => <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;

const TIER_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
export const TierBadge = ({ prio }) => (
  <span className={`tier tier-${prio.tier}`}>
    <span className="tier-dot" aria-hidden="true" />
    {TIER_LABEL[prio.tier]} <b>{prio.score}</b>
  </span>
);

export function Sla({ inc, now }) {
  if (inc.status === "rejected") return null;
  if (inc.status === "closed") {
    const onTime = inc.closure && inc.closure.at <= inc.reportedAt + inc.slaHours * HOUR;
    return <Badge tone={onTime ? "good" : "warn"}>{onTime ? "Closed on time" : "Closed late"}</Badge>;
  }
  const left = inc.dueAt - now;
  if (left > 0) return <Badge tone={left < inc.slaHours * HOUR * 0.25 ? "warn" : "neutral"}><Icon name="clock" size={14} /> Due in {fmtDuration(left)}</Badge>;
  return (
    <Badge tone="bad">
      <Icon name="alert" size={14} /> Overdue {fmtDuration(left)}
      {inc.esc > 0 && <> · with {ESCALATION_LABEL[inc.esc]}</>}
    </Badge>
  );
}

// ---------- photo ----------
export function Photo({ photo, type, className = "" }) {
  if (photo?.kind === "upload") return <img className={`scene ${className}`} src={photo.url} alt="Photo uploaded with the report" />;
  return <Scene type={type} state={photo?.state ?? "active"} className={className} />;
}

// ---------- timeline ----------
const KIND_TONE = {
  reported: "neutral", ai_verified: "info", routed: "info", merged: "neutral", acknowledged: "info", action: "info",
  closure_attempt: "neutral", closed: "good", reopened: "bad", rejected: "bad", closure_denied: "bad",
  reassigned: "info", escalated: "warn",
};
export function Timeline({ events }) {
  const users = allUsers();
  const name = (id) => users.find((u) => u.id === id)?.name;
  return (
    <ol className="timeline">
      {events.map((e, i) => (
        <li key={i} className={`tl-${KIND_TONE[e.kind] ?? "neutral"}`}>
          <span className="tl-dot" aria-hidden="true" />
          <div>
            <p>{e.text}</p>
            <p className="muted small">{fmtDateTime(e.at)}{name(e.by) ? ` · ${name(e.by)}` : ""}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------- pipeline progress ----------
export function ProgressList({ labels, steps }) {
  return (
    <ol className="pipeline" aria-live="polite">
      {labels.map((label, i) => {
        const s = steps[i] ?? { state: "pending" };
        return (
          <li key={label} className={`pl-${s.state}`}>
            <span className="pl-icon" aria-hidden="true">
              {s.state === "done" && <Icon name="check" size={16} />}
              {s.state === "failed" && <Icon name="x" size={16} />}
              {s.state === "running" && <span className="spinner" />}
            </span>
            <div>
              <p className="pl-label">{label}</p>
              {s.detail && <p className="pl-detail">{s.detail}</p>}
              {s.state === "skipped" && <p className="pl-detail">Skipped</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- layout helpers ----------
export const PageHead = ({ eyebrow, title, children }) => (
  <header className="page-head">
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
    </div>
    {children && <div className="page-actions">{children}</div>}
  </header>
);

export const Stat = ({ label, value, hint, tone }) => (
  <div className={`stat${tone ? ` stat-${tone}` : ""}`}>
    <p className="stat-label">{label}</p>
    <p className="stat-value">{value}</p>
    {hint && <p className="stat-hint">{hint}</p>}
  </div>
);

export const Empty = ({ title, children }) => (
  <div className="empty">
    <p className="empty-title">{title}</p>
    {children && <div className="muted">{children}</div>}
  </div>
);

export function Segmented({ label, options, value, onChange, name }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value} className={value === o.value ? "on" : ""}>
          <input type="radio" name={name ?? label} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export const LinkButton = ({ to, children, variant = "primary", ...rest }) => (
  <Link to={to} className={`btn btn-${variant}`} {...rest}>{children}</Link>
);

// ---------- toasts ----------
let toasts = [];
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
export function toast(message, tone = "neutral") {
  const t = { id: Math.random().toString(36).slice(2), message, tone };
  toasts = [...toasts, t];
  emit();
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); emit(); }, 4500);
}
export function Toasts() {
  const list = useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => <p key={t.id} className={`toast toast-${t.tone}`}>{t.message}</p>)}
    </div>
  );
}

// ---------- misc ----------
export function ScrollToTop({ dep }) {
  useEffect(() => { window.scrollTo(0, 0); }, [dep]);
  return null;
}
