"""Serve the real Lambda handlers on http://localhost:8000, so the web app and api/tests/smoke_api.py can hit
the deployable code before (or without) an AWS deploy. Each request becomes an API Gateway HTTP API event.

    python scripts/local_backend.py            # sample data, memory store, rules plans
    python scripts/local_backend.py --live     # live Open-Meteo + FIRMS (each falls back to the sample)
"""
import argparse
import importlib
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "agent" / "src")]

# Same wiring as infra/template.yaml: (method, last path part) -> handler module.
MODULES = {("GET", "air-quality"): "api.handlers.get_forecast", ("GET", "smoke"): "api.handlers.get_forecast",
           ("GET", "protocol"): "api.handlers.get_protocol", ("GET", "notices"): "api.handlers.get_protocol",
           ("GET", "basis"): "api.handlers.get_protocol", ("GET", "dashboard"): "api.handlers.get_dashboard",
           ("POST", "protocol"): "api.handlers.generate_protocol",
           ("GET", "alerts"): "data.alerts.handler", ("POST", "alerts"): "data.alerts.handler"}
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS"}


def module_for(method, path):
    parts = path.strip("/").split("/")
    if len(parts) == 3:
        return MODULES.get((method, parts[2]), "api.handlers.get_school")
    return "api.handlers.get_school"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write(f"[http] {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}\n")

    def _send(self, status, body=b""):
        self.send_response(status)
        for k, v in CORS.items():
            self.send_header(k, v)
        if body:
            self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _lambda(self):
        url = urlsplit(self.path)
        length = int(self.headers.get("content-length") or 0)
        event = {"version": "2.0", "rawPath": url.path, "rawQueryString": url.query,
                 "requestContext": {"http": {"method": self.command}, "stage": "$default"},
                 "body": self.rfile.read(length).decode("utf-8") if length else None, "isBase64Encoded": False}
        out = importlib.import_module(module_for(self.command, url.path)).handler(event, None)
        self._send(out["statusCode"], out["body"].encode("utf-8"))

    do_GET = do_POST = do_PUT = _lambda

    def do_OPTIONS(self):
        self._send(204)


def main():
    ap = argparse.ArgumentParser(description="Run the Lambda handlers locally on one HTTP port.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--live", action="store_true", help="live Open-Meteo + FIRMS instead of the sample day")
    args = ap.parse_args()
    if not args.live:
        os.environ["BADAIR_OFFLINE"] = "1"
    os.environ.setdefault("AGENT_ENGINE", "rules")
    print(f"Lambda handlers on http://localhost:{args.port} ({'live' if args.live else 'sample'} data, memory store)")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
