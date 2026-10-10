import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n.js";
import { logout, resetDemo, switchUser, useUser, allUsers } from "../lib/store.js";
import { ROLE_LABEL, USERS } from "../data/users.js";
import { Icon, Toasts, toast } from "./ui.jsx";

export const homeFor = (role) =>
  ({ citizen: "/my-reports", officer: "/officer", nodal: "/nodal", admin: "/admin" })[role] ?? "/";

function navFor(user, t) {
  const common = [
    { to: "/map", label: t("nav.map") },
    { to: "/scoreboard", label: t("nav.scoreboard") },
    { to: "/grap", label: t("nav.grap") },
  ];
  if (user?.role === "officer") return [{ to: "/officer", label: t("nav.queue"), end: true }, { to: "/officer/closed", label: t("nav.closed") }, ...common];
  if (user?.role === "nodal") return [{ to: "/nodal", label: t("nav.dashboard"), end: true }, { to: "/nodal/queue", label: t("nav.queue") }, ...common];
  if (user?.role === "admin") {
    return [
      { to: "/admin", label: t("nav.command"), end: true },
      { to: "/admin/incidents", label: t("nav.incidents") },
      { to: "/admin/policies", label: t("nav.policies") },
      ...common.slice(0, 2),
    ];
  }
  return [
    { to: "/", label: t("nav.home"), end: true },
    { to: "/report", label: t("nav.report") },
    ...(user ? [{ to: "/my-reports", label: t("nav.myReports") }] : []),
    ...common,
  ];
}

function UserMenu({ user }) {
  const { t } = useT();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!user) return <Link className="btn btn-primary btn-sm" to="/login">{t("nav.signin")}</Link>;

  const swap = (id) => {
    switchUser(id);
    setOpen(false);
    nav(homeFor(USERS.find((u) => u.id === id)?.role));
  };
  const groups = ["citizen", "officer", "nodal", "admin"].map((r) => [r, allUsers().filter((u) => u.role === r)]);

  return (
    <div className="usermenu" ref={box}>
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        <Icon name="user" size={16} />
        <span className="um-name">{user.name}</span>
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          <p className="menu-who"><b>{user.name}</b><br /><span className="muted small">{ROLE_LABEL[user.role]}{user.agency && user.role !== "citizen" ? ` · ${user.agency}` : ""}</span></p>
          <p className="menu-h">Switch demo account</p>
          {groups.map(([role, list]) => (
            <div key={role}>
              {list.map((u) => (
                <button key={u.id} type="button" role="menuitem" className={`menu-item${u.id === user.id ? " on" : ""}`} onClick={() => swap(u.id)}>
                  <span>{u.name}</span>
                  <span className="muted small">{role === "citizen" ? "Citizen" : `${ROLE_LABEL[role]}${u.agency ? ` · ${u.agency}` : ""}${u.zone && u.zone !== "*" ? ` · ${u.zone}` : ""}`}</span>
                </button>
              ))}
            </div>
          ))}
          <button type="button" role="menuitem" className="menu-item menu-out" onClick={() => { logout(); setOpen(false); nav("/"); }}>{t("nav.signout")}</button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { t, lang, setLang } = useT();
  const user = useUser();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const items = navFor(user, t);

  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <div className="demo-bar">
        <span>Demo build · every complaint, agency response and AI verdict is simulated</span>
        <button type="button" className="link-btn" onClick={() => { resetDemo(); toast("Demo data reset to its starting state."); }}>Reset demo data</button>
      </div>
      <header className="nav">
        <div className="nav-in">
          <Link to="/" className="brand" aria-label="Nigrani home">
            <span className="mark" aria-hidden="true" />
            <span>Nigrani</span>
            <span className="brand-dev" lang="hi" aria-hidden="true">निगरानी</span>
          </Link>
          <nav aria-label="Main" className={`nav-links${menu ? " open" : ""}`} id="main-nav">
            {items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end}>{i.label}</NavLink>
            ))}
          </nav>
          <div className="nav-right">
            <button type="button" className="btn btn-ghost btn-sm" lang={lang === "en" ? "hi" : "en"} onClick={() => setLang(lang === "en" ? "hi" : "en")}>{t("common.language")}</button>
            <UserMenu user={user} />
            <button type="button" className="btn btn-ghost btn-sm nav-toggle" aria-expanded={menu} aria-controls="main-nav" onClick={() => setMenu(!menu)}>
              <Icon name="menu" size={18} /><span className="visually-hidden">{t("nav.menu")}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="content" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="foot">
        <div className="wrap-wide foot-in">
          <div>
            <p className="brand-line"><span className="mark" aria-hidden="true" /> Nigrani</p>
            <p className="muted small">Verifies, routes and audits Delhi-NCR air pollution complaints, so they can't be ignored or fake-closed.</p>
          </div>
          <div className="small muted">
            <p>Simulated demo data. Jurisdictions, schools and readings are illustrative placeholders; hospital locations are approximate.</p>
            <p>GRAP summaries are simplified. Always check the current CAQM order. Built for the WeMakeDevs × AWS Environmental Hacks.</p>
            <p>Complaint statistics that motivate this project come from public reports by MCD, CPCB and the Supreme Court commissioners.</p>
          </div>
        </div>
      </footer>
      <Toasts />
    </>
  );
}

export function RequireRole({ roles, children }) {
  const user = useUser();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!roles.includes(user.role)) {
    return (
      <div className="wrap page">
        <h1>This page is not for your role</h1>
        <p className="muted">You are signed in as {ROLE_LABEL[user.role].toLowerCase()}. <Link to={homeFor(user.role)}>Go to your home page</Link>.</p>
      </div>
    );
  }
  return children;
}
