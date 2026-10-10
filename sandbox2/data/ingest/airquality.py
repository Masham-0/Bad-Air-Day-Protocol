"""Air at the school: Open-Meteo Air Quality (CAMS model) -> contracts/air_quality.schema.json
(AirQualityResponse: current reading + 24 hourly forecast points + metadata).

Verified against the live API on 10 Oct 2026: hourly/current `pm2_5` and `pm10` are in ug/m3, and
times have NO trailing Z even with timezone=GMT. Open-Meteo's own `us_aqi` can exceed 500, so we
compute the US-EPA AQI ourselves from PM2.5 with the breakpoints in data/config/bands.json. EPA
defines the AQI on a 24 h average; applying it to each hourly model value makes it indicative.

School input is the contract School: {id, name, latitude, longitude, district?, address?}.
The contract has no "sample" flag, so mock data says SAMPLE in `current.source`.
Any failure -> mocks/forecast.json, shifted onto the requested day.

WAQI (`waqi_url`) is kept for scripts/probe_apis.py only; the contract has no station field.
"""
import copy
import sys
import urllib.parse
import uuid
from datetime import timedelta

from data.util import (IST, MOCKS, http_get_json, iso_z, load_config, load_env, load_json, mock_shift_days,
                       parse_utc, shift_iso, utcnow)

OPEN_METEO_AQ = "https://air-quality-api.open-meteo.com/v1/air-quality"
WAQI_GEO = "https://api.waqi.info/feed/geo:{lat};{lon}/?token={token}"
LIVE_SOURCE = "CAMS forecast via Open-Meteo (model, not a sensor)"
CACHE_TTL_SECONDS = 3600  # ingest runs hourly


def aq_url(lat, lon):
    q = {"latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}", "hourly": "pm2_5,pm10", "current": "pm2_5,pm10",
         "timezone": "GMT", "forecast_days": 2}
    return OPEN_METEO_AQ + "?" + urllib.parse.urlencode(q, safe=",")


def waqi_url(lat, lon, token):
    return WAQI_GEO.format(lat=f"{lat:.4f}", lon=f"{lon:.4f}", token=urllib.parse.quote(token))


def epa_aqi(pm25, bands_cfg=None):
    """US-EPA AQI value and category for a PM2.5 concentration (ug/m3)."""
    bps = (bands_cfg or load_config("bands"))["us_epa_pm25_aqi"]["breakpoints"]
    c = int(max(0.0, pm25) * 10) / 10.0          # EPA truncates PM2.5 to 0.1
    for bp in bps:
        if c <= bp["c_hi"]:
            c_lo = min(bp["c_lo"], c)
            aqi = (bp["i_hi"] - bp["i_lo"]) / (bp["c_hi"] - bp["c_lo"]) * (c - c_lo) + bp["i_lo"]
            return int(round(aqi)), bp["category"]
    return 500, bps[-1]["category"]


def _metadata(now):
    return {"request_id": str(uuid.uuid4()), "generated_at": iso_z(now), "cache_ttl_seconds": CACHE_TTL_SECONDS}


def _from_open_meteo(school, now):
    d = http_get_json(aq_url(school["latitude"], school["longitude"]))
    h = d["hourly"]
    series = [(parse_utc(t), pm, p10) for t, pm, p10 in zip(h["time"], h["pm2_5"], h["pm10"])]
    hour0 = now.replace(minute=0, second=0, microsecond=0)
    ahead = [(t, pm) for t, pm, _ in series if t > hour0 and pm is not None][:24]
    if len(ahead) < 24:
        raise ValueError(f"short forecast: {len(ahead)} hours ahead")
    cur = d.get("current") or {}
    pm_now = cur.get("pm2_5")
    if pm_now is None:
        raise ValueError("no current pm2_5")
    bands = load_config("bands")
    aqi, cat = epa_aqi(pm_now, bands)
    current = {"aqi": aqi, "pm25": round(pm_now, 1), "category": cat, "source": LIVE_SOURCE,
               "recorded_at": iso_z(parse_utc(cur["time"]) if cur.get("time") else hour0)}
    if cur.get("pm10") is not None:
        current["pm10"] = round(cur["pm10"], 1)
    forecast = []
    for t, pm in ahead:
        a, c = epa_aqi(pm, bands)
        forecast.append({"hour": iso_z(t), "aqi": a, "pm25": round(pm, 1), "category": c})
    return {"current": current, "forecast": forecast, "metadata": _metadata(now)}


def fetch_forecast(school, now=None, day=None):
    """AirQualityResponse for a contract School. Never raises: falls back to mocks/forecast.json,
    with its timestamps shifted by whole days onto `day` (default: today IST)."""
    load_env()
    now = now or utcnow()
    try:
        return _from_open_meteo(school, now)
    except Exception as exc:  # noqa: BLE001 - any failure degrades to mocks
        print(f"[airquality] Open-Meteo failed ({exc!r}); using mocks/forecast.json", file=sys.stderr)
    out = copy.deepcopy(load_json(MOCKS / "forecast.json"))
    shift = mock_shift_days(day or now.astimezone(IST).date())
    out["current"]["recorded_at"] = shift_iso(out["current"]["recorded_at"], shift)
    for p in out["forecast"]:
        p["hour"] = shift_iso(p["hour"], shift)
    out["metadata"] = _metadata(now)
    return out


if __name__ == "__main__":
    import json
    school = load_json(sys.argv[1] if len(sys.argv) > 1 else MOCKS / "school.json")
    print(json.dumps(fetch_forecast(school), ensure_ascii=False, indent=2))
