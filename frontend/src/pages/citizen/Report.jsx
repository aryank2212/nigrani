import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../../lib/i18n.js";
import { useUser, useDb } from "../../lib/store.js";
import { useIncident, useNow, useTitle } from "../../lib/hooks.js";
import { PLACES } from "../../data/places.js";
import { nearestPlace } from "../../lib/geo.js";
import { TYPE_IDS, GRAP, grapStatus, isOpen } from "../../lib/rules.js";
import { REPORT_STEPS, photoProblem, submitReport } from "../../lib/pipeline.js";
import { fmtDuration } from "../../lib/time.js";
import { Icon, LinkButton, Photo, ProgressList, TierBadge, Badge } from "../../components/ui.jsx";
import MapView from "../../components/MapView.jsx";

const SAMPLES = [
  { key: "burn", type: "waste_burning", state: "active", label: "Burning waste" },
  { key: "dust", type: "construction_dust", state: "active", label: "Construction dust" },
  { key: "old", type: "waste_burning", state: "old", label: "Old photo", note: "will be rejected" },
  { key: "dup", type: "industrial_smoke", state: "dup", label: "Copied photo", note: "will be rejected" },
];

async function readPhoto(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return { kind: "upload", url: c.toDataURL("image/jpeg", 0.72), lastModified: file.lastModified };
}

function Result({ result, onRetry, onAnother }) {
  const { t } = useT();
  const now = useNow();
  const inc = useIncident(result.incident.id);
  if (result.outcome === "rejected") {
    return (
      <div className="result result-bad" role="status">
        <h2>{t("report.done.rejected")}</h2>
        <p>{result.reason}</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={onRetry}>{t("report.retake")}</button>
          <Link className="btn btn-ghost" to={`/incident/${result.incident.id}`}>See why</Link>
        </div>
      </div>
    );
  }
  if (!inc) return null;
  return (
    <div className="result result-good" role="status">
      <h2>{result.outcome === "merged" ? t("report.done.merged") : t("report.done.created")}</h2>
      <p className="mono">{inc.id}</p>
      <dl className="kv">
        <div><dt>Sent to</dt><dd>{inc.agency} · {inc.zone}</dd></div>
        <div><dt>Priority</dt><dd><TierBadge prio={inc.prio} /></dd></div>
        <div><dt>Officer must act within</dt><dd>{fmtDuration(inc.dueAt - now)}</dd></div>
        <div><dt>Reports on this incident</dt><dd>{inc.witnesses.length}</dd></div>
      </dl>
      {inc.exposed.some((r) => r.kind === "school") && (
        <p className="notice-box">Smoke from this spot is heading towards {inc.exposed.filter((r) => r.kind === "school").map((r) => r.name).slice(0, 2).join(" and ")}, so it is ranked higher.</p>
      )}
      <div className="row">
        <Link className="btn btn-primary" to={`/incident/${inc.id}`}>{t("report.track")}</Link>
        <button type="button" className="btn btn-ghost" onClick={onAnother}>{t("report.another")}</button>
      </div>
    </div>
  );
}

export default function Report() {
  useTitle("Report a problem");
  const { t } = useT();
  const user = useUser();
  const db = useDb();
  const fileRef = useRef(null);
  const home = PLACES.find((p) => p.name === user?.area) ?? PLACES.find((p) => p.id === "connaught-place");

  const [step, setStep] = useState(1);
  const [type, setType] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [pos, setPos] = useState({ lat: home.lat, lon: home.lon });
  const [landmark, setLandmark] = useState("");
  const [desc, setDesc] = useState("");
  const [anon, setAnon] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");
  const [phase, setPhase] = useState("form");
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState(null);

  useEffect(() => { window.scrollTo(0, 0); }, [step, phase]);

  const near = useMemo(() => nearestPlace(pos, PLACES), [pos]);
  const problem = photo ? photoProblem(photo) : null;
  const grap = type ? grapStatus(type, db.settings.stage) : null;
  const fit = useMemo(() => [[pos.lat, pos.lon]], [pos.lat, pos.lon]);

  const choose = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setPhoto(await readPhoto(file)); } catch { setGeoMsg("That file could not be read as a photo."); }
    e.target.value = "";
  };

  const locate = () => {
    if (!navigator.geolocation) return setGeoMsg("Location is not available on this device. Choose a locality instead.");
    setGeoMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lon: p.coords.longitude }); setGeoMsg("Using your current location."); },
      () => setGeoMsg("We could not get your location. Choose a locality instead."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const nearbyOpen = useMemo(
    () => db.incidents.find((i) => isOpen(i) && (!type || i.type === type) && i.placeId === near.place.id),
    [db.incidents, type, near.place.id],
  );

  const reset = () => { setStep(1); setType(null); setPhoto(null); setDesc(""); setLandmark(""); setPhase("form"); setResult(null); };

  const submit = async () => {
    setPhase("running");
    setSteps(REPORT_STEPS.map(() => ({ state: "pending" })));
    const res = await submitReport(
      { type, photo, lat: pos.lat, lon: pos.lon, landmark, desc, anonymous: anon }, user,
      (i, state, detail) => setSteps((prev) => {
        const n = [...prev];
        n[i] = { state, detail };
        if (state === "failed") for (let j = i + 1; j < n.length; j++) n[j] = { state: "skipped" };
        return n;
      }),
    );
    setResult(res);
    setPhase("done");
  };

  if (phase !== "form") {
    return (
      <div className="wrap page narrow">
        <h1>{phase === "running" ? "Checking your report…" : t("report.title")}</h1>
        <ProgressList labels={REPORT_STEPS} steps={steps} />
        {phase === "done" && <Result result={result} onRetry={() => { setPhase("form"); setStep(1); setPhoto(null); }} onAnother={reset} />}
      </div>
    );
  }

  const labels = [t("report.step1"), t("report.step2"), t("report.step3")];

  return (
    <div className="wrap page narrow">
      <h1>{t("report.title")}</h1>
      <ol className="stepper" aria-label="Progress">
        {labels.map((l, i) => (
          <li key={l} aria-current={step === i + 1 ? "step" : undefined} className={step > i + 1 ? "done" : step === i + 1 ? "now" : ""}>
            <span className="st-n" aria-hidden="true">{step > i + 1 ? <Icon name="check" size={14} /> : i + 1}</span>{l}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section aria-labelledby="s1">
          <h2 id="s1">{t("report.photo.title")}</h2>
          <p className="muted">{t("report.photo.hint")}</p>

          {photo ? (
            <div className="photo-pick">
              <Photo photo={photo} type={type ?? "waste_burning"} className="photo-preview" />
              <div className="row">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>{t("report.photo.change")}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhoto(null)}>Remove</button>
              </div>
            </div>
          ) : (
            <button type="button" className="dropzone" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={30} />
              <span>{t("report.photo.take")}</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="visually-hidden" tabIndex={-1} onChange={choose} aria-label={t("report.photo.take")} />

          {problem && photo?.kind === "upload" && (
            <div className="notice-box warn" role="alert">
              <p>{problem}</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhoto({ ...photo, override: true })}>Use anyway (demo only)</button>
            </div>
          )}

          <fieldset className="sample-set">
            <legend>{t("report.photo.samples")}</legend>
            <div className="samples">
              {SAMPLES.map((s) => (
                <button key={s.key} type="button" className={`sample${photo?.kind === "scene" && photo.state === s.state && type === s.type ? " on" : ""}`}
                  onClick={() => { setPhoto({ kind: "scene", state: s.state }); setType(s.type); }}>
                  <Photo photo={{ kind: "scene", state: s.state }} type={s.type} />
                  <span>{s.label}{s.note && <span className="muted small"> · {s.note}</span>}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="chips-set">
            <legend>{t("report.what")}</legend>
            <div className="chips">
              {TYPE_IDS.map((id) => (
                <label key={id} className={`chip-opt${type === id ? " on" : ""}`}>
                  <input type="radio" name="type" value={id} checked={type === id} onChange={() => setType(id)} />
                  <span>{t(`type.${id}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="step-actions">
            <span />
            <button type="button" className="btn btn-primary" disabled={!photo || !type} onClick={() => setStep(2)}>{t("report.next")} <Icon name="arrow" size={16} /></button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="s2">
          <h2 id="s2">{t("report.place.title")}</h2>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={locate}><Icon name="pin" size={16} /> {t("report.place.gps")}</button>
            <div className="field inline">
              <label htmlFor="loc">{t("report.place.pick")}</label>
              <select id="loc" value="" onChange={(e) => { const p = PLACES.find((x) => x.id === e.target.value); if (p) { setPos({ lat: p.lat, lon: p.lon }); setGeoMsg(""); } }}>
                <option value="">Choose…</option>
                {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <p className="muted small" aria-live="polite">{geoMsg || t("report.place.drag")}</p>

          <MapView height={300} center={[pos.lat, pos.lon]} zoom={14} pin={pos} onPick={(lat, lon) => setPos({ lat, lon })} fit={fit} label="Map: drag the pin to the problem location" />

          <div className="notice-box">
            <p><Icon name="pin" size={14} /> Nearest locality: <b>{near.place.name}</b> ({Math.round(near.distM)} m).</p>
            {near.distM <= 30000
              ? <p>This spot falls under <b>{near.place.agency}</b>, {near.place.zone}{near.place.agency === "MCD" ? " zone" : ""}. That is who will be asked to fix it.</p>
              : <p>This location is outside the Delhi-NCR area covered by this demo.</p>}
          </div>

          {nearbyOpen && (
            <p className="muted small">
              Demo shortcut: there is already an open {t(`type.${nearbyOpen.type}`).toLowerCase()} report in {near.place.name}.{" "}
              <button type="button" className="link-btn" onClick={() => setPos({ lat: nearbyOpen.lat + 0.0003, lon: nearbyOpen.lon + 0.0003 })}>Drop the pin next to it</button> to see duplicate merging.
            </p>
          )}

          <div className="field">
            <label htmlFor="lm">{t("report.place.landmark")}</label>
            <input id="lm" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder={t("report.place.landmarkHint")} />
          </div>

          <div className="step-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>{t("report.back")}</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>{t("report.next")} <Icon name="arrow" size={16} /></button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="s3">
          <h2 id="s3">{t("report.send.title")}</h2>
          <div className="review">
            <Photo photo={photo} type={type} className="photo-thumb" />
            <dl className="kv">
              <div><dt>Problem</dt><dd>{t(`type.${type}`)}</dd></div>
              <div><dt>Place</dt><dd>{landmark ? `${landmark}, ` : ""}{near.place.name}</dd></div>
              <div><dt>Goes to</dt><dd>{near.place.agency} · {near.place.zone}</dd></div>
            </dl>
          </div>
          {grap?.violation && (
            <p className="notice-box warn"><Badge tone="warn">GRAP {GRAP[db.settings.stage].name.split(" ·")[0]}</Badge> {grap.text} This will be marked as a violation.</p>
          )}
          <div className="field">
            <label htmlFor="desc">{t("report.desc")}</label>
            <textarea id="desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
            <span>{t("report.anon")}</span>
          </label>
          <div className="step-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>{t("report.back")}</button>
            <button type="button" className="btn btn-primary" onClick={submit}>{t("report.submit")}</button>
          </div>
        </section>
      )}
    </div>
  );
}
