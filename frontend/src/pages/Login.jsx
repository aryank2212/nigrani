import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useT } from "../lib/i18n.js";
import { loginWithOtp, loginWithPassword, switchUser, useUser } from "../lib/store.js";
import { useTitle } from "../lib/hooks.js";
import { DEMO_OTP, DEMO_PASSWORD, ROLE_LABEL, USERS } from "../data/users.js";
import { Segmented } from "../components/ui.jsx";
import { homeFor } from "../components/Layout.jsx";

export default function Login() {
  useTitle("Sign in");
  const { t } = useT();
  const nav = useNavigate();
  const user = useUser();
  const [params] = useSearchParams();
  const next = params.get("next");
  const [tab, setTab] = useState("citizen");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (user) return <Navigate to={next || homeFor(user.role)} replace />;

  const go = (u) => nav(next && u.role === "citizen" ? next : homeFor(u.role), { replace: true });
  const guard = (fn) => (e) => {
    e.preventDefault();
    setError("");
    try { go(fn()); } catch (err) { setError(err.message); }
  };
  const demo = (u) => { switchUser(u.id); go(u); };

  return (
    <div className="wrap-wide page login">
      <div className="login-form">
        <h1>{t("login.title")}</h1>
        <Segmented label="Account type" value={tab} onChange={(v) => { setTab(v); setError(""); }}
          options={[{ value: "citizen", label: t("login.citizen") }, { value: "official", label: t("login.official") }]} />

        {tab === "citizen" ? (
          <form onSubmit={sent ? guard(() => loginWithOtp(phone, otp, name)) : (e) => { e.preventDefault(); if (phone.replace(/\D/g, "").length < 10) setError("Enter a 10-digit mobile number."); else { setError(""); setSent(true); } }} noValidate>
            <div className="field">
              <label htmlFor="phone">{t("login.phone")}</label>
              <input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98100 12345" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={sent} />
            </div>
            {sent && (
              <>
                <p className="notice-box">Demo: no SMS is sent. Use code <b>{DEMO_OTP}</b>.</p>
                <div className="field">
                  <label htmlFor="otp">{t("login.otp")}</label>
                  <input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} autoFocus />
                </div>
                <div className="field">
                  <label htmlFor="name">{t("login.name")}</label>
                  <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  <p className="hint">Only needed the first time.</p>
                </div>
              </>
            )}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" type="submit">{sent ? t("login.verify") : t("login.sendOtp")}</button>
            <p className="muted small">{t("login.register")}</p>
          </form>
        ) : (
          <form onSubmit={guard(() => loginWithPassword(email, password))} noValidate>
            <div className="field">
              <label htmlFor="email">{t("login.email")}</label>
              <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pw">{t("login.password")}</label>
              <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" type="submit">{t("login.signin")}</button>
            <p className="muted small">Demo password for every department account: <b>{DEMO_PASSWORD}</b></p>
          </form>
        )}
      </div>

      <aside className="login-demo" aria-labelledby="demo-h">
        <h2 id="demo-h">{t("login.demo")}</h2>
        <p className="muted small">One click signs you in. Everything you do is saved in this browser, so you can file a report as a citizen, then switch to the officer to act on it.</p>
        {["citizen", "officer", "nodal", "admin"].map((role) => (
          <div key={role} className="demo-group">
            <p className="demo-role">{ROLE_LABEL[role]}</p>
            <ul>
              {USERS.filter((u) => u.role === role).map((u) => (
                <li key={u.id}>
                  <button type="button" className="demo-acct" onClick={() => demo(u)}>
                    <span><b>{u.name}</b><span className="muted small"> {u.title ?? `Citizen, ${u.area}`}</span></span>
                    <span className="muted small">{u.role === "citizen" ? u.phone : u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  );
}
