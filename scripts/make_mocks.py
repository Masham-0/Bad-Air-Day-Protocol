"""Regenerate the synthetic sample data in mocks/ (deterministic: same output every run).

Scenario: Mon 12 Oct 2026, 07:00 IST, Kendriya Vidyalaya Dwarka (sch_dwarka_02 from
contracts/examples/sample_schools.json). Amber-ish morning, cleaner late morning, evening stubble
fires in Punjab/Haryana + a north-westerly 120 m wind: smoke unlikely now, likely by 14:00.

Writes contract-shaped school.json and forecast.json (contracts/school.schema.json School,
contracts/air_quality.schema.json), the data layer's internal wind-grid.json and fires.json, and
trace-now.json / trace-afternoon.json produced by the real build_trace().
"""
import json
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.ingest.airquality import CACHE_TTL_SECONDS, epa_aqi  # noqa: E402
from data.smoketrace.sources import GridWind, grid_points  # noqa: E402
from data.smoketrace.trace import build_trace  # noqa: E402
from data.util import IST, MOCKS, iso_z, ist_today_at, load_config  # noqa: E402

NOW = datetime(2026, 10, 12, 1, 30, tzinfo=timezone.utc)   # 07:00 IST
MOCK_FRP_THRESHOLD = 100
SAMPLE_SOURCE = "SAMPLE: scripted demo day (not real readings)"

SCHOOL = {"id": "sch_dwarka_02", "name": "Kendriya Vidyalaya, Dwarka",
          "address": "Sector 8, Dwarka, New Delhi 110077",
          "latitude": 28.5823, "longitude": 77.0500, "district": "South West Delhi"}

# Synthetic PM2.5 by IST hour: high morning, cleaner late morning, smoke bump 13-17 IST, high night.
PROFILE_IST = [138, 135, 132, 128, 124, 122, 120, 112, 100, 80, 58, 50, 46, 48, 55, 62, 70, 80, 95, 110, 125, 135, 140, 142]
SMOKE_BUMP = 30
FIRE_CLUSTERS = [("Kaithal", 20), ("Sangrur", 24), ("Patiala", 8), ("Jind", 6), ("Fatehabad", 4),
                 ("Karnal", 4), ("Amritsar", 6), ("Firozpur", 5), ("Bathinda", 4)]


def pm25_at(t):
    h = t.astimezone(IST).hour + t.astimezone(IST).minute / 60
    i = int(h) % 24
    v = PROFILE_IST[i] + (PROFILE_IST[(i + 1) % 24] - PROFILE_IST[i]) * (h - int(h))
    if 13 <= h < 17:
        v += SMOKE_BUMP
    return round(v, 1)


def make_forecast():
    bands = load_config("bands")
    hour0 = NOW.replace(minute=0)
    pm_now = pm25_at(hour0)
    aqi, cat = epa_aqi(pm_now, bands)
    forecast = []
    for k in range(1, 25):
        t = hour0 + timedelta(hours=k)
        a, c = epa_aqi(pm25_at(t), bands)
        forecast.append({"hour": iso_z(t), "aqi": a, "pm25": pm25_at(t), "category": c})
    return {"current": {"aqi": aqi, "pm25": pm_now, "pm10": round(pm_now * 1.7, 1), "category": cat,
                        "source": SAMPLE_SOURCE, "recorded_at": iso_z(hour0)},
            "forecast": forecast,
            "metadata": {"request_id": "00000000-0000-4000-8000-000000000000", "generated_at": iso_z(NOW),
                         "cache_ttl_seconds": CACHE_TTL_SECONDS}}


def make_wind():
    pts = grid_points()
    t0 = datetime(2026, 10, 10, tzinfo=timezone.utc)
    times = [t0 + timedelta(hours=k) for k in range(96)]
    speed, direction = [], []
    for lat, lon in pts:
        sp, dr = [], []
        for t in times:
            h = t.astimezone(IST).hour
            sp.append(round(4.2 + 1.6 * math.sin(2 * math.pi * (h - 9) / 24) + 0.2 * (lat - 29), 2))
            dr.append(round((328 + 3 * (lat - 29) - 2 * (lon - 76) + 4 * math.sin(2 * math.pi * h / 24)) % 360, 1))
        speed.append(sp)
        direction.append(dr)
    return GridWind(pts, times, speed, direction, "sample")


def make_fires():
    rng = random.Random(42)
    hq = {d["district"]: d for d in load_config("districts")["districts"]}
    # Mostly evening burning seen by the ~20:25Z night pass: after the "now" parcel crossed Haryana but
    # before the 14:00 parcel does, so smoke is unlikely now and likely by 14:00.
    passes = ["2026-10-11T20:25:00Z"] * 7 + ["2026-10-11T07:55:00Z", "2026-10-10T08:15:00Z", "2026-10-10T20:30:00Z"]
    fires = []
    for name, n in FIRE_CLUSTERS:
        d = hq[name]
        for _ in range(n):
            fires.append({
                "lat": round(d["lat"] + rng.uniform(-0.12, 0.12), 4),
                "lon": round(d["lon"] + rng.uniform(-0.12, 0.12), 4),
                "frp_mw": round(min(40.0, rng.lognormvariate(1.8, 0.6)), 2),
                "acq_time": rng.choice(passes),
                "confidence": rng.choice(["n", "n", "n", "h", "l"]),
                "satellite": rng.choice(["N", "N20", "N21"]),
                "daynight": "D",
            })
    return sorted(fires, key=lambda f: f["acq_time"])


def write(name, obj):
    (MOCKS / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", f"mocks/{name}")


def main():
    MOCKS.mkdir(exist_ok=True)
    wind, fires = make_wind(), make_fires()
    params = dict(frp_threshold_mw=MOCK_FRP_THRESHOLD, wind_source="sample", fire_source="sample", generated_at=NOW)
    smoke = {"now": build_trace(SCHOOL, wind, fires, NOW.replace(minute=0), "now", **params),
             "afternoon": build_trace(SCHOOL, wind, fires, ist_today_at("14:00", NOW), "forecast", **params)}
    write("school.json", SCHOOL)
    write("forecast.json", make_forecast())
    write("wind-grid.json", wind.to_dict())
    write("fires.json", {"source": "sample", "fires": fires})
    write("trace-now.json", smoke["now"])
    write("trace-afternoon.json", smoke["afternoon"])
    for k, tr in smoke.items():
        print(f"  {k}: smoke_likely={tr['smoke_likely']} fires={tr['fire_count']} frp={tr['frp_total_mw']}")


if __name__ == "__main__":
    main()
