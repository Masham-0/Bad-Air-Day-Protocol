"""Local mock API: the four routes the web client calls, standard library only.

    python api/mock_server.py              # sample data (default), http://localhost:8000
    python api/mock_server.py --live       # air quality from live Open-Meteo (falls back to the sample)
    python api/mock_server.py --port 8001  # another port

Routes (see api/README.md for shapes; all in contracts/):
    GET /schools                     contracts/examples/sample_schools.json
    GET /schools/{id}/air-quality    data layer: mocks/forecast.json shifted onto today, or live with --live
    GET /schools/{id}/protocol       contracts/examples/sample_protocol.json for that school, dated today
    GET /schools/{id}/notices        contracts/examples/sample_notices.json for that school, dated today
Open CORS, OPTIONS preflight -> 204, and every error as {"error": {"code", "message"}}.
"""
import argparse
import copy
import json
import os
import re
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from data.ingest.airquality import CACHE_TTL_SECONDS, fetch_forecast  # noqa: E402
from data.util import IST, iso_z, shift_iso, utcnow  # noqa: E402

EXAMPLES = ROOT / "contracts" / "examples"
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "GET, OPTIONS"}
ROUTE = re.compile(r"^/schools(?:/([^/]+)/(air-quality|protocol|notices))?/?$")
ISO_TS = re.compile(r"^\d{4}-\d{2}-\d{2}T")


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def load_example(name):
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def schools():
    return load_example("sample_schools.json")


def find_school(school_id):
    for s in schools()["schools"]:
        if s["id"] == school_id:
            return s
    raise ApiError(404, "not_found", f"unknown school {school_id}")


def _onto_today(doc, school_id):
    """Give an example document this school's id and move its dates onto today (IST)."""
    doc = copy.deepcopy(doc)
    today = utcnow().astimezone(IST).date()
    shift = (today - datetime.strptime(doc["date"], "%Y-%m-%d").date()).days

    def walk(node):
        if isinstance(node, dict):
            return {k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        if isinstance(node, str) and ISO_TS.match(node):
            return shift_iso(node, shift)
        return node

    doc = walk(doc)
    doc["school_id"], doc["date"] = school_id, today.isoformat()
    return doc


class AirQuality:
    """Air-quality responses per school (the shifted sample, or live data), cached for CACHE_TTL_SECONDS."""

    def __init__(self, live):
        self.live, self._cache, self._lock = live, {}, threading.Lock()

    def get(self, school):
        with self._lock:
            hit = self._cache.get(school["id"])
            if hit and time.time() - hit[0] < CACHE_TTL_SECONDS:
                return hit[1]
        out = fetch_forecast(school)
        with self._lock:
            self._cache[school["id"]] = (time.time(), out)
        return out


def route(path, air):
    m = ROUTE.match(path)
    if not m:
        raise ApiError(404, "not_found", f"no route {path}")
    school_id, resource = m.groups()
    if school_id is None:
        return schools()
    school = find_school(school_id)
    if resource == "air-quality":
        return air.get(school)
    if resource == "protocol":
        plan = _onto_today(load_example("sample_protocol.json"), school_id)
        for a in plan["activities"]:
            if a.get("alternative") is None:      # the example has null, but the schema only allows a string
                a.pop("alternative", None)
        return plan
    return _onto_today(load_example("sample_notices.json"), school_id)


def make_handler(air):
    class Handler(BaseHTTPRequestHandler):
        server_version = "BadAirMock/1.0"

        def _send(self, status, body=None):
            data = b"" if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            for k, v in CORS.items():
                self.send_header(k, v)
            if body is not None:
                self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            self._send(204)

        def do_GET(self):
            try:
                self._send(200, route(self.path.split("?")[0], air))
            except ApiError as e:
                self._send(e.status, {"error": {"code": e.code, "message": e.message}})
            except Exception as e:  # noqa: BLE001 - never leak a stack trace to the client
                print(f"[mock_server] internal error on {self.path}: {e!r}", file=sys.stderr)
                self._send(500, {"error": {"code": "internal", "message": "internal error"}})

        def _no_route(self):
            self._send(404, {"error": {"code": "not_found", "message": f"no route {self.command} {self.path}"}})

        do_POST = do_PUT = do_DELETE = do_PATCH = _no_route

    return Handler


def main():
    ap = argparse.ArgumentParser(description="Local mock of the four API routes the web client calls.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1", help="0.0.0.0 to reach it from other devices on your network")
    ap.add_argument("--live", action="store_true", help="air quality from live Open-Meteo instead of the sample day")
    args = ap.parse_args()
    if not args.live:
        os.environ["BADAIR_OFFLINE"] = "1"   # the data layer then serves mocks/forecast.json, shifted onto today
    server = ThreadingHTTPServer((args.host, args.port), make_handler(AirQuality(args.live)))
    print(f"mock API on http://localhost:{args.port}  ({'live air quality' if args.live else 'sample data'}; started {iso_z(utcnow())})")
    print(f"try: curl -s http://localhost:{args.port}/schools")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
