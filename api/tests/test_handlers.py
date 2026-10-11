"""Lambda handler tests: API Gateway HTTP API (payload 2.0) events through every handler entry point.
Memory store by default; DynamoDB + SNS on moto when boto3 and moto are installed.
Run from the repo root: python api/tests/test_handlers.py"""
import importlib
import json
import os
import sys
from pathlib import Path

os.environ["BADAIR_OFFLINE"] = "1"      # sample data, shifted onto the planned day
os.environ["AGENT_ENGINE"] = "rules"    # never call Bedrock from a test

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "agent" / "src")]

from api.handlers import common  # noqa: E402
from bad_air_agent.output_validator import contract_errors  # noqa: E402

# Route -> handler module, exactly as infra/template.yaml wires them.
ROUTES = {
    ("GET", "/schools"): "api.handlers.get_school",
    ("GET", "/schools/{id}"): "api.handlers.get_school",
    ("PUT", "/schools/{id}"): "api.handlers.get_school",
    ("GET", "/schools/{id}/air-quality"): "api.handlers.get_forecast",
    ("GET", "/schools/{id}/smoke"): "api.handlers.get_forecast",
    ("GET", "/schools/{id}/protocol"): "api.handlers.get_protocol",
    ("GET", "/schools/{id}/notices"): "api.handlers.get_protocol",
    ("GET", "/schools/{id}/basis"): "api.handlers.get_protocol",
    ("GET", "/schools/{id}/dashboard"): "api.handlers.get_dashboard",
    ("POST", "/schools/{id}/protocol"): "api.handlers.generate_protocol",
    ("POST", "/schools/{id}/alerts"): "data.alerts.handler",
    ("GET", "/schools/{id}/alerts"): "data.alerts.handler",
}


def event(method, path, body=None):
    return {"version": "2.0", "rawPath": path, "requestContext": {"http": {"method": method}, "stage": "$default"},
            "body": json.dumps(body) if body is not None else None, "isBase64Encoded": False}


def call(method, path, body=None):
    parts = path.strip("/").split("/")
    key = "/schools" + ("/{id}" if len(parts) > 1 else "") + ("/" + parts[2] if len(parts) > 2 else "")
    mod = importlib.import_module(ROUTES[(method, key)])
    out = mod.handler(event(method, path, body), None)
    return out["statusCode"], json.loads(out["body"])


def fresh_service(**kw):
    common._service = common.Service(kw.pop("store", None) or common.MemoryStore(), **kw)
    return common._service


def test_yash_routes_match_contracts():
    fresh_service()
    status, out = call("GET", "/schools")
    assert status == 200 and not contract_errors(out, "school")
    for sid in [s["id"] for s in out["schools"]]:
        for path, name in (("air-quality", "air_quality"), ("protocol", "protocol"), ("notices", "parent_notice")):
            status, doc = call("GET", f"/schools/{sid}/{path}")
            assert status == 200, (sid, path, doc)
            assert not contract_errors(doc, name), (sid, path, contract_errors(doc, name))


def test_web_fields_present():
    """What Krishna's components read: protocol is_fallback/valid_for/sources, notices title_hi/body_hi."""
    fresh_service()
    _, p = call("GET", "/schools/sch_dwarka_02/protocol")
    assert p["is_fallback"] is True and p["valid_for"] == p["date"] and isinstance(p["sources"], list)
    _, n = call("GET", "/schools/sch_dwarka_02/notices")
    assert all(x["title_hi"] and x["body_hi"] for x in n["notices"])
    assert [x["kind"] for x in n["notices"]] == ["plan", "smoke"]      # the sample day's smoke-by-14:00 story


def test_dashboard_smoke_basis_and_school_routes():
    fresh_service()
    status, d = call("GET", "/schools/sch_dwarka_02/dashboard")
    assert status == 200 and set(d) == {"school", "air_quality", "protocol"}
    status, s = call("GET", "/schools/sch_dwarka_02/smoke")
    assert status == 200 and s["afternoon"]["smoke_likely"] is True
    status, b = call("GET", "/schools/sch_dwarka_02/basis")
    assert status == 200 and b["date"] == d["protocol"]["date"]
    new = {"id": "sch_test_09", "name": "Test School", "latitude": 28.6, "longitude": 77.2}
    assert call("PUT", "/schools/sch_test_09", new)[0] == 201
    assert call("PUT", "/schools/sch_test_09", new)[0] == 200
    assert call("GET", "/schools/sch_test_09")[1]["name"] == "Test School"
    assert call("PUT", "/schools/sch_test_09", {**new, "latitude": 100})[0] == 400


def test_errors_use_the_envelope():
    fresh_service()
    status, body = call("GET", "/schools/nope/protocol")
    assert status == 404 and body["error"]["code"] == "not_found"
    out = importlib.import_module("api.handlers.get_school").handler(
        {**event("PUT", "/schools/x"), "body": "{bad json"}, None)
    assert out["statusCode"] == 400 and json.loads(out["body"])["error"]["code"] == "bad_request"


def test_generate_protocol_queues_async_run():
    fresh_service()
    gen = importlib.import_module("api.handlers.generate_protocol")
    sent = []

    class FakeLambda:
        def invoke(self, **kw):
            sent.append(kw)

    import types
    fake_boto3 = types.SimpleNamespace(client=lambda name: FakeLambda())
    real, gen.SELF = gen.SELF, "stack-generate-protocol"
    sys.modules["boto3"], saved = fake_boto3, sys.modules.get("boto3")
    try:
        status, body = (lambda o: (o["statusCode"], json.loads(o["body"])))(
            gen.handler(event("POST", "/schools/sch_dwarka_02/protocol"), None))
        assert status == 202 and body["status"] == "accepted"
        assert sent[0]["InvocationType"] == "Event" and json.loads(sent[0]["Payload"]) == {"school_id": "sch_dwarka_02"}
        assert gen.handler(event("POST", "/schools/nope/protocol"), None)["statusCode"] == 404
        out = gen.handler({"school_id": "sch_dwarka_02"}, None)            # the async run itself
        assert out["engine"] == "rules" and out["school_id"] == "sch_dwarka_02"
    finally:
        gen.SELF = real
        if saved is not None:
            sys.modules["boto3"] = saved
        else:
            del sys.modules["boto3"]


def test_daily_job_and_alerts_on_moto():
    try:
        import boto3
        from moto import mock_aws
    except ImportError:
        print("SKIP test_daily_job_and_alerts_on_moto (boto3/moto not installed)")
        return
    os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
    with mock_aws():
        ddb = boto3.client("dynamodb")
        for t in common.TABLES:
            ddb.create_table(TableName=f"t-{t}", BillingMode="PAY_PER_REQUEST",
                             AttributeDefinitions=[{"AttributeName": "school_id", "AttributeType": "S"},
                                                   {"AttributeName": "sk", "AttributeType": "S"}],
                             KeySchema=[{"AttributeName": "school_id", "KeyType": "HASH"},
                                        {"AttributeName": "sk", "KeyType": "RANGE"}])
        sns, sqs = boto3.client("sns"), boto3.client("sqs")
        topic = sns.create_topic(Name="alerts")["TopicArn"]
        queue = sqs.create_queue(QueueName="capture")["QueueUrl"]
        q_arn = sqs.get_queue_attributes(QueueUrl=queue, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
        sns.subscribe(TopicArn=topic, Protocol="sqs", Endpoint=q_arn)
        fresh_service(store=common.DynamoStore({t: f"t-{t}" for t in common.TABLES}), sns_topic=topic)

        status, p = call("GET", "/schools/sch_dwarka_02/protocol")
        assert status == 200 and not contract_errors(p, "protocol")
        item = ddb.get_item(TableName="t-plans", Key={"school_id": {"S": "sch_dwarka_02"}, "sk": {"S": f"plan#{p['date']}"}})
        assert json.loads(item["Item"]["doc"]["S"])["generated_at"] == p["generated_at"]   # {school_id, sk, doc}

        status, alert = call("POST", "/schools/sch_dwarka_02/alerts")
        assert status == 201 and alert["delivered_via"] == ["sns"] and alert["subject"].startswith("[SAMPLE]")
        alerts_mod = importlib.import_module("data.alerts.handler")
        out = alerts_mod.handler({"source": "aws.events", "detail-type": "Scheduled Event"}, None)
        assert len(out["results"]) == 3 and all("alert_id" in r for r in out["results"]), out
        msgs = sqs.receive_message(QueueUrl=queue, MaxNumberOfMessages=10)["Messages"]
        assert len(msgs) >= 4 and "प्रिय अभिभावकगण" in json.loads(msgs[0]["Body"])["Message"]
        status, hist = call("GET", "/schools/sch_dwarka_02/alerts")
        assert status == 200 and len(hist["alerts"]) == 2


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"{len(tests)} passed")
