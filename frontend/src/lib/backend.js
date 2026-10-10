// Thin client for the real Nigrani backend (FastAPI + Strands + Bedrock + DynamoDB/S3).
// Every function here fails soft (returns null) on any network error, timeout, or non-2xx
// response -- callers in pipeline.js fall back to the existing simulated pipeline when that
// happens, so the demo never breaks because the backend or AWS credentials aren't up.
export const BACKEND_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) || "http://localhost:8000";

async function withTimeout(promise, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await promise(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function pingBackend(timeoutMs = 1800) {
  try {
    const res = await withTimeout((signal) => fetch(`${BACKEND_URL}/api/health`, { signal }), timeoutMs);
    return res.ok;
  } catch {
    return false;
  }
}

// { merged_into: string|null, incident: {...} } on success, or null on any failure.
export async function submitToBackend({ photoBlob, lat, lon, description, language = "en", categoryHint = "" }, timeoutMs = 20000) {
  const form = new FormData();
  form.append("photo", photoBlob, "report.jpg");
  form.append("lat", String(lat));
  form.append("lon", String(lon));
  form.append("description", description || "");
  form.append("language", language);
  if (categoryHint) form.append("category_hint", categoryHint);
  try {
    const res = await withTimeout(
      (signal) => fetch(`${BACKEND_URL}/api/complaints`, { method: "POST", body: form, signal }),
      timeoutMs,
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Returns the updated incident on success, or null on any failure.
export async function closeOnBackend(backendId, photoBlob, timeoutMs = 20000) {
  const form = new FormData();
  form.append("photo", photoBlob, "closure.jpg");
  try {
    const res = await withTimeout(
      (signal) => fetch(`${BACKEND_URL}/api/complaints/${backendId}/close`, { method: "POST", body: form, signal }),
      timeoutMs,
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Backend categories <-> this app's TYPE_IDS. "unclear"/"other" and "road_dust" have no
// confident mapping on either side.
export const CATEGORY_TO_TYPE = {
  garbage_burning: "waste_burning",
  construction_dust: "construction_dust",
  uncovered_debris: "debris",
  industrial_smoke: "industrial_smoke",
};
export const TYPE_TO_CATEGORY = {
  waste_burning: "garbage_burning",
  construction_dust: "construction_dust",
  debris: "uncovered_debris",
  industrial_smoke: "industrial_smoke",
};
