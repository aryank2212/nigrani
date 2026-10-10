const $ = (id) => document.getElementById(id);
const list = $("list"), status = $("status"), dialog = $("detail"), body = $("detail-body");

// Plain-language wording for each risk level (index matches risk.py _LEVELS).
const LEVELS = [
  { say: "Safe to play outside", range: "0–50" },
  { say: "Fine, watch sensitive children", range: "51–100" },
  { say: "Keep outdoor time short", range: "101–150" },
  { say: "Recess indoors today", range: "151–200" },
  { say: "Stay inside", range: "201–300" },
  { say: "Consider closing early", range: "301 and above" },
];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

// "2026-10-10 13:00" -> "10 Oct, 13:00" (falls back to the raw string)
function when(s) {
  const d = new Date(String(s).replace(" ", "T"));
  if (isNaN(d)) return s;
  return `${d.getDate()} ${d.toLocaleString("en-IN", { month: "short" })}, ${String(s).slice(11, 16)}`;
}

// Minimal, safe markdown for the agent's text: **bold**, "- " bullets, paragraphs.
function md(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const out = [];
  let items = null;
  const flush = () => { if (items) out.push(`<ul>${items.join("")}</ul>`); items = null; };
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)/);
    if (bullet) { (items ||= []).push(`<li>${inline(bullet[1])}</li>`); continue; }
    flush();
    if (line) out.push(`<p>${inline(line.replace(/^#+\s*/, ""))}</p>`);
  }
  flush();
  return out.join("");
}

const meter = (level) =>
  `<div class="meter" role="img" aria-label="Level ${level + 1} of 6">${
    LEVELS.map((_, i) => `<i class="${i <= level ? "on" : ""}"></i>`).join("")
  }</div>`;

const schools = new Map();
let loading = false;
let lastLoad = 0;

async function load() {
  if (loading) return;
  loading = true;
  const hadData = schools.size > 0;
  const focusedId = document.activeElement?.closest?.("[data-id]")?.dataset.id;
  list.setAttribute("aria-busy", "true");
  if (!hadData) {
    list.innerHTML = '<li class="skeleton" aria-hidden="true"><i></i><i></i></li>'.repeat(6);
  }
  try {
    const res = await fetch("/api/schools");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    schools.clear();
    data.forEach((s) => schools.set(s.id, s));
    render(data);
    if (focusedId) list.querySelector(`[data-id="${focusedId}"]`)?.focus();
    lastLoad = Date.now();
  } catch (err) {
    if (hadData) {
      status.textContent = "Couldn't refresh. Showing the last readings we have.";
    } else {
      status.textContent = "";
      list.innerHTML = `<li class="notice" role="alert">We couldn't load air quality just now. <button type="button" class="link" data-retry>Try again</button></li>`;
    }
  } finally {
    list.setAttribute("aria-busy", "false");
    loading = false;
  }
}

function render(data) {
  list.innerHTML = data.map((s) => {
    const lv = LEVELS[s.risk_level_index] ?? LEVELS[0];
    return `<li data-level="${s.risk_level_index}">
      <button type="button" class="school" data-id="${esc(s.id)}">
        <span>
          <span class="name">${esc(s.name)}</span>
          <span class="meta">${esc(s.area)} · ${esc(s.age_group)} school</span>
          <span class="verdict"><span class="dot" aria-hidden="true"></span>${esc(lv.say)}</span>
        </span>
        <span class="reading">
          <span class="aqi"><b>${s.aqi}</b><small>AQI</small></span>
          <svg class="chev" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </button>
    </li>`;
  }).join("");

  const latest = data.map((s) => s.updated_local).sort().pop();
  const live = data.every((s) => s.is_live);
  status.textContent = live
    ? `Live readings, updated ${when(latest)}`
    : `Saved readings from ${when(latest)}. Live feed isn't connected.`;
}

function renderLegend() {
  $("legend").innerHTML = LEVELS.map((l, i) => `
    <li data-level="${i}"><span class="dot" aria-hidden="true"></span><span>${esc(l.say)}</span><span class="range">AQI ${esc(l.range)}</span></li>`
  ).join("");
}

let openToken = 0;

async function openDetail(id) {
  const s = schools.get(id);
  if (!s) return;
  const token = ++openToken;
  const level = s.risk_level_index;
  body.innerHTML = `
    <div data-level="${level}">
      <p class="eyebrow">${esc(s.area)} · ${esc(s.age_group)} school</p>
      <h2 id="detail-title">${esc(s.name)}</h2>
      <div class="big"><b>${s.aqi}</b><span>AQI · ${esc(s.category)}</span></div>
      <p class="big-verdict"><span class="dot" aria-hidden="true"></span>${esc((LEVELS[level] ?? LEVELS[0]).say)}</p>
      ${meter(level)}
      <div class="advice" id="advice" aria-live="polite" aria-busy="true"><p class="eyebrow">Preparing today's advice…</p></div>
    </div>`;
  dialog.showModal();
  dialog.scrollTop = 0;

  const advice = $("advice");
  try {
    const res = await fetch(`/api/schools/${encodeURIComponent(id)}/advisory`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const a = await res.json();
    if (token !== openToken) return; // a different school was opened meanwhile
    const r = a.reading, k = a.risk;
    const pollutant = { pm25: "PM2.5", pm10: "PM10" }[r.dominant_pollutant] ?? String(r.dominant_pollutant).toUpperCase();
    advice.innerHTML = `
      <p class="headline">${esc(k.headline)}</p>
      <h3>What to do</h3>
      <ul class="checks">${k.actions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p class="why">${esc(k.why)} Children breathe more air for their size than adults, so the same air affects them more.</p>
      ${a.mode === "agent" ? `<h3>From our AI advisor</h3><div class="prose">${md(a.text)}</div>` : ""}
      <h3>About this reading</h3>
      <dl class="facts">
        <div><dt>Station</dt><dd>${esc(r.name)}</dd></div>
        <div><dt>Updated</dt><dd>${esc(when(r.updated_local))}${r.is_live ? "" : " (saved)"}</dd></div>
        <div><dt>Main pollutant</dt><dd>${esc(pollutant)}</dd></div>
        ${r.temp_c != null ? `<div><dt>Temperature</dt><dd>${esc(r.temp_c)}°C</dd></div>` : ""}
      </dl>`;
  } catch (err) {
    if (token !== openToken) return;
    advice.innerHTML = `<p>We couldn't load the advice just now.</p><p><button type="button" class="link" data-reload="${esc(id)}">Try again</button></p>`;
  } finally {
    if (token === openToken) advice.setAttribute("aria-busy", "false");
  }
}

list.addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (card) return openDetail(card.dataset.id);
  if (e.target.closest("[data-retry]")) load();
});
body.addEventListener("click", (e) => {
  const retry = e.target.closest("[data-reload]");
  if (retry) openDetail(retry.dataset.reload);
});
$("refresh").addEventListener("click", load);

// Readings change slowly: refresh when the tab comes back after a while, not on a timer.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastLoad > 5 * 60 * 1000) load();
});

// Light-dismiss fallback for browsers without <dialog closedby> (Safari).
if (!("closedBy" in HTMLDialogElement.prototype)) {
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right;
    if (!inside) dialog.close();
  });
}

renderLegend();
load();
