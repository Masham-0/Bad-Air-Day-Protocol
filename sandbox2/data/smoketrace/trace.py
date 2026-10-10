"""Indicative smoke trace: a single-level wind back-trajectory from the school, matched to
FIRMS farm-fire detections and grouped by (approximate) district. Pure Python, stdlib only.

This is NOT a dispersion model. It answers "which way has the air reaching school come from,
and were there farm fires along that path?" Every output is marked `indicative: true`.

`wind` is anything with `.at(lat, lon, t) -> (speed_ms, from_deg)` (GridWind, or a test stub).
`wind_from_deg` is meteorological (where the wind comes FROM), so stepping back in time moves the
parcel toward that bearing.
"""
import math
from datetime import timedelta

from data.util import iso_z, load_config, parse_utc, utcnow

EARTH_KM = 6371.0
METHOD = ("Indicative single-level (120 m) wind back-trajectory, midpoint integration; fires within "
          "corridor_km of the path, detected between 24 h before and 3 h after the parcel passed. "
          "Not a dispersion model.")

DIRS_EN = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]
DIRS_HI = ["उत्तर", "उत्तर-पूर्व", "पूर्व", "दक्षिण-पूर्व", "दक्षिण", "दक्षिण-पश्चिम", "पश्चिम", "उत्तर-पश्चिम"]


# ---- geometry -------------------------------------------------------------------------------
def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def bearing_deg(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def destination(lat, lon, bearing, dist_km):
    d, b = dist_km / EARTH_KM, math.radians(bearing)
    p1, l1 = math.radians(lat), math.radians(lon)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), (math.degrees(l2) + 540.0) % 360.0 - 180.0


def _point_segment(lat, lon, a, b):
    """Distance (km) from a point to segment a-b, plus the fraction along it. Local flat projection."""
    k = math.cos(math.radians(lat))
    ax, ay = (a[1] - lon) * k * 111.195, (a[0] - lat) * 111.195
    bx, by = (b[1] - lon) * k * 111.195, (b[0] - lat) * 111.195
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    f = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg2))
    return math.hypot(ax + f * dx, ay + f * dy), f


def compass(deg):
    i = int(((deg % 360) + 22.5) // 45) % 8
    return DIRS_EN[i], DIRS_HI[i]


# ---- trajectory -----------------------------------------------------------------------------
def back_trajectory(wind, lat, lon, target_time, hours_back=24, step_minutes=15):
    """Fine path [(t, lat, lon, speed, from_deg)] from target_time backwards (index 0 = school)."""
    dt_s = step_minutes * 60.0
    n = int(round(hours_back * 60 / step_minutes))
    t = target_time
    sp, fr = wind.at(lat, lon, t)
    path = [(t, lat, lon, sp, fr)]
    for _ in range(n):
        # Midpoint (RK2): half step back, re-sample wind there, then full step with that wind.
        mlat, mlon = destination(lat, lon, fr, sp * dt_s / 2000.0)
        msp, mfr = wind.at(mlat, mlon, t - timedelta(seconds=dt_s / 2))
        lat, lon = destination(lat, lon, mfr, msp * dt_s / 1000.0)
        t = t - timedelta(seconds=dt_s)
        sp, fr = wind.at(lat, lon, t)
        path.append((t, lat, lon, sp, fr))
    return path


def nearest_district(lat, lon, districts_cfg):
    best, best_d = None, float("inf")
    for d in districts_cfg["districts"]:
        dist = haversine_km(lat, lon, d["lat"], d["lon"])
        if dist < best_d:
            best, best_d = d, dist
    if best is None or best_d > districts_cfg.get("max_assign_km", 60):
        return {"district": "Other", "district_hi": "अन्य", "state": "Other", "state_hi": "अन्य"}
    return {"district": best["district"], "district_hi": best["district_hi"], "state": best["state"],
            "state_hi": districts_cfg["states_hi"].get(best["state"], best["state"])}


def match_fires(path, fires, corridor_km=25, before_h=24, after_h=3):
    """Fires near the path whose detection time fits when the parcel passed them."""
    matched = []
    for f in fires:
        if f.get("confidence", "n") == "l":
            continue
        best = None
        for i in range(len(path) - 1):
            a, b = path[i], path[i + 1]
            # Quick reject: both ends far away.
            if abs(a[1] - f["lat"]) > 1.5 and abs(b[1] - f["lat"]) > 1.5:
                continue
            dist, frac = _point_segment(f["lat"], f["lon"], (a[1], a[2]), (b[1], b[2]))
            if best is None or dist < best[0]:
                best = (dist, a[0] + (b[0] - a[0]) * frac)
        if best is None or best[0] > corridor_km:
            continue
        passed = best[1]
        acq = parse_utc(f["acq_time"])
        if not (passed - timedelta(hours=before_h) <= acq <= passed + timedelta(hours=after_h)):
            continue
        matched.append({
            "lat": round(f["lat"], 4), "lon": round(f["lon"], 4),
            "frp_mw": round(float(f["frp_mw"]), 2), "acq_time": iso_z(acq),
            "satellite": f.get("satellite", ""),
            "distance_km": round(best[0], 1),
            "hours_before_arrival": round((path[0][0] - passed).total_seconds() / 3600.0, 1),
        })
    return matched


def group_by_district(matched, districts_cfg):
    groups = {}
    for m in matched:
        d = nearest_district(m["lat"], m["lon"], districts_cfg)
        m["district"], m["state"] = d["district"], d["state"]
        g = groups.setdefault((d["district"], d["state"]), {**d, "fire_count": 0, "frp_total_mw": 0.0})
        g["fire_count"] += 1
        g["frp_total_mw"] += m["frp_mw"]
    out = sorted(groups.values(), key=lambda g: (-g["fire_count"], -g["frp_total_mw"]))
    for g in out:
        g["frp_total_mw"] = round(g["frp_total_mw"], 1)
    return out


# ---- headline -------------------------------------------------------------------------------
def _join(items, conj):
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + f" {conj} " + items[-1]


def _places(by_district, lang):
    top = [g for g in by_district if g["district"] != "Other"][:3] or by_district[:1]
    key, skey, conj = ("district", "state", "and") if lang == "en" else ("district_hi", "state_hi", "और")
    states = []
    for g in top:
        if g[skey] not in states:
            states.append(g[skey])
    if len(states) == 1:
        return f"{_join([g[key] for g in top], conj)} ({states[0]})"
    return _join([f"{g[key]} ({g[skey]})" for g in top], conj)


def make_headline(kind, smoke_likely, fire_count, by_district, upwind_from_deg):
    dir_en, dir_hi = compass(upwind_from_deg)
    when_en, when_hi = ("now", "अभी") if kind == "now" else ("by 14:00", "दोपहर 2 बजे तक")
    if smoke_likely:
        if kind == "now":
            en = (f"Smoke likely now: the air reaching school passed over {fire_count} farm fires "
                  f"in the last 24 h, mostly in {_places(by_district, 'en')}.")
            hi = (f"अभी धुएँ की संभावना: स्कूल तक पहुँच रही हवा पिछले 24 घंटों में {fire_count} खेतों की आग "
                  f"के ऊपर से गुज़री है, ज़्यादातर {_places(by_district, 'hi')} में।")
        else:
            en = (f"Smoke likely by 14:00: the air reaching school then will have passed over {fire_count} "
                  f"farm fires, mostly in {_places(by_district, 'en')}.")
            hi = (f"दोपहर 2 बजे तक धुएँ की संभावना: तब स्कूल पहुँचने वाली हवा {fire_count} खेतों की आग के "
                  f"ऊपर से गुज़री होगी, ज़्यादातर {_places(by_district, 'hi')} में।")
        return {"en": en, "hi": hi}
    if fire_count == 0:
        en = f"Smoke unlikely {when_en}: the wind is from the {dir_en} and passed no detected farm fires."
        hi = f"{when_hi} धुएँ की संभावना कम: हवा {dir_hi} से आ रही है और रास्ते में खेतों की कोई आग नहीं दिखी।"
    else:
        s = "" if fire_count == 1 else "s"
        en = (f"Smoke unlikely {when_en}: the wind is from the {dir_en} and passed {fire_count} farm fire{s}, "
              f"too few for a strong smoke signal; local sources likely dominate.")
        hi = (f"{when_hi} धुएँ की संभावना कम: हवा {dir_hi} से आ रही है और रास्ते में {fire_count} खेतों की आग मिली, "
              f"जो धुएँ के बड़े असर के लिए कम है; प्रदूषण मुख्यतः स्थानीय होने की संभावना है।")
    return {"en": en, "hi": hi}


# ---- public entry point ---------------------------------------------------------------------
def build_trace(school, wind, fires, target_time, kind="now", *, hours_back=24, step_minutes=15,
                corridor_km=25, frp_threshold_mw=150, min_fires=3, wind_source=None, fire_source=None,
                districts_cfg=None, generated_at=None):
    """Return a `trace` contract dict. frp_threshold_mw is the TOTAL FRP of matched fires needed
    (alongside min_fires) for smoke_likely; single VIIRS farm fires are typically 1-20 MW."""
    if isinstance(target_time, str):
        target_time = parse_utc(target_time)
    districts_cfg = districts_cfg or load_config("districts")
    wind_source = wind_source or getattr(wind, "source", "sample")
    fire_source = fire_source or "sample"

    fine = back_trajectory(wind, school["latitude"], school["longitude"], target_time, hours_back, step_minutes)
    matched = match_fires(fine, fires, corridor_km)
    by_district = group_by_district(matched, districts_cfg)
    frp_total = round(sum(m["frp_mw"] for m in matched), 1)
    smoke_likely = len(matched) >= min_fires and frp_total >= frp_threshold_mw

    per_hour = max(1, int(round(60 / step_minutes)))
    six_h = fine[min(len(fine) - 1, 6 * per_hour)]
    upwind = bearing_deg(school["latitude"], school["longitude"], six_h[1], six_h[2])

    return {
        "school_id": school["id"],
        "kind": kind,
        "target_time": iso_z(target_time),
        "generated_at": iso_z(generated_at or utcnow()),
        "source": "live" if wind_source != "sample" and fire_source != "sample" else "sample",
        "inputs": {"wind": wind_source, "fires": fire_source},
        "indicative": True,
        "method": METHOD,
        "params": {"hours_back": hours_back, "step_minutes": step_minutes, "corridor_km": corridor_km,
                   "frp_threshold_mw": frp_threshold_mw, "min_fires": min_fires,
                   "wind_level": getattr(wind, "level", "120m")},
        "origin": {"lat": school["latitude"], "lon": school["longitude"]},
        "path": [{"time": iso_z(p[0]), "lat": round(p[1], 4), "lon": round(p[2], 4),
                  "wind_speed_ms": round(p[3], 2), "wind_from_deg": round(p[4], 1)}
                 for p in fine[::per_hour]],
        "upwind_from_deg": round(upwind, 1),
        "matched_fires": sorted(matched, key=lambda m: m["hours_before_arrival"]),
        "by_district": by_district,
        "fire_count": len(matched),
        "frp_total_mw": frp_total,
        "smoke_likely": smoke_likely,
        "headline": make_headline(kind, smoke_likely, len(matched), by_district, upwind),
    }
