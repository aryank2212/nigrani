const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function offset(p, eastM, northM) {
  return { lat: p.lat + northM / 110574, lon: p.lon + eastM / (111320 * Math.cos(rad(p.lat))) };
}

const toXY = (o, p) => ({
  e: (p.lon - o.lon) * 111320 * Math.cos(rad(o.lat)),
  n: (p.lat - o.lat) * 110574,
});

export function nearestPlace(point, places) {
  let best = null;
  for (const place of places) {
    const d = distance(point, place);
    if (!best || d < best.distM) best = { place, distM: d };
  }
  return best;
}

// ponytail: Gaussian plume (Briggs urban, stability class D) as a screening model, not a
// dispersion study. Concentration is relative: THR sets the contour that counts as "inside".
const THR = 3e-6;

export function plume(src, wind, { q = 1, h = 5, maxM = 5000 } = {}) {
  const u = Math.max(1, wind.speedKmh / 3.6);
  const th = rad((wind.fromDeg + 180) % 360); // direction the smoke travels towards
  const d = { e: Math.sin(th), n: Math.cos(th) };
  const c = { e: Math.cos(th), n: -Math.sin(th) };
  const sy = (x) => (0.16 * x) / Math.sqrt(1 + 0.0004 * x);
  const sz = (x) => (0.14 * x) / Math.sqrt(1 + 0.0003 * x);
  const conc = (x, y) =>
    (q / (Math.PI * u * sy(x) * sz(x))) * Math.exp(-(y * y) / (2 * sy(x) ** 2)) * Math.exp(-(h * h) / (2 * sz(x) ** 2));

  const left = [];
  const right = [];
  let reachM = 0;
  for (let x = 40; x <= maxM; x += 40) {
    const c0 = conc(x, 0);
    if (c0 < THR) break;
    const hw = sy(x) * Math.sqrt(2 * Math.log(c0 / THR));
    left.push(offset(src, d.e * x + c.e * hw, d.n * x + c.n * hw));
    right.push(offset(src, d.e * x - c.e * hw, d.n * x - c.n * hw));
    reachM = x;
  }
  const polygon = [src, ...left, ...right.reverse()].map((p) => [p.lat, p.lon]);

  // Ratio of concentration to the threshold at a point (>= 1 means inside the plume).
  const exposureAt = (p) => {
    const { e, n } = toXY(src, p);
    const x = e * d.e + n * d.n;
    if (x < 30 || x > maxM) return 0;
    const y = e * c.e + n * c.n;
    return conc(x, y) / THR;
  };
  return { polygon, reachM, exposureAt };
}

export const compass = (deg) =>
  ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][
    Math.round(deg / 22.5) % 16
  ];
