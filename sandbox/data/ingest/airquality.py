"""Air at the school: Open-Meteo Air Quality (CAMS model) -> `forecast` contract.

Verified against the live API on 10 Oct 2026: hourly/current `pm2_5` is in ug/m3; times have NO
trailing Z even with timezone=GMT; `past_days=1` gives the trailing 24 h. Open-Meteo's `us_aqi`
can exceed 500 (we saw 580), so we don't use it; `aqi` here is the CPCB PM2.5 sub-index of the
model's trailing 24-h mean, computed from config breakpoints.

Optional WAQI nearest station (WAQI_TOKEN): `data.aqi` and `data.iaqi.pm25.v` are US-EPA AQI
sub-indices, NOT ug/m3; they go in `now.station` and are never shown as a concentration.

Any failure -> mocks/forecast.json (source="sample").
"""
import copy
import os
import sys
import urllib.parse
from datetime import timedelta

from data.util import (IST, MOCKS, http_get_json, iso_z, load_config, load_env, load_json, mock_shift_days,
                       parse_utc, shift_iso, utcnow)

OPEN_METEO_AQ = "https://air-quality-api.open-meteo.com/v1/air-quality"
WAQI_GEO = "https://api.waqi.info/feed/geo:{lat};{lon}/?token={token}"
AQI_BASIS = "CPCB PM2.5 sub-index of the CAMS model's trailing 24-h mean (indicative, not an official CPCB AQI)"


def aq_url(lat, lon):
    q = {"latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}", "hourly": "pm2_5", "current": "pm2_5",
         "timezone": "GMT", "past_days": 1, "forecast_days": 2}
    return OPEN_METEO_AQ + "?" + urllib.parse.urlencode(q, safe=",")


def waqi_url(lat, lon, token):
    return WAQI_GEO.format(lat=f"{lat:.4f}", lon=f"{lon:.4f}", token=urllib.parse.quote(token))


def band_for(pm25, bands_cfg=None):
    bands_cfg = bands_cfg or load_config("bands")
    for b in bands_cfg["bands"]:
        if b["max"] is None or pm25 <= b["max"]:
            return b["band"]
    return bands_cfg["bands"][-1]["band"]


def cpcb_pm25_aqi(pm25_24h, bands_cfg=None):
    bands_cfg = bands_cfg or load_config("bands")
    bps = bands_cfg["cpcb_pm25_aqi"]["breakpoints"]
    c = max(0.0, pm25_24h)
    for bp in bps:
        if c <= bp["c_hi"]:
            return int(round(bp["i_lo"] + (bp["i_hi"] - bp["i_lo"]) * (c - bp["c_lo"]) / (bp["c_hi"] - bp["c_lo"])))
    return bps[-1]["i_hi"]


def fetch_waqi_station(lat, lon, token):
    d = http_get_json(waqi_url(lat, lon, token), timeout=10)
    if d.get("status") != "ok":
        raise ValueError(f"WAQI status {d.get('status')}: {d.get('data')}")
    data = d["data"]
    aqi = data.get("aqi")
    pm = (data.get("iaqi") or {}).get("pm25", {}).get("v")
    return {"name": data.get("city", {}).get("name", "unknown"),
            "aqi_us": int(aqi) if isinstance(aqi, (int, float)) else None,
            "pm25_subindex_us": pm if isinstance(pm, (int, float)) else None,
            "time": data.get("time", {}).get("iso", ""), "source": "waqi"}


def _from_open_meteo(school, now):
    d = http_get_json(aq_url(school["lat"], school["lon"]))
    h = d["hourly"]
    series = [(parse_utc(t), v) for t, v in zip(h["time"], h["pm2_5"])]
    hour0 = now.replace(minute=0, second=0, microsecond=0)
    past = [v for t, v in series if hour0 - timedelta(hours=24) < t <= hour0 and v is not None]
    ahead = [(t, v) for t, v in series if t >= hour0 and v is not None][:24]
    if len(ahead) < 24 or len(past) < 18:
        raise ValueError(f"short series: {len(ahead)} ahead, {len(past)} past")
    cur = d.get("current") or {}
    pm_now = cur.get("pm2_5")
    if pm_now is None:
        pm_now = ahead[0][1]
    now_time = parse_utc(cur["time"]) if cur.get("time") else hour0
    mean24 = sum(past) / len(past)
    bands = load_config("bands")
    return {
        "school_id": school["school_id"], "lat": school["lat"], "lon": school["lon"],
        "generated_at": iso_z(now), "source": "open-meteo-cams",
        "now": {"time": iso_z(now_time), "pm25": round(pm_now, 1), "pm25_24h_mean": round(mean24, 1),
                "aqi": cpcb_pm25_aqi(mean24, bands), "aqi_basis": AQI_BASIS, "band": band_for(pm_now, bands)},
        "hours": [{"time": iso_z(t), "pm25": round(v, 1), "band": band_for(v, bands)} for t, v in ahead],
    }


def fetch_forecast(school, now=None, day=None):
    """`forecast` contract for a School. Never raises: falls back to mocks/forecast.json, with its
    timestamps shifted by whole days onto `day` (default: today IST) so the sample day lines up."""
    load_env()
    now = now or utcnow()
    try:
        out = _from_open_meteo(school, now)
    except Exception as exc:  # noqa: BLE001 - any failure degrades to mocks
        print(f"[airquality] Open-Meteo failed ({exc!r}); using mocks/forecast.json", file=sys.stderr)
        out = copy.deepcopy(load_json(MOCKS / "forecast.json"))
        shift = mock_shift_days(day or now.astimezone(IST).date())
        out.update(school_id=school["school_id"], lat=school["lat"], lon=school["lon"], source="sample",
                   generated_at=iso_z(now))
        out["now"]["time"] = shift_iso(out["now"]["time"], shift)
        for h in out["hours"]:
            h["time"] = shift_iso(h["time"], shift)
        return out
    token = os.environ.get("WAQI_TOKEN")
    if token:
        try:
            out["now"]["station"] = fetch_waqi_station(school["lat"], school["lon"], token)
        except Exception as exc:  # noqa: BLE001 - optional extra
            print(f"[airquality] WAQI skipped ({exc!r})", file=sys.stderr)
    return out


if __name__ == "__main__":
    import json
    school = load_json(sys.argv[1] if len(sys.argv) > 1 else MOCKS / "school.json")
    print(json.dumps(fetch_forecast(school), ensure_ascii=False, indent=2))
