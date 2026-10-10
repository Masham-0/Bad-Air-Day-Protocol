import type { SmokeTrace } from "@/lib/types";

const TOWNS: [string, number, number][] = [
  ["Delhi", 28.61, 77.21], ["Chandigarh", 30.73, 76.78], ["Amritsar", 31.63, 74.87], ["Ludhiana", 30.9, 75.85],
  ["Bathinda", 30.21, 74.95], ["Hisar", 29.15, 75.72], ["Agra", 27.18, 78.01], ["Jaipur", 26.91, 75.79],
  ["Bareilly", 28.37, 79.43], ["Lucknow", 26.85, 80.95], ["Dehradun", 30.32, 78.03], ["Meerut", 28.98, 77.71],
];

/** Indicative back-trajectories (now + 14:00) with the farm fires matched along them. Plain SVG, no tiles. */
export function SmokeMap({ now, afternoon }: { now: SmokeTrace; afternoon: SmokeTrace }) {
  const pts = [...now.path, ...afternoon.path, ...now.matched_fires, ...afternoon.matched_fires];
  let [s, n] = [Math.min(...pts.map((p) => p.lat)), Math.max(...pts.map((p) => p.lat))];
  let [w, e] = [Math.min(...pts.map((p) => p.lon)), Math.max(...pts.map((p) => p.lon))];
  const pad = 0.6;
  [s, n, w, e] = [s - pad, n + pad, w - pad, e + pad];
  const k = Math.cos(((s + n) / 2) * (Math.PI / 180));
  const W = 640;
  const H = Math.max(260, Math.min(520, (W * (n - s)) / ((e - w) * k)));
  const x = (lon: number) => ((lon - w) / (e - w)) * W;
  const y = (lat: number) => ((n - lat) / (n - s)) * H;
  const line = (t: SmokeTrace) => t.path.map((p) => `${x(p.lon).toFixed(1)},${y(p.lat).toFixed(1)}`).join(" ");
  const fires = new Map<string, { lat: number; lon: number; frp: number; late: boolean }>();
  now.matched_fires.forEach((f) => fires.set(`${f.lat},${f.lon}`, { lat: f.lat, lon: f.lon, frp: f.frp_mw, late: false }));
  afternoon.matched_fires.forEach((f) => {
    const key = `${f.lat},${f.lon}`;
    if (!fires.has(key)) fires.set(key, { lat: f.lat, lon: f.lon, frp: f.frp_mw, late: true });
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img" aria-label="Indicative smoke trace map">
      <rect width={W} height={H} className="map-bg" />
      {TOWNS.filter(([, la, lo]) => la > s && la < n && lo > w && lo < e).map(([name, la, lo]) => (
        <g key={name}>
          <circle cx={x(lo)} cy={y(la)} r={2} className="town" />
          <text x={x(lo) + 4} y={y(la) - 4} className="town-label">{name}</text>
        </g>
      ))}
      <polyline points={line(now)} className="path path-now" />
      <polyline points={line(afternoon)} className="path path-afternoon" />
      {[...fires.values()].map((f, i) => (
        <circle key={i} cx={x(f.lon)} cy={y(f.lat)} r={Math.min(9, 3 + Math.sqrt(f.frp))}
          className={f.late ? "fire fire-late" : "fire"}>
          <title>{`Fire ${f.frp} MW`}</title>
        </circle>
      ))}
      {now.path.filter((_, i) => i > 0 && i % 6 === 0).map((p) => (
        <text key={p.time} x={x(p.lon) + 5} y={y(p.lat) + 12} className="tick">-{now.path.indexOf(p)}h</text>
      ))}
      <circle cx={x(now.origin.lon)} cy={y(now.origin.lat)} r={6} className="school" />
      <text x={x(now.origin.lon) + 9} y={y(now.origin.lat) + 4} className="school-label">School</text>
      <g transform={`translate(10, ${H - 46})`} className="legend">
        <line x1={0} y1={6} x2={22} y2={6} className="path path-now" /><text x={28} y={10}>Air arriving now</text>
        <line x1={0} y1={22} x2={22} y2={22} className="path path-afternoon" /><text x={28} y={26}>Air arriving 14:00</text>
        <circle cx={150} cy={6} r={4} className="fire" /><text x={158} y={10}>Fire on path</text>
        <text x={0} y={42} className="indicative">Indicative: 120 m wind back-trajectory, not a dispersion model</text>
      </g>
    </svg>
  );
}
