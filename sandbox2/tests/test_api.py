"""API tests, in process (no sockets): every route in sandbox2/api/server.py on the memory store,
plus the alert on moto SNS when boto3 and moto are installed.
Run from the repo root: python sandbox2/tests/test_api.py"""
import os
import sys
import tempfile
from email import message_from_bytes
from email.policy import default
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ["BADAIR_OFFLINE"] = "1"
os.environ["AGENT_ENGINE"] = "rules"

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agent.checks import citation_errors, contract_errors  # noqa: E402
from api.server import route  # noqa: E402
from api.service import ApiError, Service  # noqa: E402
from api.store import MemoryStore  # noqa: E402

OUTBOX = Path(tempfile.mkdtemp(prefix="badair-outbox-"))


class Clock:
    """06:00 IST on the sample day; each call moves on one second, so regenerated plans get new timestamps."""
    def __init__(self):
        self.t = datetime(2026, 10, 11, 0, 30, tzinfo=timezone.utc)

    def __call__(self):
        self.t += timedelta(seconds=1)
        return self.t


def service(**kw):
    return Service(kw.pop("store", None) or MemoryStore(), outbox=OUTBOX, clock=Clock(), **kw)


def call(svc, method, path, body=None):
    """(status, body) like the HTTP server: errors become their status and error envelope."""
    path, _, query = path.partition("?")
    q = {}
    for kv in filter(None, query.split("&")):
        k, _, v = kv.partition("=")
        q.setdefault(k, []).append(v)
    try:
        return route(svc, method, path, q, body)
    except ApiError as e:
        return e.status, {"error": {"code": e.code, "message": e.message}}


def test_yash_routes_match_contracts():
    svc = service()
    status, out = call(svc, "GET", "/schools")
    assert status == 200 and not contract_errors(out, "school")
    ids = [s["id"] for s in out["schools"]]
    assert "sch_dwarka_02" in ids
    for sid in ids:
        for path, name in (("air-quality", "air_quality"), ("protocol", "protocol"), ("notices", "parent_notice")):
            status, doc = call(svc, "GET", f"/schools/{sid}/{path}")
            assert status == 200, (sid, path, doc)
            assert not contract_errors(doc, name), (sid, path, contract_errors(doc, name))


def test_request_id_is_unique_even_when_cached():
    svc = service()
    a = call(svc, "GET", "/schools/sch_dwarka_02/air-quality")[1]
    b = call(svc, "GET", "/schools/sch_dwarka_02/air-quality")[1]
    assert a["metadata"]["request_id"] != b["metadata"]["request_id"]
    assert a["current"] == b["current"]


def test_plan_is_stored_and_regenerated_on_post():
    svc = service()
    first = call(svc, "GET", "/schools/sch_dwarka_02/protocol")[1]
    again = call(svc, "GET", "/schools/sch_dwarka_02/protocol")[1]
    assert first["generated_at"] == again["generated_at"]
    status, fresh = call(svc, "POST", "/schools/sch_dwarka_02/protocol")
    assert status == 200 and fresh["generated_at"] > first["generated_at"]
    assert call(svc, "GET", "/schools/sch_dwarka_02/protocol")[1]["generated_at"] == fresh["generated_at"]


def test_citations_resolve_in_basis():
    svc = service()
    plan = call(svc, "GET", "/schools/sch_dwarka_02/protocol")[1]
    status, basis = call(svc, "GET", "/schools/sch_dwarka_02/basis")
    assert status == 200 and not citation_errors(plan, basis)


def test_smoke_route_tells_the_demo_story():
    status, smoke = call(service(), "GET", "/schools/sch_dwarka_02/smoke")
    assert status == 200 and set(smoke) == {"now", "afternoon"}
    assert smoke["afternoon"]["smoke_likely"] is True and smoke["afternoon"]["indicative"] is True
    assert smoke["afternoon"]["headline"]["en"].startswith("Smoke likely by 14:00")


def test_notices_language_filter():
    svc = service()
    assert {n["lang"] for n in call(svc, "GET", "/schools/sch_dwarka_02/notices?lang=hi")[1]["notices"]} == {"hi"}
    assert {n["lang"] for n in call(svc, "GET", "/schools/sch_dwarka_02/notices?lang=en,hi")[1]["notices"]} == {"en", "hi"}
    status, err = call(svc, "GET", "/schools/sch_dwarka_02/notices?lang=fr")
    assert status == 400 and err["error"]["code"] == "bad_request"


def test_alert_email_goes_to_outbox_and_history():
    svc = service()
    status, alert = call(svc, "POST", "/schools/sch_dwarka_02/alerts")
    assert status == 201 and alert["delivered_via"] == ["outbox"]
    assert alert["subject"].startswith("[SAMPLE] [Bad-Air Day] Restricted:")
    eml = Path(alert["outbox_file"])
    eml = eml if eml.is_absolute() else ROOT / eml
    msg = message_from_bytes(eml.read_bytes(), policy=default)
    assert msg["Subject"] == alert["subject"] and "Kendriya Vidyalaya" in msg.get_content()
    assert "प्रिय अभिभावकगण" in alert["text"]           # both languages in one email
    call(svc, "POST", "/schools/sch_dwarka_02/alerts")
    history = call(svc, "GET", "/schools/sch_dwarka_02/alerts")[1]["alerts"]
    assert len(history) == 2 and history[0]["sent_at"] > history[1]["sent_at"]   # newest first


def test_daily_job_plans_and_alerts_every_school():
    svc = service()
    status, out = call(svc, "POST", "/jobs/daily")
    n = len(call(svc, "GET", "/schools")[1]["schools"])
    assert status == 200 and len(out["results"]) == n and not any("error" in r for r in out["results"])
    alert = call(svc, "GET", "/schools/sch_rohini_03/alerts")[1]["alerts"][0]
    assert alert["trigger"] == "schedule"


def test_school_upsert():
    svc = service()
    new = {"name": "Test School, Noida", "latitude": 28.57, "longitude": 77.32, "district": "Gautam Buddh Nagar"}
    status, doc = call(svc, "PUT", "/schools/sch_test_09", new)
    assert status == 201 and doc["id"] == "sch_test_09"
    assert call(svc, "PUT", "/schools/sch_test_09", {**new, "name": "Renamed"})[0] == 200
    assert call(svc, "GET", "/schools/sch_test_09")[1]["name"] == "Renamed"
    assert call(svc, "GET", "/schools/sch_test_09/protocol")[0] == 200     # a new school gets a plan too
    assert call(svc, "PUT", "/schools/sch_test_09", {**new, "id": "other"})[0] == 400
    assert call(svc, "PUT", "/schools/sch_test_09", {**new, "latitude": 123})[0] == 400
    assert call(svc, "PUT", "/schools/sch_test_09", ["not", "an", "object"])[0] == 400


def test_errors_use_the_envelope():
    svc = service()
    for method, path, code in (("GET", "/schools/nope/air-quality", 404), ("GET", "/nothing", 404),
                               ("PUT", "/schools/sch_dwarka_02/air-quality", 405)):
        status, body = call(svc, method, path)
        assert status == code and set(body["error"]) == {"code", "message"}, (method, path, status, body)


def test_alert_on_moto_sns():
    try:
        import boto3  # noqa: F401
        import moto  # noqa: F401
    except ImportError:
        print("  (boto3/moto not installed: skipped the moto SNS check)")
        return
    from api.store import aws_sim
    store, topic, queue, mock = aws_sim()
    try:
        svc = service(store=store, sns_topic=topic)
        status, alert = call(svc, "POST", "/schools/sch_dwarka_02/alerts")
        assert status == 201 and alert["delivered_via"] == ["outbox", "sns"]
        msgs = boto3.client("sqs").receive_message(QueueUrl=queue, MaxNumberOfMessages=10).get("Messages", [])
        assert msgs and alert["subject"] in msgs[0]["Body"]
        assert store.get("plans", "sch_dwarka_02", f"plan#{alert['date']}")["school_id"] == "sch_dwarka_02"
    finally:
        mock.stop()


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"{len(tests)} passed (outbox: {OUTBOX})")
