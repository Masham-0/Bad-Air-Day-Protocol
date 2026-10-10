"""Prototype 2 API + dashboard, standard library only (Python 3.11+). Run from the repo root:

    python sandbox2/api/server.py                 # sample data, http://localhost:8000
    python sandbox2/api/server.py --live          # live Open-Meteo + FIRMS (each falls back to sample)
    python sandbox2/api/server.py --schedule      # also run the daily job at 06:00 IST
    python sandbox2/api/server.py --aws-sim       # DynamoDB + SNS on moto (needs boto3 + moto)

Yash's routes (contracts/, unchanged shapes; extra fields only where the schema allows them):
    GET  /schools                        SchoolListResponse
    GET  /schools/{id}/air-quality       AirQualityResponse
    GET  /schools/{id}/protocol          ProtocolResponse (generated on first request)
    GET  /schools/{id}/notices[?lang=]   ParentNoticeResponse (lang: en, hi or en,hi)
Proposed (dev api/README.md open questions):
    GET  /schools/{id}/smoke             {"now": trace, "afternoon": trace}           Q1
    POST /schools/{id}/protocol          regenerate now -> ProtocolResponse            Q2
    POST /schools/{id}/alerts            send the alert email now -> alert, 201        Q3
    GET  /schools/{id}/alerts            alerts sent, newest first                    Q3
    GET  /schools/{id}                   one School
    PUT  /schools/{id}                   upsert a School -> 200, or 201 if new          Q4
    GET  /schools/{id}/basis             the inputs the plan's citations point into   Q7
    POST /jobs/daily                     what EventBridge runs at 06:00 IST
    GET  /health
Static dashboard on GET / (sandbox2/web). Open CORS; every error is {"error": {"code", "message"}}.
"""
import argparse
import json
import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.service import ApiError, Service, start_scheduler  # noqa: E402
from api.store import MemoryStore  # noqa: E402
from data.util import iso_z, utcnow  # noqa: E402

WEB = ROOT / "web"
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS"}
SCHOOL = re.compile(r"^/schools/([A-Za-z0-9_-]+)(?:/([a-z-]+))?/?$")
SCHOOL_ROUTES = {
    (None, "GET"): lambda svc, sid, q, body: svc.school(sid),
    (None, "PUT"): lambda svc, sid, q, body: svc.put_school(sid, body),
    ("air-quality", "GET"): lambda svc, sid, q, body: svc.air_quality(sid),
    ("smoke", "GET"): lambda svc, sid, q, body: svc.smoke(sid),
    ("protocol", "GET"): lambda svc, sid, q, body: svc.protocol(sid),
    ("protocol", "POST"): lambda svc, sid, q, body: svc.protocol(sid, regenerate=True),
    ("notices", "GET"): lambda svc, sid, q, body: svc.notices(sid, q.get("lang", [None])[0]),
    ("basis", "GET"): lambda svc, sid, q, body: svc.basis(sid),
    ("alerts", "GET"): lambda svc, sid, q, body: svc.alerts(sid),
    ("alerts", "POST"): lambda svc, sid, q, body: (svc.send_alert(sid), True),
}


def route(svc, method, path, query, body):
    """(status, body) for an API request."""
    if path in ("/schools", "/schools/") and method == "GET":
        return 200, svc.schools()
    if path == "/health" and method == "GET":
        return 200, {"ok": True, "time": iso_z(utcnow()), "store": svc.store.kind, "sns": bool(svc.sns_topic)}
    if path == "/jobs/daily" and method == "POST":
        return 200, svc.daily_job()
    m = SCHOOL.match(path)
    if m:
        handler = SCHOOL_ROUTES.get((m.group(2), method))
        if handler:
            out = handler(svc, m.group(1), query, body)
            if isinstance(out, tuple):          # (doc, created)
                return (201 if out[1] else 200), out[0]
            return 200, out
        if any(k[0] == m.group(2) for k in SCHOOL_ROUTES):
            raise ApiError(405, "method_not_allowed", f"{method} not allowed on {path}")
    raise ApiError(404, "not_found", f"no route {method} {path}")


def make_handler(svc):
    class Handler(BaseHTTPRequestHandler):
        server_version = "BadAirProto2/1.0"

        def log_message(self, fmt, *args):
            sys.stderr.write(f"[http] {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}\n")

        def _send(self, status, body=None, ctype="application/json; charset=utf-8"):
            if body is None:
                data = b""
            elif isinstance(body, bytes):
                data = body
            else:
                data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            for k, v in CORS.items():
                self.send_header(k, v)
            if body is not None:
                self.send_header("content-type", ctype)
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _static(self, path):
            name = "index.html" if path in ("/", "") else path.lstrip("/")
            f = (WEB / name).resolve()
            if f.parent != WEB.resolve() or not f.is_file():
                return False
            ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
            self._send(200, f.read_bytes(), f"{ctype}; charset=utf-8" if ctype.startswith("text/") or ctype.endswith("javascript") else ctype)
            return True

        def _api(self):
            url = urlsplit(self.path)
            try:
                if self.command == "GET" and not url.path.startswith(("/schools", "/health")) and self._static(url.path):
                    return
                body = None
                length = int(self.headers.get("content-length") or 0)
                if length:
                    try:
                        body = json.loads(self.rfile.read(length))
                    except ValueError:
                        raise ApiError(400, "bad_request", "body is not valid JSON") from None
                self._send(*route(svc, self.command, url.path, parse_qs(url.query), body))
            except ApiError as e:
                self._send(e.status, {"error": {"code": e.code, "message": e.message}})
            except Exception as e:  # noqa: BLE001 - never leak a stack trace to the client
                print(f"[server] internal error on {self.command} {self.path}: {e!r}", file=sys.stderr)
                self._send(500, {"error": {"code": "internal", "message": "internal error"}})

        def do_OPTIONS(self):
            self._send(204)

        do_GET = do_POST = do_PUT = _api

        def do_DELETE(self):
            self._send(405, {"error": {"code": "method_not_allowed", "message": f"DELETE not allowed on {self.path}"}})

        do_PATCH = do_DELETE

    return Handler


def build_service(aws_sim=False):
    if aws_sim:
        from api.store import aws_sim as start_sim
        store, topic, _queue, _mock = start_sim()
        return Service(store, sns_topic=topic)
    return Service(MemoryStore())


def main():
    ap = argparse.ArgumentParser(description="Bad-Air Day Protocol, prototype 2: API + dashboard.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1", help="0.0.0.0 to reach it from a phone on your network")
    ap.add_argument("--live", action="store_true", help="live Open-Meteo + FIRMS instead of the sample day")
    ap.add_argument("--schedule", action="store_true", help="run the daily job at 06:00 IST (EventBridge stand-in)")
    ap.add_argument("--aws-sim", action="store_true", help="DynamoDB + SNS on moto instead of memory (needs boto3, moto)")
    args = ap.parse_args()
    if not args.live:
        os.environ["BADAIR_OFFLINE"] = "1"      # the data layer serves mocks/, shifted onto the planned day
    if args.aws_sim:
        os.environ.setdefault("AGENT_ENGINE", "rules")   # moto would intercept Bedrock too
    svc = build_service(args.aws_sim)
    if args.schedule:
        start_scheduler(svc)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(svc))
    print(f"prototype 2 on http://localhost:{args.port}  ({'live data' if args.live else 'sample data'}, "
          f"store: {svc.store.kind}{', SNS on moto' if svc.sns_topic else ''}{', daily job at 06:00 IST' if args.schedule else ''})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
