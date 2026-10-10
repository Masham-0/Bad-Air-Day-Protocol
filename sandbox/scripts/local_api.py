"""Run the api Lambda locally behind a plain HTTP server, on a moto-simulated AWS stack.

    python scripts/local_api.py            # live data (falls back to mocks per source)
    python scripts/local_api.py --offline  # mocks only (the scripted "smoke by 14:00" sample day)

Seeds mocks/school.json, so GET http://localhost:8787/schools/sample-dwarka/today works at once.
Point the web app at it with NEXT_PUBLIC_API_URL=http://localhost:8787. State lives in memory.
"""
import argparse
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import local_stack  # noqa: E402

ROUTES = [("GET", r"^/schools/([a-z0-9-]+)/today$", "GET /schools/{id}/today"),
          ("POST", r"^/schools/([a-z0-9-]+)/protocol$", "POST /schools/{id}/protocol"),
          ("POST", r"^/schools/([a-z0-9-]+)/alert/test$", "POST /schools/{id}/alert/test"),
          ("PUT", r"^/schools/([a-z0-9-]+)$", "PUT /schools/{id}")]


class Handler(BaseHTTPRequestHandler):
    def _dispatch(self, method):
        import handlers
        path = self.path.split("?")[0].rstrip("/")
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length).decode("utf-8") if length else ""
        if method == "OPTIONS":
            event = {"routeKey": "OPTIONS /", "pathParameters": {}}
        else:
            event = None
            for m, rx, key in ROUTES:
                hit = re.match(rx, path)
                if m == method and hit:
                    event = {"routeKey": key, "pathParameters": {"id": hit.group(1)}, "body": body}
                    break
            event = event or {"routeKey": f"{method} {path}", "pathParameters": {}}
        resp = handlers.api_handler(event)
        data = resp["body"].encode("utf-8")
        self.send_response(resp["statusCode"])
        for k, v in resp["headers"].items():
            self.send_header(k, v)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_OPTIONS(self):
        self._dispatch("OPTIONS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="force mock data for every source")
    ap.add_argument("--port", type=int, default=8787)
    args = ap.parse_args()
    info = local_stack.start(offline=args.offline)
    import handlers
    school = json.loads((local_stack.ROOT / "mocks" / "school.json").read_text(encoding="utf-8"))
    handlers.put_school(school["school_id"], school)
    print(f"local API on http://localhost:{args.port}  (bedrock: {info['bedrock']}, offline: {args.offline})")
    print(f"try: curl -s http://localhost:{args.port}/schools/{school['school_id']}/today | head -c 400")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
