import { useEffect, useRef } from "react";
import L from "leaflet";

// Standard OpenStreetMap tiles; styles.css mutes them in light mode and inverts them in dark mode.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const icon = (shape, color, size, ring) =>
  L.divIcon({
    className: "mk-wrap",
    html: `<span class="mk mk-${shape}${ring ? " mk-ring" : ""}" style="--c:${color};--s:${size}px"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const pinIcon = L.divIcon({
  className: "mk-wrap",
  html: '<span class="mk-pin"></span>',
  iconSize: [28, 38],
  iconAnchor: [14, 36],
});

// Declarative-ish wrapper around Leaflet. Callers pass plain data; layers are rebuilt when it changes.
//   markers:  [{ id, lat, lon, color, size, shape, ring, title, onClick }]
//   polygons: [{ points: [[lat, lon]...], color, opacity }]
//   circles:  [{ lat, lon, radiusM, color }]
//   pin:      { lat, lon } draggable pin (also moves on map click) with onPick(lat, lon)
//   fit:      [[lat, lon]...] points to fit; omitted keeps `center`/`zoom`
export default function MapView({ center = [28.65, 77.2], zoom = 11, height = 420, markers = [], polygons = [], circles = [], pin, onPick, fit, label = "Map" }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);
  const pinRef = useRef(null);
  const cb = useRef({});
  cb.current = { onPick };

  useEffect(() => {
    const m = L.map(el.current, { center, zoom, zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    map.current = m;
    layers.current = L.layerGroup().addTo(m);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    m.on("click", (e) => { if (cb.current.onPick) cb.current.onPick(e.latlng.lat, e.latlng.lng); });
    m.on("focus", () => m.scrollWheelZoom.enable());
    m.on("blur", () => m.scrollWheelZoom.disable());
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sig = [
    markers.map((m) => `${m.id}:${m.lat.toFixed(4)},${m.lon.toFixed(4)},${m.color},${m.size},${m.ring ? 1 : 0}`).join("|"),
    polygons.map((p) => `${p.points.length}:${p.points[0]?.[0]}:${p.color}`).join("|"),
    circles.map((c) => `${c.lat},${c.lon},${c.radiusM}`).join("|"),
  ].join("#");

  useEffect(() => {
    const g = layers.current;
    if (!g) return;
    g.clearLayers();
    polygons.forEach((p) => L.polygon(p.points, { color: p.color, weight: 1.5, fillColor: p.color, fillOpacity: p.opacity ?? 0.22, interactive: false }).addTo(g));
    circles.forEach((c) => L.circle([c.lat, c.lon], { radius: c.radiusM, color: c.color, weight: 1.5, fillOpacity: 0.12, interactive: false }).addTo(g));
    markers.forEach((mk) => {
      const m = L.marker([mk.lat, mk.lon], { icon: icon(mk.shape ?? "circle", mk.color ?? "#d6402f", mk.size ?? 16, mk.ring), title: mk.title, alt: mk.title, keyboard: !!mk.onClick }).addTo(g);
      if (mk.title) m.bindTooltip(mk.title, { direction: "top", offset: [0, -(mk.size ?? 16) / 2] });
      if (mk.onClick) m.on("click", () => mk.onClick(mk));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin) { pinRef.current?.remove(); pinRef.current = null; return; }
    if (!pinRef.current) {
      pinRef.current = L.marker([pin.lat, pin.lon], { icon: pinIcon, draggable: true, title: "Drag to the exact spot", alt: "Report location pin" }).addTo(m);
      pinRef.current.on("dragend", () => { const p = pinRef.current.getLatLng(); cb.current.onPick?.(p.lat, p.lng); });
    } else {
      pinRef.current.setLatLng([pin.lat, pin.lon]);
    }
  }, [pin?.lat, pin?.lon]);

  const fitSig = fit ? fit.map((p) => p.join(",")).join("|") : "";
  useEffect(() => {
    const m = map.current;
    if (!m || !fit?.length) return;
    if (fit.length === 1) m.setView(fit[0], Math.max(m.getZoom(), 14));
    else m.fitBounds(L.latLngBounds(fit), { padding: [30, 30], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSig]);

  return <div ref={el} className="map" style={{ height }} role="region" aria-label={label} tabIndex={0} />;
}
