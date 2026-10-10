const grid = document.getElementById("schools-grid");
const modal = document.getElementById("advisory-modal");
const modalBody = document.getElementById("modal-body");

document.getElementById("modal-close").addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.add("hidden");
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function loadSchools() {
  grid.innerHTML = '<div class="loading">Loading AQI data&hellip;</div>';
  try {
    const res = await fetch("/api/schools");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const schools = await res.json();
    renderGrid(schools);
  } catch (err) {
    grid.innerHTML = `<div class="error">Could not load schools: ${escapeHtml(err.message)}</div>`;
  }
}

function renderGrid(schools) {
  grid.innerHTML = "";
  for (const s of schools) {
    const card = document.createElement("div");
    card.className = "card";
    card.style.borderLeftColor = s.risk_color;
    card.innerHTML = `
      <h3>${escapeHtml(s.name)}</h3>
      <div class="area">${escapeHtml(s.area)} &middot; ${escapeHtml(s.age_group)}</div>
      <div class="aqi-row">
        <span class="aqi-number">${s.aqi}</span>
        <span class="risk-badge" style="background:${s.risk_color}">${escapeHtml(s.risk_level)}</span>
      </div>
      <div class="meta-row">
        <span><span class="live-dot ${s.is_live ? "live" : "offline"}"></span>${s.is_live ? "Live" : "Offline snapshot"}</span>
        <span>${escapeHtml(s.updated_local)}</span>
      </div>
    `;
    card.addEventListener("click", () => openAdvisory(s.id));
    grid.appendChild(card);
  }
}

async function openAdvisory(schoolId) {
  modal.classList.remove("hidden");
  modalBody.innerHTML = '<div class="loading">Generating advisory&hellip;</div>';
  try {
    const res = await fetch(`/api/schools/${schoolId}/advisory`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    modalBody.innerHTML = `
      <span class="mode-tag">${data.mode === "agent" ? "AWS Strands agent" : "rule-based (no LLM key set)"}</span>
      <h2>${escapeHtml(data.school.name)}</h2>
      <div class="advisory-text">${escapeHtml(data.text)}</div>
    `;
  } catch (err) {
    modalBody.innerHTML = `<div class="error">Could not load advisory: ${escapeHtml(err.message)}</div>`;
  }
}

loadSchools();
setInterval(loadSchools, 60000);
