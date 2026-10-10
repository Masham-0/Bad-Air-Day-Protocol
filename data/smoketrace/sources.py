"""Live inputs for the smoke trace: Open-Meteo wind on a grid (GridWind) and NASA FIRMS fires.

Both fall back to /mocks on any failure. Verified against the live APIs on 10 Oct 2026:
  * Open-Meteo forecast: hourly `wind_speed_120m`, `wind_direction_120m` exist; with
    `wind_speed_unit=ms` speeds are m/s. Times have NO trailing Z even with timezone=GMT.
  * Several comma-separated coordinates -> the response is a JSON LIST, one object per point,
    in request order. Returned lat/lon snap to the model grid, so match by position, not coords.
  * FIRMS VIIRS CSV columns: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,
    satellite,confidence,version,bright_ti5,frp,daynight (acq_time is UTC HHMM, frp in MW).
    The public South_Asia 24h/48h/7d files need no key; the area API needs FIRMS_MAP_KEY.

Run `python -m data.smoketrace.sources` for a live check.
"""
import csv
import io
import math
import os
import sys
import urllib.parse
from datetime import timedelta

from data.util import MOCKS, http_get, http_get_json, iso_z, load_env, load_json, parse_utc, shift_iso

# Punjab + Haryana + Delhi + UP + north Rajasthan, as (west, south, east, north). Wide enough
# that a 24 h back-trajectory at ~5 m/s from Delhi stays inside in most directions (~430 km).
BBOX = (72.5, 25.5, 81.5, 33.0)
GRID_STEP_DEG = 1.0
WIND_LEVEL = "120m"

OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"
FIRMS_AREA = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{w},{s},{e},{n}/{days}"
FIRMS_PUBLIC_BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire"
FIRMS_PUBLIC = {
    "VIIRS_SNPP_NRT": "suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_Asia_{period}.csv",
    "VIIRS_NOAA20_NRT": "noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_Asia_{period}.csv",
    "VIIRS_NOAA21_NRT": "noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_Asia_{period}.csv",
}
FIRMS_SOURCES = tuple(FIRMS_PUBLIC)


def grid_points(bbox=BBOX, step=GRID_STEP_DEG):
    w, s, e, n = bbox
    lats = [round(s + i * step, 4) for i in range(int(round((n - s) / step)) + 1)]
    lons = [round(w + j * step, 4) for j in range(int(round((e - w) / step)) + 1)]
    return [(la, lo) for la in lats for lo in lons]


def wind_url(points, past_days=2, forecast_days=2, level=WIND_LEVEL):
    q = {
        "latitude": ",".join(f"{p[0]:.4f}" for p in points),
        "longitude": ",".join(f"{p[1]:.4f}" for p in points),
        "hourly": f"wind_speed_{level},wind_direction_{level}",
        "wind_speed_unit": "ms",
        "timezone": "GMT",
        "past_days": past_days,
        "forecast_days": forecast_days,
    }
    return OPEN_METEO_FORECAST + "?" + urllib.parse.urlencode(q, safe=",")


def _to_uv(speed, from_deg):
    """Meteorological (speed, from-bearing) -> (u east, v north) of the air's motion."""
    r = math.radians(from_deg)
    return -speed * math.sin(r), -speed * math.cos(r)


def _from_uv(u, v):
    speed = math.hypot(u, v)
    from_deg = (math.degrees(math.atan2(-u, -v)) + 360.0) % 360.0
    return speed, from_deg


class GridWind:
    """Hourly wind on scattered grid points. `at()` interpolates u/v (never raw degrees):
    inverse-distance over the 4 nearest points, linear in time, clamped at the time edges."""

    def __init__(self, points, times, speed, direction, source, level=WIND_LEVEL):
        self.points = [tuple(p) for p in points]
        self.times = times                      # list of aware UTC datetimes, hourly
        self.speed = speed                      # speed[p][t], m/s
        self.direction = direction              # direction[p][t], deg wind comes FROM
        self.source = source                    # "open-meteo" | "sample"
        self.level = level
        self._uv = [[_to_uv(s or 0.0, d or 0.0) for s, d in zip(sp, dp)] for sp, dp in zip(speed, direction)]

    # ---- construction -------------------------------------------------------------------
    @classmethod
    def fetch(cls, bbox=BBOX, step=GRID_STEP_DEG, past_days=2, forecast_days=2, level=WIND_LEVEL):
        pts = grid_points(bbox, step)
        data = http_get_json(wind_url(pts, past_days, forecast_days, level), timeout=30)
        if isinstance(data, dict):              # a single point comes back as an object
            data = [data]
        if len(data) != len(pts):
            raise ValueError(f"expected {len(pts)} wind points, got {len(data)}")
        times = [parse_utc(t) for t in data[0]["hourly"]["time"]]
        speed, direction, points = [], [], []
        for req_pt, item in zip(pts, data):
            h = item["hourly"]
            sp, dr = h[f"wind_speed_{level}"], h[f"wind_direction_{level}"]
            if len(sp) != len(times) or all(v is None for v in sp):
                raise ValueError("wind series missing or misaligned")
            speed.append(sp)
            direction.append(dr)
            points.append((item["latitude"], item["longitude"]))  # model-grid coords (snapped)
        return cls(points, times, speed, direction, "open-meteo", level)

    @classmethod
    def from_dict(cls, d):
        return cls(d["points"], [parse_utc(t) for t in d["times"]], d["speed_ms"], d["from_deg"],
                   d.get("source", "sample"), d.get("level", WIND_LEVEL))

    @classmethod
    def from_mock(cls, path=MOCKS / "wind-grid.json", shift_days=0):
        g = cls.from_dict(load_json(path))
        g.times = [t + timedelta(days=shift_days) for t in g.times]
        g.source = "sample"
        return g

    @classmethod
    def load(cls, mock_shift_days=0, **kw):
        """Live grid, or the mock grid (shifted by whole days) if anything goes wrong."""
        try:
            return cls.fetch(**kw)
        except Exception as exc:  # noqa: BLE001 - any failure degrades to mocks
            print(f"[sources] wind fetch failed ({exc!r}); using mocks/wind-grid.json", file=sys.stderr)
            return cls.from_mock(shift_days=mock_shift_days)

    def to_dict(self):
        return {"source": self.source, "level": self.level, "points": [list(p) for p in self.points],
                "times": [iso_z(t) for t in self.times], "speed_ms": self.speed, "from_deg": self.direction}

    # ---- query --------------------------------------------------------------------------
    def _time_weights(self, t):
        t0 = self.times[0]
        x = (t - t0).total_seconds() / 3600.0
        if x <= 0:
            return 0, 0, 0.0
        last = len(self.times) - 1
        if x >= last:
            return last, last, 0.0
        i = int(x)
        return i, i + 1, x - i

    def at(self, lat, lon, t):
        """(speed m/s, from_deg) at a position and aware UTC time."""
        coslat = math.cos(math.radians(lat))
        nearest = sorted(((p[0] - lat) ** 2 + ((p[1] - lon) * coslat) ** 2, k) for k, p in enumerate(self.points))[:4]
        i, j, f = self._time_weights(t)
        if nearest[0][0] < 1e-10:               # exactly on a grid point
            nearest = nearest[:1]
        u = v = wsum = 0.0
        for dist2, k in nearest:
            w = 1.0 / max(dist2, 1e-10)
            u += w * (self._uv[k][i][0] * (1 - f) + self._uv[k][j][0] * f)
            v += w * (self._uv[k][i][1] * (1 - f) + self._uv[k][j][1] * f)
            wsum += w
        return _from_uv(u / wsum, v / wsum)


# ---- FIRMS ----------------------------------------------------------------------------------
def firms_area_url(key, source, bbox=BBOX, days=2):
    w, s, e, n = bbox
    return FIRMS_AREA.format(key=key, source=source, w=w, s=s, e=e, n=n, days=days)


def firms_public_url(source, days=2):
    period = {1: "24h", 2: "48h"}.get(days, "7d")
    return f"{FIRMS_PUBLIC_BASE}/{FIRMS_PUBLIC[source].format(period=period)}"


def parse_firms_csv(text, bbox=BBOX):
    """FIRMS CSV -> normalised fire dicts inside bbox. Raises if the expected columns are missing."""
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        return []
    need = {"latitude", "longitude", "acq_date", "acq_time", "frp", "confidence"}
    missing = need - set(rows[0])
    if missing:
        raise ValueError(f"FIRMS CSV missing columns {sorted(missing)}; got {list(rows[0])}")
    w, s, e, n = bbox
    out = []
    for r in rows:
        lat, lon = float(r["latitude"]), float(r["longitude"])
        if not (s <= lat <= n and w <= lon <= e):
            continue
        hhmm = r["acq_time"].zfill(4)
        out.append({
            "lat": lat, "lon": lon,
            "frp_mw": float(r["frp"] or 0.0),
            "acq_time": iso_z(parse_utc(f"{r['acq_date']}T{hhmm[:2]}:{hhmm[2:]}")),
            # VIIRS: 'low'/'nominal'/'high' (public files) or 'l'/'n'/'h'; MODIS: 0-100.
            "confidence": (r["confidence"] or "n").strip().lower()[:1],
            "satellite": r.get("satellite", ""),
            "daynight": r.get("daynight", ""),
        })
    return out


def dedupe_fires(fires):
    """The VIIRS satellites see the same field ~50 min apart: keep one per ~1 km cell per UTC day."""
    best = {}
    for f in fires:
        key = (round(f["lat"], 2), round(f["lon"], 2), f["acq_time"][:10])
        if key not in best or f["frp_mw"] > best[key]["frp_mw"]:
            best[key] = f
    return sorted(best.values(), key=lambda f: f["acq_time"])


def fetch_fires(bbox=BBOX, days=2, sources=FIRMS_SOURCES, key=None, mock_shift_days=0):
    """Returns (fires, label). Uses the area API if FIRMS_MAP_KEY is set, else the public
    regional CSVs, else mocks/fires.json. A source that fails is skipped; all failing -> mocks."""
    load_env()
    key = key or os.environ.get("FIRMS_MAP_KEY")
    attempts = []
    if key:
        attempts.append(("firms-area-api", [firms_area_url(key, s, bbox, days) for s in sources]))
    attempts.append(("firms-public-csv", [firms_public_url(s, days) for s in sources]))
    for label, urls in attempts:
        fires, ok = [], 0
        for url in urls:
            try:
                text = http_get(url, timeout=30)
                if not text.lstrip().startswith("latitude"):
                    raise ValueError(text[:120].strip())
                fires.extend(parse_firms_csv(text, bbox))
                ok += 1
            except Exception as exc:  # noqa: BLE001
                print(f"[sources] {label} failed for {url.split('/')[-3:]}: {exc!r}", file=sys.stderr)
        if ok:
            return dedupe_fires(fires), label
    print("[sources] all FIRMS sources failed; using mocks/fires.json")
    fires = load_json(MOCKS / "fires.json")["fires"]
    return [{**f, "acq_time": shift_iso(f["acq_time"], mock_shift_days)} for f in fires], "sample"


def _main():
    from data.util import utcnow
    lat, lon = 28.59, 77.05
    wind = GridWind.load()
    print(f"wind: source={wind.source} points={len(wind.points)} hours={len(wind.times)} "
          f"{iso_z(wind.times[0])} .. {iso_z(wind.times[-1])}")
    now = utcnow().replace(minute=0, second=0, microsecond=0)
    for dh in (0, -6, -12):
        t = now + timedelta(hours=dh)
        sp, fr = wind.at(lat, lon, t)
        print(f"  at school {iso_z(t)}: {sp:.2f} m/s from {fr:.0f} deg")
    fires, label = fetch_fires()
    print(f"fires: source={label} count={len(fires)} (bbox {BBOX}, deduped)")
    if fires:
        frps = sorted(f["frp_mw"] for f in fires)
        print(f"  FRP MW: median={frps[len(frps) // 2]:.1f} max={frps[-1]:.1f} total={sum(frps):.0f}")
    for f in fires[:2]:
        print("  sample", f)


if __name__ == "__main__":
    _main()
