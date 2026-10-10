"""The core loop behind the routes: air, smoke, plan, notices, alert email, the 06:00 IST daily job."""
import copy
import re
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import format_datetime

from agent.checks import school_errors
from agent.notices import build_notices
from agent.protocol_agent import generate_protocol
from agent.rules import build_basis, plan_date
from data.ingest.airquality import CACHE_TTL_SECONDS, fetch_forecast
from data.smoketrace.today import build_today_traces
from data.util import IST, ROOT, iso_z, load_json, utcnow

OUTBOX = ROOT / "outbox"
STATUS_LABEL = {"all_clear": "All clear", "caution": "Caution", "restricted": "Restricted", "emergency": "Emergency"}
DAILY_AT_IST = (6, 0)   # EventBridge cron(30 0 * * ? *)


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _plain(md):
    """Notice Markdown -> plain text for email/SNS."""
    return re.sub(r"\*\*|(?<!\w)_|_(?!\w)", "", md)


class Service:
    def __init__(self, store, sns_topic=None, outbox=OUTBOX, clock=utcnow):
        self.store, self.sns_topic, self.outbox, self.clock = store, sns_topic, outbox, clock
        self._cache, self._lock, self._school_locks = {}, threading.Lock(), {}
        if not store.scan("schools", "profile"):
            for s in load_json(ROOT / "contracts" / "examples" / "sample_schools.json")["schools"]:
                store.put("schools", s["id"], "profile", s)

    # ---- schools ------------------------------------------------------------------------------
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

    # ---- inputs (cached like the hourly ingest) -----------------------------------------------
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

    # ---- plan + notices -----------------------------------------------------------------------
    def _school_lock(self, school_id):
        with self._lock:
            return self._school_locks.setdefault(school_id, threading.Lock())

    def protocol(self, school_id, regenerate=False):
        """Today's plan; generated on first request (open question 2) or when regenerate is set."""
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
            plan = generate_protocol(basis, now=now)
            notices = build_notices(plan, basis)
            for name, doc in (("plan", plan), ("notices", notices), ("basis", basis)):
                self.store.put("plans", school_id, f"{name}#{sk}", doc)
            return plan

    def notices(self, school_id, lang=None):
        plan = self.protocol(school_id)
        out = self.store.get("plans", school_id, f"notices#{plan['date']}")
        if lang:
            langs = set(lang.split(","))
            if not langs <= {"en", "hi"}:
                raise ApiError(400, "bad_request", "lang must be en, hi or en,hi")
            out = {**out, "notices": [n for n in out["notices"] if n["lang"] in langs]}
        return out

    def basis(self, school_id):
        plan = self.protocol(school_id)
        return self.store.get("plans", school_id, f"basis#{plan['date']}")

    # ---- alert email (open question 3) --------------------------------------------------------
    def send_alert(self, school_id, trigger="manual"):
        school = self.school(school_id)
        plan = self.protocol(school_id)
        notices = self.store.get("plans", school_id, f"notices#{plan['date']}")["notices"]
        now = self.clock()
        subject = f"[Bad-Air Day] {STATUS_LABEL[plan['overall_status']]}: {school['name']}, {plan['date']}"[:100]
        if plan.get("sample"):
            subject = ("[SAMPLE] " + subject)[:100]
        parts = []
        for lang in ("en", "hi"):
            for n in (n for n in notices if n["lang"] == lang):
                parts.append(f"{n['title']}\n\n{_plain(n['body'])}")
        text = "\n\n-----\n\n".join(parts)
        alert_id = str(uuid.uuid4())
        delivered = ["outbox"]
        self.outbox.mkdir(parents=True, exist_ok=True)
        msg = EmailMessage()
        msg["From"], msg["To"] = "alerts@bad-air-day.example", f"parents+{school_id}@bad-air-day.example"
        msg["Subject"], msg["Date"], msg["Message-ID"] = subject, format_datetime(now), f"<{alert_id}@bad-air-day.example>"
        msg.set_content(text)
        path = self.outbox / f"{now.strftime('%Y%m%dT%H%M%SZ')}-{school_id}-{alert_id[:8]}.eml"
        path.write_bytes(bytes(msg))
        if self.sns_topic:
            import boto3
            boto3.client("sns").publish(TopicArn=self.sns_topic, Subject=subject, Message=text)
            delivered.append("sns")
        alert = {"id": alert_id, "school_id": school_id, "date": plan["date"], "sent_at": iso_z(now),
                 "trigger": trigger, "channel": "email", "delivered_via": delivered, "subject": subject,
                 "text": text, "overall_status": plan["overall_status"], "sample": bool(plan.get("sample")),
                 "outbox_file": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)}
        self.store.put("alerts", school_id, f"alert#{alert['sent_at']}#{alert_id[:8]}", alert)
        return alert

    def alerts(self, school_id):
        self.school(school_id)
        return {"school_id": school_id, "alerts": self.store.query("alerts", school_id, "alert#")}

    # ---- the 06:00 IST job (EventBridge -> Lambda in the real stack) --------------------------
    def daily_job(self):
        results = []
        for s in self.store.scan("schools", "profile"):
            try:
                plan = self.protocol(s["id"], regenerate=True)
                alert = self.send_alert(s["id"], trigger="schedule")
                results.append({"school_id": s["id"], "date": plan["date"], "overall_status": plan["overall_status"],
                                "alert_id": alert["id"]})
            except Exception as exc:  # noqa: BLE001 - one school failing must not stop the others
                print(f"[daily_job] {s['id']} failed: {exc!r}", file=sys.stderr)
                results.append({"school_id": s["id"], "error": "internal"})
        return {"ran_at": iso_z(self.clock()), "results": results}


def next_daily_run(now):
    """Next 06:00 IST after `now` (UTC-aware)."""
    ist = now.astimezone(IST)
    run = ist.replace(hour=DAILY_AT_IST[0], minute=DAILY_AT_IST[1], second=0, microsecond=0)
    if run <= ist:
        run += timedelta(days=1)
    return run


def start_scheduler(service):
    """Background thread standing in for EventBridge: runs the daily job at every 06:00 IST."""
    def loop():
        while True:
            run = next_daily_run(service.clock())
            print(f"[scheduler] next daily job at {run.isoformat()}", file=sys.stderr)
            while (wait := (run - datetime.now(IST)).total_seconds()) > 0:
                time.sleep(min(wait, 60))
            print(f"[scheduler] {service.daily_job()}", file=sys.stderr)
    threading.Thread(target=loop, daemon=True, name="scheduler").start()
