"""End to end over real HTTP: start sandbox2/api/server.py on a free port and walk the core loop the way
the dashboard does. Prints PASS/FAIL per step with timings; exits 1 on any failure.

    python sandbox2/tests/e2e.py                 # sample data, memory store
    python sandbox2/tests/e2e.py --live          # live Open-Meteo + FIRMS (each falls back to sample)
    python sandbox2/tests/e2e.py --aws-sim       # DynamoDB + SNS on moto (needs boto3 + moto)
    python sandbox2/tests/e2e.py --url http://localhost:8000   # test a server that is already running
"""
import argparse
import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHOOL = "sch_dwarka_02"
results = []
INFO_ONLY = set()     # steps reported but not counted (the demo story on live data depends on the weather)


def http(base, method, path, body=None, timeout=60):
    """(status, parsed JSON or text, ms)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"content-type": "application/json"} if data else {})
    t = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, raw, ctype = r.status, r.read(), r.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        status, raw, ctype = e.code, e.read(), e.headers.get("content-type", "")
    ms = (time.monotonic() - t) * 1000
    text = raw.decode("utf-8")
    return status, (json.loads(text) if "json" in ctype and text else text), ms


def step(name, fn):
    """Run one check; fn returns (ok, status, ms, detail)."""
    try:
        ok, status, ms, detail = fn()
    except Exception as e:  # noqa: BLE001 - report it as a failed step and keep going
        ok, status, ms, detail = False, "-", 0, repr(e)[:160]
    info = name in INFO_ONLY
    if not info:
        results.append(ok)
    print(f"{('NOTE' if info else 'PASS') if ok or info else 'FAIL'}  {name:<46} {status!s:>4} {ms:>8.0f} ms  {detail}")
    return ok


def run(base):
    s = {}

    def health():
        st, b, ms = http(base, "GET", "/health")
        return st == 200 and b.get("ok") is True, st, ms, f"store={b.get('store')} sns={b.get('sns')}"

    def dashboard():
        st, html, ms = http(base, "GET", "/")
        st2, js, _ = http(base, "GET", "/app.js")
        ok = st == 200 and 'id="plan"' in html and st2 == 200 and "followCitation" in js
        return ok, st, ms, "index.html + app.js served"

    def schools():
        st, b, ms = http(base, "GET", "/schools")
        ids = [x["id"] for x in b["schools"]]
        s["ids"] = ids
        return st == 200 and SCHOOL in ids, st, ms, f"{len(ids)} schools"

    def air():
        st, b, ms = http(base, "GET", f"/schools/{SCHOOL}/air-quality")
        c = b["current"]
        return st == 200 and len(b["forecast"]) == 24, st, ms, f"AQI {c['aqi']} {c['category']}, {c['source'][:40]}"

    def smoke():
        st, b, ms = http(base, "GET", f"/schools/{SCHOOL}/smoke")
        a = b["afternoon"]
        s["smoke_likely"] = a["smoke_likely"]
        return st == 200 and a["indicative"] is True, st, ms, f"14:00 smoke_likely={a['smoke_likely']}, {a['fire_count']} fires, {a['frp_total_mw']} MW"

    def protocol():
        st, b, ms = http(base, "GET", f"/schools/{SCHOOL}/protocol")
        s["plan"] = b
        n = sum(len(a["citations"]) for a in b["activities"])
        ok = st == 200 and all(a["citations"] for a in b["activities"])
        return ok, st, ms, f"{b['overall_status']}, {len(b['activities'])} slots, {n} citations, engine={b['generator']['engine']}"

    def citations():
        st, basis, ms = http(base, "GET", f"/schools/{SCHOOL}/basis")
        sys.path.insert(0, str(ROOT))
        from agent.checks import citation_errors
        errs = citation_errors(s["plan"], basis)
        return st == 200 and not errs, st, ms, "every ref resolves to its value" if not errs else errs[0]

    def demo_story():
        cited = {c["ref"] for a in s["plan"]["activities"] for c in a["citations"]}
        sport = next(a for a in s["plan"]["activities"] if a["activity"].startswith("Afternoon Sports"))
        ok = s["smoke_likely"] and "/smoke/afternoon/smoke_likely" in cited and sport["decision"] != "outdoors"
        return ok, "-", 0, f"afternoon sport: {sport['decision']}" + ("" if ok else "; no smoke on today's 14:00 path")

    def notices():
        st, b, ms = http(base, "GET", f"/schools/{SCHOOL}/notices?lang=en,hi")
        langs = sorted({n["lang"] for n in b["notices"]})
        return st == 200 and langs == ["en", "hi"], st, ms, f"{len(b['notices'])} notices ({', '.join(langs)})"

    def regenerate():
        st, b, ms = http(base, "POST", f"/schools/{SCHOOL}/protocol")
        ok = st == 200 and b["generated_at"] >= s["plan"]["generated_at"]
        return ok, st, ms, f"generated_at {b['generated_at']}"

    def alert():
        st, b, ms = http(base, "POST", f"/schools/{SCHOOL}/alerts")
        s["alert"] = b
        return st == 201 and "outbox" in b["delivered_via"], st, ms, f"via {', '.join(b['delivered_via'])}: {b['subject'][:44]}"

    def history():
        st, b, ms = http(base, "GET", f"/schools/{SCHOOL}/alerts")
        return st == 200 and b["alerts"][0]["id"] == s["alert"]["id"], st, ms, f"{len(b['alerts'])} alert(s), newest first"

    def daily_job():
        st, b, ms = http(base, "POST", "/jobs/daily")
        bad = [r for r in b["results"] if "error" in r]
        return st == 200 and len(b["results"]) == len(s["ids"]) and not bad, st, ms, f"{len(b['results'])} schools planned + alerted"

    def upsert():
        body = {"name": "E2E Test School, Noida", "latitude": 28.57, "longitude": 77.32, "district": "Gautam Buddh Nagar"}
        st, _, ms = http(base, "PUT", "/schools/sch_e2e_99", body)
        st2, b, _ = http(base, "GET", "/schools/sch_e2e_99/protocol")
        return st in (200, 201) and st2 == 200, st, ms, f"new school planned: {b.get('overall_status')}"

    def errors():
        st, b, ms = http(base, "GET", "/schools/nope/protocol")
        st2, _, _ = http(base, "PUT", "/schools/sch_e2e_99", {"name": "x", "latitude": 999, "longitude": 0})
        return st == 404 and b["error"]["code"] == "not_found" and st2 == 400, st, ms, "404 envelope, 400 on a bad School"

    for name, fn in (("server health", health), ("dashboard served on /", dashboard), ("GET /schools", schools),
                     ("GET air-quality (24 h forecast)", air), ("GET smoke (now + 14:00 traces)", smoke),
                     ("GET protocol (plan, citations)", protocol), ("citations resolve in /basis", citations),
                     ("demo story: smoke by 14:00 -> sport off", demo_story), ("GET notices (EN + HI)", notices),
                     ("POST protocol (regenerate)", regenerate), ("POST alerts (email now)", alert),
                     ("GET alerts (history)", history), ("POST /jobs/daily (06:00 IST job)", daily_job),
                     ("PUT school, then plan it", upsert), ("error envelopes", errors)):
        if not step(name, fn) and name in ("server health", "GET /schools"):
            break


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    ap = argparse.ArgumentParser(description="Prototype 2 end-to-end check over HTTP.")
    ap.add_argument("--url", help="test this running server instead of starting one")
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--aws-sim", action="store_true")
    args = ap.parse_args()

    proc = None
    if args.url:
        base = args.url.rstrip("/")
    else:
        port = free_port()
        base = f"http://127.0.0.1:{port}"
        cmd = [sys.executable, str(ROOT / "api" / "server.py"), "--port", str(port)]
        cmd += ["--live"] * args.live + ["--aws-sim"] * args.aws_sim
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        for _ in range(100):
            try:
                http(base, "GET", "/health", timeout=1)
                break
            except OSError:
                if proc.poll() is not None:
                    print("FAIL  server exited:\n" + proc.stderr.read()[-2000:])
                    sys.exit(1)
                time.sleep(0.2)
    if args.live:
        INFO_ONLY.add("demo story: smoke by 14:00 -> sport off")
    mode = "existing server" if args.url else f"{'live' if args.live else 'sample'} data, {'moto' if args.aws_sim else 'memory'} store"
    print(f"prototype 2 e2e against {base} ({mode})\n")
    try:
        run(base)
    finally:
        if proc:
            proc.terminate()
            proc.wait(timeout=10)
    passed = sum(results)
    print(f"\n{passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
