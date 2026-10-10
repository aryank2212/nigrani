export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export function fmtDuration(ms) {
  const abs = Math.abs(ms);
  if (abs < MIN) return "under 1m";
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / HOUR);
  const m = Math.floor((abs % HOUR) / MIN);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

export function fmtAgo(ts, now) {
  const diff = now - ts;
  if (diff < MIN) return "just now";
  return `${fmtDuration(diff)} ago`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDateTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

export const fmtPct = (x) => `${Math.round(x * 100)}%`;
