"""Shared core of every Lambda: storage, the day's plan, notices, alert email and the HTTP router.

Storage follows CLAUDE.md: every DynamoDB item is {school_id (PK), sk (SK), doc}, doc = the contract JSON.
  schools  sk=profile          School
  plans    sk=plan#<date>      ProtocolResponse     sk=notices#<date>  ParentNoticeResponse
           sk=basis#<date>     the inputs the plan's citations point into
  alerts   sk=alert#<sent_at>  alert record
<date> is the IST school day being planned. With no *_TABLE env vars (tests, local runs) a MemoryStore is used.

Routes (Yash's four first, unchanged shapes; the rest answer api/README.md's open questions):
  GET  /schools                       SchoolListResponse
  GET  /schools/{id}/air-quality      AirQualityResponse
  GET  /schools/{id}/protocol         ProtocolResponse (made on the first request of the day)
  GET  /schools/{id}/notices          ParentNoticeResponse (bilingual: title/body + title_hi/body_hi)
  GET  /schools/{id}                  School            PUT /schools/{id}   upsert (201 new, 200 updated)
  GET  /schools/{id}/smoke            {"now": trace, "afternoon": trace}
  GET  /schools/{id}/dashboard        {"school", "air_quality", "protocol"} in one call
  GET  /schools/{id}/basis            what the citations point into
  POST /schools/{id}/protocol         regenerate (the Lambda answers 202 and runs the agent async)
  POST /schools/{id}/alerts           send the alert email now -> 201      GET /schools/{id}/alerts  history
Every error is {"error": {"code", "message"}}.
"""
import base64
import copy
import json
import os
import re
import sys
import threading
import time
import uuid
from email.message import EmailMessage
from email.utils import format_datetime
from pathlib import Path

from bad_air_agent.agent import generate_protocol
from bad_air_agent.notices import build_notices
from bad_air_agent.output_validator import school_errors
from bad_air_agent.tools.activity_policy import build_basis, plan_date
from data.ingest.airquality import CACHE_TTL_SECONDS, fetch_forecast
from data.smoketrace.today import build_today_traces
from data.util import ROOT, iso_z, load_json, utcnow

TABLES = ("schools", "plans", "alerts")
STATUS_LABEL = {"all_clear": "All clear", "caution": "Caution", "restricted": "Restricted", "emergency": "Emergency"}


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


# ---- storage ------------------------------------------------------------------------------------
class MemoryStore:
    kind = "memory"

    def __init__(self):
        self._items, self._lock = {}, threading.Lock()

    def put(self, table, school_id, sk, doc):
        with self._lock:
            self._items[(table, school_id, sk)] = json.dumps(doc, ensure_ascii=False)

    def get(self, table, school_id, sk):
        raw = self._items.get((table, school_id, sk))
        return json.loads(raw) if raw else None

    def query(self, table, school_id, prefix, limit=20):
        """Newest first (sort keys descending), like a DynamoDB query with ScanIndexForward=False."""
        with self._lock:
            keys = sorted((k for k in self._items if k[0] == table and k[1] == school_id and k[2].startswith(prefix)),
                          reverse=True)[:limit]
            return [json.loads(self._items[k]) for k in keys]

    def scan(self, table, sk):
        with self._lock:
            return [json.loads(v) for k, v in sorted(self._items.items()) if k[0] == table and k[2] == sk]


class DynamoStore:
    kind = "dynamodb"

    def __init__(self, names):
        import boto3
        self._t = {t: boto3.resource("dynamodb").Table(names[t]) for t in TABLES}

    def put(self, table, school_id, sk, doc):
        self._t[table].put_item(Item={"school_id": school_id, "sk": sk, "doc": json.dumps(doc, ensure_ascii=False)})

    def get(self, table, school_id, sk):
        item = self._t[table].get_item(Key={"school_id": school_id, "sk": sk}).get("Item")
        return json.loads(item["doc"]) if item else None

    def query(self, table, school_id, prefix, limit=20):
        from boto3.dynamodb.conditions import Key
        resp = self._t[table].query(KeyConditionExpression=Key("school_id").eq(school_id) & Key("sk").begins_with(prefix),
                                    ScanIndexForward=False, Limit=limit)
        return [json.loads(i["doc"]) for i in resp.get("Items", [])]

    def scan(self, table, sk):
        from boto3.dynamodb.conditions import Attr
        items = self._t[table].scan(FilterExpression=Attr("sk").eq(sk)).get("Items", [])
        return [json.loads(i["doc"]) for i in sorted(items, key=lambda i: i["school_id"])]


def store_from_env():
    names = {t: os.environ.get(f"{t.upper()}_TABLE") for t in TABLES}
    return DynamoStore(names) if all(names.values()) else MemoryStore()


def _plain(md):
    """Notice Markdown -> plain text for email/SNS."""
    return re.sub(r"\*\*|(?<!\w)_|_(?!\w)", "", md)


# ---- the core loop ------------------------------------------------------------------------------
class Service:
    def __init__(self, store, sns_topic=None, outbox=None, clock=utcnow):
        self.store, self.sns_topic, self.clock = store, sns_topic, clock
        self.outbox = Path(outbox) if outbox else None
        self._cache, self._lock, self._school_locks = {}, threading.Lock(), {}
        if not store.scan("schools", "profile"):
            for s in load_json(ROOT / "contracts" / "examples" / "sample_schools.json")["schools"]:
                store.put("schools", s["id"], "profile", s)

    # schools
    def schools(self):
        return {"schools": self.store.scan("schools", "profile")}

    def school(self, school_id):
        s = self.store.get("schools", school_id, "profile")
        if not s:
            raise ApiError(404, "not_found", f"unknown school {school_id}")
        return s

    def put_school(self, school_id, body):
        if not isinstance(body, dict):
            raise ApiError(400, "bad_request", "body must be a School object")
        body = {**body, "id": body.get("id", school_id)}
        if body["id"] != school_id:
            raise ApiError(400, "bad_request", f"body id {body['id']} does not match the path id {school_id}")
        errs = school_errors(body)
        if errs:
            raise ApiError(400, "bad_request", "not a valid School: " + "; ".join(errs[:5]))
        created = self.store.get("schools", school_id, "profile") is None
        self.store.put("schools", school_id, "profile", body)
        with self._lock:
            self._cache = {k: v for k, v in self._cache.items() if k[1] != school_id}
        return body, created

    # inputs, cached per container like the hourly ingest
    def _cached(self, kind, school, day, make):
        key = (kind, school["id"], day)
        with self._lock:
            hit = self._cache.get(key)
        if hit and time.time() - hit[0] < CACHE_TTL_SECONDS:
            return hit[1]
        out = make()
        with self._lock:
            self._cache[key] = (time.time(), out)
        return out

    def air_quality(self, school_id):
        school = self.school(school_id)
        now = self.clock()
        day = plan_date(school, now)
        out = copy.deepcopy(self._cached("air", school, day, lambda: fetch_forecast(school, now=now, day=day)))
        out["metadata"]["request_id"] = str(uuid.uuid4())   # unique per request, even when cached
        return out

    def smoke(self, school_id):
        school = self.school(school_id)
        now = self.clock()
        day = plan_date(school, now)
        return self._cached("smoke", school, day, lambda: build_today_traces(school, now=now, day=day))

    # plan + notices
    def _school_lock(self, school_id):
        with self._lock:
            return self._school_locks.setdefault(school_id, threading.Lock())

    def protocol(self, school_id, regenerate=False, rules_only=False):
        """Today's plan: the stored one, or a new one (first request of the day, or regenerate)."""
        school = self.school(school_id)
        with self._school_lock(school_id):
            now = self.clock()
            day = plan_date(school, now)
            sk = day.isoformat()
            plan = None if regenerate else self.store.get("plans", school_id, f"plan#{sk}")
            if plan:
                return plan
            air = self._cached("air", school, day, lambda: fetch_forecast(school, now=now, day=day))
            smoke = self._cached("smoke", school, day, lambda: build_today_traces(school, now=now, day=day))
            basis = build_basis(school, now=now, day=day, air=air, smoke=smoke)
            plan = generate_protocol(basis, now=now, rules_only=rules_only)
            notices = build_notices(plan, basis)
            for name, doc in (("plan", plan), ("notices", notices), ("basis", basis)):
                self.store.put("plans", school_id, f"{name}#{sk}", doc)
            return plan

    def notices(self, school_id):
        plan = self.protocol(school_id)
        return self.store.get("plans", school_id, f"notices#{plan['date']}")

    def basis(self, school_id):
        plan = self.protocol(school_id)
        return self.store.get("plans", school_id, f"basis#{plan['date']}")

    def dashboard(self, school_id):
        return {"school": self.school(school_id), "air_quality": self.air_quality(school_id),
                "protocol": self.protocol(school_id)}

    # alert email
    def send_alert(self, school_id, trigger="manual", rules_only=False):
        school = self.school(school_id)
        plan = self.protocol(school_id, rules_only=rules_only)
        notices = self.store.get("plans", school_id, f"notices#{plan['date']}")["notices"]
        now = self.clock()
        subject = f"[Bad-Air Day] {STATUS_LABEL[plan['overall_status']]}: {school['name']}, {plan['date']}"[:100]
        if plan.get("sample"):
            subject = ("[SAMPLE] " + subject)[:100]
        text = "\n\n-----\n\n".join([f"{n['title']}\n\n{_plain(n['body'])}" for n in notices]
                                    + [f"{n['title_hi']}\n\n{_plain(n['body_hi'])}" for n in notices])
        alert_id = str(uuid.uuid4())
        delivered = []
        if self.sns_topic:
            import boto3
            boto3.client("sns").publish(TopicArn=self.sns_topic, Subject=subject, Message=text)
            delivered.append("sns")
        if self.outbox:
            self.outbox.mkdir(parents=True, exist_ok=True)
            msg = EmailMessage()
            msg["From"], msg["To"] = "alerts@bad-air-day.example", f"parents+{school_id}@bad-air-day.example"
            msg["Subject"], msg["Date"], msg["Message-ID"] = subject, format_datetime(now), f"<{alert_id}@bad-air-day.example>"
            msg.set_content(text)
            (self.outbox / f"{now.strftime('%Y%m%dT%H%M%SZ')}-{school_id}-{alert_id[:8]}.eml").write_bytes(bytes(msg))
            delivered.append("outbox")
        alert = {"id": alert_id, "school_id": school_id, "date": plan["date"], "sent_at": iso_z(now),
                 "trigger": trigger, "channel": "email", "delivered_via": delivered, "subject": subject,
                 "text": text, "overall_status": plan["overall_status"], "sample": bool(plan.get("sample"))}
        self.store.put("alerts", school_id, f"alert#{alert['sent_at']}#{alert_id[:8]}", alert)
        return alert

    def alerts(self, school_id):
        self.school(school_id)
        return {"school_id": school_id, "alerts": self.store.query("alerts", school_id, "alert#")}

    # the 06:00 IST job (EventBridge -> alerts Lambda)
    def daily_job(self):
        results = []
        for s in self.store.scan("schools", "profile"):
            try:
                plan = self.protocol(s["id"], regenerate=True)
                alert = self.send_alert(s["id"], trigger="schedule")
                results.append({"school_id": s["id"], "date": plan["date"], "overall_status": plan["overall_status"],
                                "engine": plan["generator"]["engine"], "alert_id": alert["id"]})
            except Exception as exc:  # noqa: BLE001 - one school failing must not stop the others
                print(f"[daily_job] {s['id']} failed: {exc!r}", file=sys.stderr)
                results.append({"school_id": s["id"], "error": "internal"})
        return {"ran_at": iso_z(self.clock()), "results": results}


_service = None


def service():
    """One Service per Lambda container (DynamoDB + SNS from env; memory store when the env is missing)."""
    global _service
    if _service is None:
        _service = Service(store_from_env(), sns_topic=os.environ.get("ALERT_TOPIC_ARN") or None,
                           outbox=os.environ.get("OUTBOX_DIR") or None)
    return _service


# ---- HTTP ---------------------------------------------------------------------------------------
SCHOOL = re.compile(r"^/schools/([A-Za-z0-9_-]+)(?:/([a-z-]+))?/?$")
SCHOOL_ROUTES = {
    (None, "GET"): lambda svc, sid, body: svc.school(sid),
    (None, "PUT"): lambda svc, sid, body: svc.put_school(sid, body),
    ("air-quality", "GET"): lambda svc, sid, body: svc.air_quality(sid),
    ("smoke", "GET"): lambda svc, sid, body: svc.smoke(sid),
    ("dashboard", "GET"): lambda svc, sid, body: svc.dashboard(sid),
    ("protocol", "GET"): lambda svc, sid, body: svc.protocol(sid),
    ("protocol", "POST"): lambda svc, sid, body: svc.protocol(sid, regenerate=True),
    ("notices", "GET"): lambda svc, sid, body: svc.notices(sid),
    ("basis", "GET"): lambda svc, sid, body: svc.basis(sid),
    ("alerts", "GET"): lambda svc, sid, body: svc.alerts(sid),
    ("alerts", "POST"): lambda svc, sid, body: (svc.send_alert(sid, rules_only=True), True),
}


def route(svc, method, path, body=None):
    """(status, body) for an API request."""
    if path in ("/schools", "/schools/") and method == "GET":
        return 200, svc.schools()
    if path == "/health" and method == "GET":
        return 200, {"ok": True, "time": iso_z(utcnow()), "store": svc.store.kind, "sns": bool(svc.sns_topic)}
    m = SCHOOL.match(path)
    if m:
        handler = SCHOOL_ROUTES.get((m.group(2), method))
        if handler:
            out = handler(svc, m.group(1), body)
            if isinstance(out, tuple):          # (doc, created)
                return (201 if out[1] else 200), out[0]
            return 200, out
        if any(k[0] == m.group(2) for k in SCHOOL_ROUTES):
            raise ApiError(405, "method_not_allowed", f"{method} not allowed on {path}")
    raise ApiError(404, "not_found", f"no route {method} {path}")


def request_parts(event):
    """(method, path, body) from an API Gateway HTTP API (payload 2.0) event."""
    http = event.get("requestContext", {}).get("http", {})
    method, path = http.get("method", "GET"), event.get("rawPath", "/")
    stage = event.get("requestContext", {}).get("stage")
    if stage and stage != "$default" and path.startswith(f"/{stage}/"):
        path = path[len(stage) + 1:]
    raw = event.get("body")
    if raw and event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    if not raw:
        return method, path, None
    try:
        return method, path, json.loads(raw)
    except ValueError:
        raise ApiError(400, "bad_request", "body is not valid JSON") from None


def response(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json; charset=utf-8"},
            "body": json.dumps(body, ensure_ascii=False)}


def handle_http(event, svc=None):
    """Lambda proxy: route the request, wrap errors; 500s never leak a stack trace."""
    try:
        method, path, body = request_parts(event)
        return response(*route(svc or service(), method, path, body))
    except ApiError as e:
        return response(e.status, {"error": {"code": e.code, "message": e.message}})
    except Exception as e:  # noqa: BLE001
        print(f"[api] internal error: {e!r}", file=sys.stderr)
        return response(500, {"error": {"code": "internal", "message": "internal error"}})
