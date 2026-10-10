"""Regenerate synthetic mocks (all source="sample"). Deterministic: same output every run.

Scenario: Mon 12 Oct 2026, 07:00 IST, a Dwarka school. Amber morning, green late morning. Evening
stubble fires in Punjab/Haryana + a north-westerly 120 m wind: smoke unlikely now, likely by 14:00,
so PE (amber anyway) moves indoors. Traces are produced by the real
build_trace() on the synthetic wind + fires, so they always match the code.
"""
import json
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.protocol_agent import rules_protocol  # noqa: E402
from data.ingest.airquality import AQI_BASIS, band_for, cpcb_pm25_aqi  # noqa: E402
from data.smoketrace.sources import GridWind, grid_points  # noqa: E402
from data.smoketrace.today import IST, ist_today_at  # noqa: E402
from data.smoketrace.trace import build_trace  # noqa: E402
from data.util import MOCKS, iso_z, load_config  # noqa: E402

NOW = datetime(2026, 10, 12, 1, 30, tzinfo=timezone.utc)   # 07:00 IST
MOCK_FRP_THRESHOLD = 100

SCHOOL = {
    "school_id": "sample-dwarka",
    "name": "Sample Public School, Dwarka (demo)",
    "name_hi": "सैंपल पब्लिक स्कूल, द्वारका (डेमो)",
    "lat": 28.59, "lon": 77.05,
    "district": "South West Delhi", "state": "Delhi",
    "alert_emails": ["principal@example.com"],
    "schedule": [
        {"slot_id": "assembly", "label": "Morning assembly", "label_hi": "सुबह की प्रार्थना सभा",
         "start": "07:40", "end": "08:00", "outdoor": True},
        {"slot_id": "recess", "label": "Recess", "label_hi": "मध्यावकाश",
         "start": "10:40", "end": "11:10", "outdoor": True},
        {"slot_id": "pe", "label": "PE (Classes 6-8)", "label_hi": "खेलकूद (कक्षा 6-8)",
         "start": "14:00", "end": "14:40", "outdoor": True},
        {"slot_id": "dispersal", "label": "Dispersal", "label_hi": "छुट्टी",
         "start": "14:40", "end": "15:00", "outdoor": True},
    ],
}

# (district, n fires) - on and off the NW wind path.
FIRE_CLUSTERS = [("Kaithal", 20), ("Sangrur", 24), ("Patiala", 8), ("Jind", 6), ("Fatehabad", 4),
                 ("Karnal", 4), ("Amritsar", 6), ("Firozpur", 5), ("Bathinda", 4)]


# Synthetic PM2.5 by IST hour: amber morning, green late morning, smoke bump 13-17 IST, red night.
PROFILE_IST = [138, 135, 132, 128, 124, 122, 120, 112, 100, 80, 58, 50, 46, 48, 55, 62, 70, 80, 95, 110, 125, 135, 140, 142]
SMOKE_BUMP = 30


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
    past = [pm25_at(hour0 - timedelta(hours=k)) for k in range(24)]
    mean24 = sum(past) / len(past)
    pm_now = pm25_at(NOW)
    return {
        "school_id": SCHOOL["school_id"], "lat": SCHOOL["lat"], "lon": SCHOOL["lon"],
        "generated_at": iso_z(NOW), "source": "sample",
        "now": {"time": iso_z(hour0), "pm25": pm_now, "pm25_24h_mean": round(mean24, 1),
                "aqi": cpcb_pm25_aqi(mean24, bands), "aqi_basis": AQI_BASIS, "band": band_for(pm_now, bands)},
        "hours": [{"time": iso_z(t), "pm25": pm25_at(t), "band": band_for(pm25_at(t), bands)}
                  for t in (hour0 + timedelta(hours=k) for k in range(24))],
    }


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
    forecast = make_forecast()
    params = dict(frp_threshold_mw=MOCK_FRP_THRESHOLD, wind_source="sample", fire_source="sample", generated_at=NOW)
    smoke = {
        "now": build_trace(SCHOOL, wind, fires, NOW.replace(minute=0), "now", **params),
        "afternoon": build_trace(SCHOOL, wind, fires, ist_today_at("14:00", NOW), "forecast", **params),
    }
    write("school.json", SCHOOL)
    write("forecast.json", forecast)
    write("wind-grid.json", wind.to_dict())
    write("fires.json", {"source": "sample", "fires": fires})
    write("trace-now.json", smoke["now"])
    write("trace-afternoon.json", smoke["afternoon"])
    bundle = {"school": SCHOOL, "date": NOW.astimezone(IST).date().isoformat(), "generated_at": iso_z(NOW),
              "air": forecast, "smoke": smoke, "plan": None, "alerts": []}
    plan = rules_protocol(bundle, NOW, fallback_reason="mock")
    alert = {"school_id": SCHOOL["school_id"], "date": bundle["date"], "sent_at": iso_z(NOW), "channel": "sns-email",
             "trigger": "test", "subject": f"[SAMPLE] Bad-Air Day Protocol {bundle['date']}: PE (Classes 6-8), Dispersal indoors",
             "message_id": "00000000-0000-0000-0000-000000000000", "plan_generated_at": plan["generated_at"]}
    write("protocol.json", plan)
    write("alert.json", alert)
    write("today-bundle.json", {**bundle, "plan": plan, "alerts": [alert]})
    for k, tr in smoke.items():
        print(f"  {k}: smoke_likely={tr['smoke_likely']} fires={tr['fire_count']} frp={tr['frp_total_mw']}")
        print(f"    {tr['headline']['en']}")


if __name__ == "__main__":
    main()
