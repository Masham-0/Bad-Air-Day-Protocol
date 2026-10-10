"""Route smoke test for the API the web client calls. Standard library only.

    python api/tests/smoke_api.py                         # http://localhost:8000 (python api/mock_server.py)
    python api/tests/smoke_api.py https://abc.execute-api.us-east-1.amazonaws.com

Checks, each printed as PASS or FAIL with the HTTP status and time:
  - GET /schools, /schools/{id}/air-quality, /protocol, /notices return 200, carry the CORS header, and their
    bodies validate against contracts/*.schema.json
  - an unknown school returns 404 with the error envelope {"error": {"code", "message"}}
  - the CORS preflight the client triggers (it sends Content-Type on GET) is answered
Exits 1 on any FAIL. Schemas are checked with jsonschema when it's installed, otherwise with a small built-in
validator that covers every keyword the contracts use ($ref, type, required, enum, items, minimum, maximum).
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"
SLOW_MS = 29_000  # API Gateway hard limit
UNKNOWN_SCHOOL = "__smoke_test_unknown_school__"
TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}


# ---- schema validation ----------------------------------------------------------------------
def _mini_validate(node, schema, root, path="", errors=None):
    """Subset of JSON Schema draft-07, enough for contracts/ (stdlib fallback)."""
    errors = [] if errors is None else errors
    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/definitions/"):
            errors.append(f"{path or '/'}: unsupported $ref {ref}")
            return errors
        return _mini_validate(node, root["definitions"][ref.split("/")[-1]], root, path, errors)
    t = schema.get("type")
    if t:
        ok = (isinstance(node, (int, float)) and not isinstance(node, bool)) if t == "number" else \
             (isinstance(node, int) and not isinstance(node, bool)) if t == "integer" else isinstance(node, TYPES[t])
        if not ok:
            errors.append(f"{path or '/'}: expected {t}, got {type(node).__name__}")
            return errors
    if "enum" in schema and node not in schema["enum"]:
        errors.append(f"{path or '/'}: {node!r} not in {schema['enum']}")
    if isinstance(node, (int, float)) and not isinstance(node, bool):
        if "minimum" in schema and node < schema["minimum"]:
            errors.append(f"{path}: {node} < minimum {schema['minimum']}")
        if "maximum" in schema and node > schema["maximum"]:
            errors.append(f"{path}: {node} > maximum {schema['maximum']}")
    if isinstance(node, dict):
        for key in schema.get("required", []):
            if key not in node:
                errors.append(f"{path or '/'}: missing required '{key}'")
        for key, sub in schema.get("properties", {}).items():
            if key in node:
                _mini_validate(node[key], sub, root, f"{path}/{key}", errors)
    if isinstance(node, list) and "items" in schema:
        for i, item in enumerate(node):
            _mini_validate(item, schema["items"], root, f"{path}/{i}", errors)
    return errors


def make_validator():
    try:
        from jsonschema import Draft7Validator
    except ImportError:
        def validate(body, schema):
            return _mini_validate(body, schema, schema)
        return validate, "built-in validator (pip install jsonschema for full checks)"

    def validate(body, schema):
        return [f"/{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in Draft7Validator(schema).iter_errors(body)]
    return validate, "jsonschema"


def load_schema(name):
    return json.loads((CONTRACTS / name).read_text(encoding="utf-8"))


# ---- HTTP -----------------------------------------------------------------------------------
def request(base, path, method="GET", headers=None, timeout=30):
    """(status, headers, parsed body or None, elapsed ms, error text or None). Never raises."""
    req = urllib.request.Request(base + path, method=method,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    t0 = time.monotonic()
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        resp = e
    except Exception as e:  # noqa: BLE001 - connection refused, DNS, timeout...
        return None, {}, None, (time.monotonic() - t0) * 1000, f"{type(e).__name__}: {e}"
    raw = resp.read().decode("utf-8", "replace")
    ms = (time.monotonic() - t0) * 1000
    hdrs = {k.lower(): v for k, v in resp.headers.items()}
    try:
        body = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return resp.status, hdrs, None, ms, f"body is not JSON: {raw[:80]!r}"
    return resp.status, hdrs, body, ms, None


# ---- checks ---------------------------------------------------------------------------------
class Report:
    def __init__(self):
        self.rows = []

    def add(self, ok, label, status, ms, detail=""):
        self.rows.append(ok)
        slow = "  SLOW (>29 s)" if ms > SLOW_MS else ""
        print(f"{'PASS' if ok else 'FAIL'}  {label:<44} {status if status is not None else '---':>4}  {ms:7.0f} ms{slow}"
              + (f"\n      {detail}" if detail else ""))

    @property
    def failed(self):
        return self.rows.count(False)


def check_route(rep, base, path, schema_file, validate, timeout):
    status, hdrs, body, ms, err = request(base, path, timeout=timeout)
    problems = [err] if err else []
    if not err:
        if status != 200:
            problems.append(f"expected 200, got {status}")
        if hdrs.get("access-control-allow-origin") is None:
            problems.append("missing Access-Control-Allow-Origin header")
        if status == 200 and body is not None:
            problems += [f"contract {schema_file}: {e}" for e in validate(body, load_schema(schema_file))[:5]]
    rep.add(not problems and ms <= SLOW_MS, f"GET {path}", status, ms, "; ".join(problems))
    return body if not problems else None


def main():
    ap = argparse.ArgumentParser(description="Smoke-test the four API routes the web client calls.")
    ap.add_argument("base_url", nargs="?", default="http://localhost:8000")
    ap.add_argument("--school", help="school id to use (default: the first one GET /schools returns)")
    ap.add_argument("--timeout", type=float, default=30.0, help="seconds per request (default 30)")
    args = ap.parse_args()
    base = args.base_url.rstrip("/")
    validate, how = make_validator()
    print(f"Smoke test: {base}   (schemas: {how})\n")
    rep = Report()

    schools = check_route(rep, base, "/schools", "school.schema.json", validate, args.timeout)
    sid = args.school or ((schools or {}).get("schools") or [{}])[0].get("id")
    if not sid:
        rep.add(False, "pick a school id", None, 0, "GET /schools returned no school; pass --school ID")
    else:
        for resource, schema_file in (("air-quality", "air_quality.schema.json"), ("protocol", "protocol.schema.json"),
                                      ("notices", "parent_notice.schema.json")):
            check_route(rep, base, f"/schools/{sid}/{resource}", schema_file, validate, args.timeout)

    path = f"/schools/{UNKNOWN_SCHOOL}/air-quality"
    status, hdrs, body, ms, err = request(base, path, timeout=args.timeout)
    envelope = isinstance(body, dict) and isinstance(body.get("error"), dict) \
        and isinstance(body["error"].get("code"), str) and isinstance(body["error"].get("message"), str)
    problems = [err] if err else [p for p, bad in (
        (f"expected 404, got {status}", status != 404),
        (f"expected {{\"error\": {{\"code\", \"message\"}}}}, got {json.dumps(body)[:80]}", not envelope),
        ("missing Access-Control-Allow-Origin header", hdrs.get("access-control-allow-origin") is None)) if bad]
    rep.add(not problems, "GET unknown school -> 404 + error envelope", status, ms, "; ".join(problems))

    path = f"/schools/{sid or UNKNOWN_SCHOOL}/air-quality"
    status, hdrs, _, ms, err = request(base, path, "OPTIONS", timeout=args.timeout, headers={
        "Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type"})
    allow_headers = hdrs.get("access-control-allow-headers", "").lower()
    problems = [err] if err else [p for p, bad in (
        (f"expected 200 or 204, got {status}", status not in (200, 204)),
        ("missing Access-Control-Allow-Origin header", hdrs.get("access-control-allow-origin") is None),
        ("Access-Control-Allow-Headers doesn't allow content-type", "content-type" not in allow_headers and allow_headers != "*"),
    ) if bad]
    rep.add(not problems, "OPTIONS preflight (CORS, content-type)", status, ms, "; ".join(problems))

    print(f"\n{len(rep.rows) - rep.failed}/{len(rep.rows)} passed" + (f", {rep.failed} FAILED" if rep.failed else ""))
    sys.exit(1 if rep.failed else 0)


if __name__ == "__main__":
    main()
