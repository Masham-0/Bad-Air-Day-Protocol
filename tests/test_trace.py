"""Trajectory tests. Run: python tests/test_trace.py (no pytest needed; pytest also works)."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.smoketrace.sources import GridWind  # noqa: E402
from data.smoketrace.trace import bearing_deg, build_trace, destination, haversine_km  # noqa: E402

T = datetime(2026, 10, 12, 8, 30, tzinfo=timezone.utc)
SCHOOL = {"id": "t", "name": "Test school", "latitude": 28.59, "longitude": 77.05}


class ConstantWind:
    source, level = "sample", "120m"

    def __init__(self, speed, from_deg):
        self.speed, self.from_deg = speed, from_deg

    def at(self, lat, lon, t):
        return self.speed, self.from_deg


def test_back_trajectory_goes_upwind():
    """Wind FROM 315 deg at 5 m/s for 24 h -> parcel ~432 km to the north-west of school."""
    tr = build_trace(SCHOOL, ConstantWind(5.0, 315.0), [], T, hours_back=24)
    end = tr["path"][-1]
    dist = haversine_km(SCHOOL["latitude"], SCHOOL["longitude"], end["lat"], end["lon"])
    brg = bearing_deg(SCHOOL["latitude"], SCHOOL["longitude"], end["lat"], end["lon"])
    assert abs(dist - 432.0) < 5, dist
    assert abs(brg - 315.0) < 3, brg
    assert end["time"] == "2026-10-11T08:30:00Z"
    assert len(tr["path"]) == 25 and tr["indicative"] is True
    assert 310 < tr["upwind_from_deg"] < 320


def test_fire_matching_corridor_time_and_confidence():
    wind = ConstantWind(5.0, 315.0)
    on = destination(SCHOOL["latitude"], SCHOOL["longitude"], 315, 200)        # passed ~11.1 h before arrival
    off = destination(on[0], on[1], 45, 60)                            # 60 km off the path
    passed = T - timedelta(hours=200 / 18.0)

    def fire(p, frp=60.0, dt_h=-2, conf="n"):
        return {"lat": p[0], "lon": p[1], "frp_mw": frp, "confidence": conf,
                "acq_time": (passed + timedelta(hours=dt_h)).strftime("%Y-%m-%dT%H:%M:%SZ")}

    fires = [fire(on), fire(on, frp=55.0), fire(on, frp=50.0),          # match
             fire(off),                                                 # outside corridor
             fire(on, dt_h=+6),                                         # detected after parcel passed
             fire(on, dt_h=-30),                                        # too old
             fire(on, conf="l")]                                        # low confidence
    tr = build_trace(SCHOOL, wind, fires, T, "forecast", corridor_km=25, frp_threshold_mw=150, min_fires=3)
    assert tr["fire_count"] == 3, tr["matched_fires"]
    assert tr["frp_total_mw"] == 165.0 and tr["smoke_likely"] is True
    assert all(m["distance_km"] < 3 for m in tr["matched_fires"])   # rhumb vs great-circle ~1 km
    assert abs(tr["matched_fires"][0]["hours_before_arrival"] - 11.1) < 0.3
    # Same fires, higher threshold -> not likely.
    tr2 = build_trace(SCHOOL, wind, fires, T, frp_threshold_mw=200)
    assert tr2["smoke_likely"] is False


def test_districts_headline_and_gridwind():
    """Fires near Kaithal HQ group to Kaithal/Haryana; EN+HI headlines name it. GridWind interpolates u/v."""
    kaithal = (29.80, 76.40)
    wind = ConstantWind(4.0, bearing_deg(SCHOOL["latitude"], SCHOOL["longitude"], *kaithal))
    passed = T - timedelta(hours=haversine_km(SCHOOL["latitude"], SCHOOL["longitude"], *kaithal) / 14.4)
    acq = (passed - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    fires = [{"lat": kaithal[0] + d, "lon": kaithal[1] - d, "frp_mw": 40.0, "acq_time": acq, "confidence": "h"}
             for d in (0.0, 0.02, 0.04, 0.06)]
    tr = build_trace(SCHOOL, wind, fires, T, "forecast", frp_threshold_mw=150)
    assert tr["by_district"][0]["district"] == "Kaithal" and tr["by_district"][0]["state"] == "Haryana"
    assert tr["by_district"][0]["fire_count"] == 4 and tr["smoke_likely"] is True
    assert "Kaithal" in tr["headline"]["en"] and "14:00" in tr["headline"]["en"]
    assert "कैथल" in tr["headline"]["hi"] and "हरियाणा" in tr["headline"]["hi"]
    none = build_trace(SCHOOL, wind, [], T, "now")
    assert none["smoke_likely"] is False and "no detected farm fires" in none["headline"]["en"]
    # GridWind: between a wind FROM 350 and FROM 10 the interpolated direction is ~0, not 180.
    t0 = T.replace(minute=0)
    g = GridWind([(28.0, 77.0), (29.0, 77.0)], [t0, t0 + timedelta(hours=1)],
                 [[5.0, 5.0], [5.0, 5.0]], [[350.0, 350.0], [10.0, 10.0]], "sample")
    sp, fr = g.at(28.5, 77.0, t0 + timedelta(minutes=30))
    assert fr < 1 or fr > 359, fr
    assert 4.8 < sp <= 5.0, sp


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"{len(tests)} passed")
