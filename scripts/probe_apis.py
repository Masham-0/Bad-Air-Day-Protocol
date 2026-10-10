"""Call every external endpoint used by data/ingest/airquality.py and data/smoketrace/sources.py
once, for Delhi (28.59, 77.05). Prints HTTP status, top-level keys/columns and 2 sample records.
URLs come from the modules' own builders, so this probes exactly what the code calls.
Reads FIRMS_MAP_KEY and WAQI_TOKEN from .env; endpoints needing a missing key are skipped."""
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.ingest.airquality import aq_url, waqi_url  # noqa: E402
from data.smoketrace.sources import (FIRMS_SOURCES, firms_area_url, firms_public_url,  # noqa: E402
                                     grid_points, wind_url)
from data.util import USER_AGENT, load_env  # noqa: E402

LAT, LON = 28.59, 77.05


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return None, repr(e)


def redact(url):
    for k in ("FIRMS_MAP_KEY", "WAQI_TOKEN"):
        if os.environ.get(k):
            url = url.replace(os.environ[k], f"<{k}>")
    return url


def head(title, url):
    print(f"\n== {title}\n   {redact(url)[:160]}{'...' if len(url) > 160 else ''}")


def show_json_hourly(status, body, series_keys):
    print(f"   status {status}")
    if status != 200:
        print("   body", body[:200]); return
    d = json.loads(body)
    items = d if isinstance(d, list) else [d]
    print(f"   response type: {type(d).__name__}" + (f" of {len(d)} points" if isinstance(d, list) else ""))
    first = items[0]
    print("   top-level keys:", list(first))
    h = first.get("hourly", {})
    print("   hourly keys:", list(h), "| units:", first.get("hourly_units"))
    if "current" in first:
        print("   current:", first["current"])
    print("   time sample (note: no Z suffix?):", h.get("time", [])[:1])
    for i in range(2):
        print("   sample", {k: h[k][i] for k in ["time", *series_keys] if k in h})
    if len(items) > 1:
        print("   requested vs returned coords:", [(round(x["latitude"], 3), round(x["longitude"], 3)) for x in items[:3]])


def show_csv(status, body):
    print(f"   status {status}")
    if status != 200 or not body.lstrip().startswith("latitude"):
        print("   body", body[:200].strip()); return
    rows = list(csv.DictReader(io.StringIO(body)))
    print("   columns:", list(rows[0]) if rows else "(empty)", f"| rows (all South Asia/bbox): {len(rows)}")
    for r in rows[:2]:
        print("   sample", r)


def main():
    load_env()
    head("Open-Meteo Air Quality (airquality.aq_url)", aq_url(LAT, LON))
    show_json_hourly(*fetch(aq_url(LAT, LON)), ["pm2_5"])

    pts = grid_points()
    url = wind_url(pts)
    head(f"Open-Meteo wind grid, {len(pts)} points (sources.wind_url)", url)
    show_json_hourly(*fetch(url), ["wind_speed_120m", "wind_direction_120m"])

    for src in FIRMS_SOURCES:
        url = firms_public_url(src)
        head(f"FIRMS public CSV {src} (sources.firms_public_url)", url)
        show_csv(*fetch(url))

    key = os.environ.get("FIRMS_MAP_KEY")
    if key:
        for src in FIRMS_SOURCES:
            url = firms_area_url(key, src)
            head(f"FIRMS area API {src} (sources.firms_area_url)", url)
            show_csv(*fetch(url))
    else:
        print("\n== FIRMS area API: SKIPPED (no FIRMS_MAP_KEY in .env)")

    token = os.environ.get("WAQI_TOKEN")
    if token:
        url = waqi_url(LAT, LON, token)
        head("WAQI geo feed (airquality.waqi_url)", url)
        status, body = fetch(url)
        print(f"   status {status}")
        d = json.loads(body) if status == 200 else {}
        print("   top-level keys:", list(d), "| data keys:", list(d.get("data", {})) if isinstance(d.get("data"), dict) else d.get("data"))
        if isinstance(d.get("data"), dict):
            data = d["data"]
            print("   sample", {"aqi": data.get("aqi"), "city": data.get("city", {}).get("name"),
                              "iaqi.pm25": data.get("iaqi", {}).get("pm25"), "time": data.get("time")})
    else:
        print("\n== WAQI: SKIPPED (no WAQI_TOKEN in .env)")


if __name__ == "__main__":
    main()
