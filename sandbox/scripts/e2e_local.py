"""End-to-end test run of the whole backend on a moto-simulated AWS stack.

    python scripts/e2e_local.py            # live data sources (each falls back to mocks on failure)
    python scripts/e2e_local.py --offline  # mocks only

Walks the core loop the way the web app and the schedulers would, and prints PASS / FAIL / SKIP
per step with what actually happened (live vs sample data, Bedrock vs rules fallback, ...).
"""
import argparse
import json
import subprocess
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import local_stack  # noqa: E402

RESULTS = []


def step(name):
    def wrap(fn):
        def run(*a, **k):
            t0 = time.time()
            try:
                status, detail = fn(*a, **k)
            except Exception as exc:  # noqa: BLE001
                status, detail = "FAIL", f"{exc!r}"
                traceback.print_exc()
            RESULTS.append((status, name, detail, time.time() - t0))
            print(f"[{status}] {name} ({time.time() - t0:.1f}s)\n       {detail}")
            return status
        return run
    return wrap


def call(route, sid, body=None):
    import handlers
    event = {"routeKey": route, "pathParameters": {"id": sid}, "body": json.dumps(body) if body is not None else ""}
    resp = handlers.api_handler(event)
    return resp["statusCode"], json.loads(resp["body"]) if resp["body"] else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()
    root = local_stack.ROOT
    info = local_stack.start(offline=args.offline)
    import boto3

    import handlers
    from agent.contracts import errors as contract_errors
    from agent.protocol_agent import citation_errors

    print(f"setup: moto AWS | bedrock: {info['bedrock']} | offline: {args.offline}\n")
    school = json.loads((root / "mocks" / "school.json").read_text(encoding="utf-8"))
    sid = school["school_id"]

    # Capture what SNS publishes: an SQS queue subscribed to the topic (raw delivery).
    sqs = boto3.client("sqs")
    q_url = sqs.create_queue(QueueName="alert-capture")["QueueUrl"]
    q_arn = sqs.get_queue_attributes(QueueUrl=q_url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    boto3.client("sns").subscribe(TopicArn=handlers.os.environ["ALERT_TOPIC_ARN"], Protocol="sqs", Endpoint=q_arn,
                                  Attributes={"RawMessageDelivery": "true"})

    @step("checks: mocks validate + trajectory tests")
    def s_checks():
        v = subprocess.run([sys.executable, str(root / "scripts/validate_mocks.py")], capture_output=True, text=True)
        t = subprocess.run([sys.executable, str(root / "tests/test_trace.py")], capture_output=True, text=True)
        ok = v.returncode == 0 and t.returncode == 0
        return ("PASS" if ok else "FAIL"), f"validate_mocks rc={v.returncode}, test_trace: {t.stdout.strip().splitlines()[-1] if t.stdout else t.stderr[-200:]}"

    @step("PUT /schools/{id} (valid, then invalid)")
    def s_put():
        st, body = call("PUT /schools/{id}", sid, school)
        st_bad, bad = call("PUT /schools/{id}", sid, {"name": "no coords"})
        subs = boto3.client("sns").list_subscriptions_by_topic(TopicArn=handlers.os.environ["ALERT_TOPIC_ARN"])["Subscriptions"]
        emails = [s["Endpoint"] for s in subs if s["Protocol"] == "email"]
        ok = st == 200 and st_bad == 400
        return ("PASS" if ok else "FAIL"), f"valid -> {st}, invalid -> {st_bad} ({len(bad.get('details', []))} errors); email subscriptions: {emails}"

    @step("GET /schools/{id}/today for an unknown school")
    def s_404():
        st, body = call("GET /schools/{id}/today", "no-such-school")
        return ("PASS" if st == 404 else "FAIL"), f"-> {st} {body}"

    bundle_holder = {}

    @step("GET /schools/{id}/today (ingest on demand) -> TodayBundle")
    def s_today():
        st, b = call("GET /schools/{id}/today", sid)
        if st != 200:
            return "FAIL", f"-> {st} {b}"
        errs = contract_errors(b, "today-bundle")
        bundle_holder["b"] = b
        a, sn, sa = b["air"], b["smoke"]["now"], b["smoke"]["afternoon"]
        detail = (f"date {b['date']} | air {a['source']} PM2.5 {a['now']['pm25']} ({a['now']['band']}) | "
                  f"smoke now {sn['source']}/{sn['inputs']['fires']} likely={sn['smoke_likely']} | "
                  f"14:00 likely={sa['smoke_likely']} fires={sa['fire_count']} | contract errors: {errs[:3] or 'none'}")
        return ("PASS" if not errs else "FAIL"), detail

    @step("POST /schools/{id}/protocol -> 202, then poll /today for the plan")
    def s_protocol():
        st, body = call("POST /schools/{id}/protocol", sid)
        if st != 202:
            return "FAIL", f"-> {st} {body}"
        deadline = time.time() + 120
        plan = None
        while time.time() < deadline:
            _, b = call("GET /schools/{id}/today", sid)
            plan = b.get("plan")
            if plan:
                break
            time.sleep(1)
        if not plan:
            return "FAIL", "202 but no plan after 120 s"
        errs = contract_errors(plan, "protocol") + citation_errors(plan, b)
        g = plan["generator"]
        acts = ", ".join(f"{d['slot_id']}={d['action']}" for d in plan["decisions"])
        status = "PASS" if not errs else "FAIL"
        return status, (f"engine {g['engine']}{' (' + g.get('fallback_reason', '') + ')' if g.get('fallback_reason') else ''} | "
                        f"{plan['overall_band']} | {acts} | schema+citation errors: {errs[:3] or 'none'}")

    @step("POST /schools/{id}/alert/test -> SNS publish + alerts table")
    def s_alert():
        st, body = call("POST /schools/{id}/alert/test", sid)
        if st != 200:
            return "FAIL", f"-> {st} {body}"
        msgs = sqs.receive_message(QueueUrl=q_url, MaxNumberOfMessages=10, WaitTimeSeconds=1).get("Messages", [])
        _, b = call("GET /schools/{id}/today", sid)
        alert = {k: v for k, v in body.items() if k != "preview"}
        errs = contract_errors(alert, "alert")
        ok = bool(msgs) and len(b.get("alerts", [])) >= 1 and not errs
        return ("PASS" if ok else "FAIL"), (f"subject: {body['subject']!r} | SNS->SQS messages: {len(msgs)} | "
                                            f"alerts in /today: {len(b.get('alerts', []))} | contract errors: {errs[:3] or 'none'}")

    @step("scheduled ingest_handler (EventBridge hourly)")
    def s_ingest():
        out = handlers.ingest_handler({})
        bad = [r for r in out["ingested"] if "error" in r]
        return ("PASS" if out["ingested"] and not bad else "FAIL"), json.dumps(out["ingested"])

    @step("scheduled alert_handler (EventBridge 06:00 IST)")
    def s_cron_alert():
        out = handlers.alert_handler({})
        bad = [r for r in out["sent"] if "error" in r]
        return ("PASS" if out["sent"] and not bad else "FAIL"), "; ".join(a.get("subject", a.get("error", "")) for a in out["sent"])

    @step("agent_handler direct invoke (what the async invoke runs)")
    def s_agent():
        out = handlers.agent_handler({"school_id": sid})
        return "PASS", json.dumps(out)

    @step("Bedrock (real Strands agent call)")
    def s_bedrock():
        if not info["real_aws_credentials"]:
            return "SKIP", "no AWS credentials on this machine: the plan came from the rules fallback"
        _, b = call("GET /schools/{id}/today", sid)
        eng = b["plan"]["generator"]
        return ("PASS" if eng["engine"] == "strands-bedrock" else "FAIL"), json.dumps(eng)

    @step("infra/template.yaml passes cfn-lint")
    def s_lint():
        exe = Path(sys.executable).parent / "cfn-lint"
        if not exe.exists():
            return "SKIP", "cfn-lint not installed"
        r = subprocess.run([str(exe), str(root / "infra/template.yaml")], capture_output=True, text=True)
        return ("PASS" if r.returncode == 0 else "FAIL"), (r.stdout.strip()[:300] or "no findings")

    for s in (s_checks, s_put, s_404, s_today, s_protocol, s_alert, s_ingest, s_cron_alert, s_agent, s_bedrock, s_lint):
        s()

    if "b" in bundle_holder:
        out = root / ".local" / "last-today-bundle.json"
        out.parent.mkdir(exist_ok=True)
        _, b = call("GET /schools/{id}/today", sid)
        out.write_text(json.dumps(b, ensure_ascii=False, indent=1), encoding="utf-8")
        _, alert = call("POST /schools/{id}/alert/test", sid)
        (root / ".local" / "last-alert-email.txt").write_text(f"Subject: {alert.get('subject')}\n\n{alert.get('preview', '')}", encoding="utf-8")
        print(f"\nwrote .local/last-today-bundle.json and .local/last-alert-email.txt")

    counts = {k: sum(1 for r in RESULTS if r[0] == k) for k in ("PASS", "FAIL", "SKIP")}
    print(f"\nSUMMARY: {counts['PASS']} pass, {counts['FAIL']} fail, {counts['SKIP']} skip")
    for status, name, _, secs in RESULTS:
        print(f"  {status:4}  {name}")
    sys.exit(1 if counts["FAIL"] else 0)


if __name__ == "__main__":
    main()
