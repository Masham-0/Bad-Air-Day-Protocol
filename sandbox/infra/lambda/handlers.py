"""PROTOTYPE Lambda handlers (written in Aani's backend sandbox so the loop can run end to end;
Krishna's version replaces it). All four Lambdas share one package (see infra/build.sh).

Storage pattern: every DynamoDB item is {school_id (PK), sk (SK), doc}, doc = contract JSON string.
  schools  sk=profile                      School
  readings sk=latest | forecast#<gen_at>   Forecast
  traces   sk=now#<day> | forecast#<day>   SmokeTrace (latest for that IST school day)
  plans    sk=plan#<day>                   Protocol
  alerts   sk=alert#<sent_at>              Alert
<day> is the IST school day being planned (data.util.plan_day): today, or tomorrow after school ends.

Env: SCHOOLS_TABLE READINGS_TABLE TRACES_TABLE PLANS_TABLE ALERTS_TABLE ALERT_TOPIC_ARN
     AGENT_FUNCTION_NAME (async invoke target), AGENT_INLINE=1 (local: run the agent in a thread).
"""
import base64
import json
import os
import re
import sys
import threading
import traceback
from datetime import timedelta
from pathlib import Path

try:
    import data  # noqa: F401 - packaged layout: data/ and agent/ sit next to this file
except ImportError:  # sandbox layout: infra/lambda/handlers.py
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import boto3  # noqa: E402

from agent.contracts import errors as contract_errors  # noqa: E402
from agent.protocol_agent import generate_protocol  # noqa: E402
from data.ingest.airquality import fetch_forecast  # noqa: E402
from data.smoketrace.today import build_today_traces  # noqa: E402
from data.util import iso_z, parse_utc, plan_day, utcnow  # noqa: E402

STALE_AFTER = timedelta(hours=2)
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS"}


# ---- storage ----------------------------------------------------------------------------------
def _table(env):
    return boto3.resource("dynamodb").Table(os.environ[env])


def put_doc(env, school_id, sk, doc):
    _table(env).put_item(Item={"school_id": school_id, "sk": sk, "doc": json.dumps(doc, ensure_ascii=False)})


def get_doc(env, school_id, sk):
    item = _table(env).get_item(Key={"school_id": school_id, "sk": sk}).get("Item")
    return json.loads(item["doc"]) if item else None


def query_docs(env, school_id, prefix, limit=20):
    from boto3.dynamodb.conditions import Key
    resp = _table(env).query(KeyConditionExpression=Key("school_id").eq(school_id) & Key("sk").begins_with(prefix),
                             ScanIndexForward=False, Limit=limit)
    return [json.loads(i["doc"]) for i in resp.get("Items", [])]


def all_schools():
    items = _table("SCHOOLS_TABLE").scan().get("Items", [])
    return [json.loads(i["doc"]) for i in items if i["sk"] == "profile"]


class NotFound(Exception):
    pass


def get_school(school_id):
    school = get_doc("SCHOOLS_TABLE", school_id, "profile")
    if not school:
        raise NotFound(f"unknown school {school_id}")
    return school


# ---- ingest -----------------------------------------------------------------------------------
def ingest_school(school, now=None):
    now = now or utcnow()
    day = plan_day(now, school)
    forecast = fetch_forecast(school, now, day)
    traces = build_today_traces(school, now, day)
    sid = school["school_id"]
    put_doc("READINGS_TABLE", sid, "latest", forecast)
    put_doc("READINGS_TABLE", sid, f"forecast#{forecast['generated_at']}", forecast)
    put_doc("TRACES_TABLE", sid, f"now#{day}", traces["now"])
    put_doc("TRACES_TABLE", sid, f"forecast#{day}", traces["afternoon"])
    return {"school_id": sid, "day": day.isoformat(), "air": forecast["source"],
            "smoke_now": traces["now"]["source"], "smoke_afternoon": traces["afternoon"]["source"]}


def ingest_handler(event=None, context=None):
    results = []
    for school in all_schools():
        try:
            results.append(ingest_school(school))
        except Exception as exc:  # noqa: BLE001 - one bad school must not stop the rest
            results.append({"school_id": school.get("school_id"), "error": repr(exc)})
    print(json.dumps({"ingest": results}))
    return {"ingested": results}


# ---- bundle -----------------------------------------------------------------------------------
def build_bundle(school_id, now=None, ingest_if_missing=True):
    now = now or utcnow()
    school = get_school(school_id)
    day = plan_day(now, school)
    forecast = get_doc("READINGS_TABLE", school_id, "latest")
    t_now = get_doc("TRACES_TABLE", school_id, f"now#{day}")
    t_aft = get_doc("TRACES_TABLE", school_id, f"forecast#{day}")
    stale = forecast is None or now - parse_utc(forecast["generated_at"]) > STALE_AFTER
    if ingest_if_missing and (stale or t_now is None or t_aft is None):
        ingest_school(school, now)
        return build_bundle(school_id, now, ingest_if_missing=False)
    if forecast is None or t_now is None or t_aft is None:
        raise RuntimeError("no readings/traces stored for this school and day")
    alerts = [a for a in query_docs("ALERTS_TABLE", school_id, "alert#") if a["date"] == day.isoformat()]
    return {"school": school, "date": day.isoformat(), "generated_at": iso_z(now), "air": forecast,
            "smoke": {"now": t_now, "afternoon": t_aft},
            "plan": get_doc("PLANS_TABLE", school_id, f"plan#{day}"), "alerts": alerts}


# ---- agent ------------------------------------------------------------------------------------
def run_agent(school_id, now=None):
    bundle = build_bundle(school_id, now)
    bundle["plan"] = None
    plan = generate_protocol(bundle, now)
    put_doc("PLANS_TABLE", school_id, f"plan#{plan['date']}", plan)
    return plan


def agent_handler(event, context=None):
    plan = run_agent(event["school_id"])
    out = {"school_id": plan["school_id"], "date": plan["date"], "engine": plan["generator"]["engine"],
           "fallback_reason": plan["generator"].get("fallback_reason")}
    print(json.dumps({"agent": out}))
    return out


def request_protocol(school_id):
    """Kick off the agent without waiting (Lambda async invoke, or a thread locally)."""
    if os.environ.get("AGENT_INLINE") == "1":
        threading.Thread(target=_safe_agent, args=(school_id,), daemon=True).start()
    else:
        boto3.client("lambda").invoke(FunctionName=os.environ["AGENT_FUNCTION_NAME"], InvocationType="Event",
                                      Payload=json.dumps({"school_id": school_id}).encode())


def _safe_agent(school_id):
    try:
        run_agent(school_id)
    except Exception:  # noqa: BLE001
        traceback.print_exc()


# ---- alert ------------------------------------------------------------------------------------
ACTION_EN = {"outdoor": "outdoors", "outdoor_reduced": "outdoors, short and light", "indoor": "INDOORS"}
ACTION_HI = {"outdoor": "बाहर", "outdoor_reduced": "बाहर, छोटा और हल्का", "indoor": "अंदर"}


def compose_alert(bundle, plan):
    indoor = [d["label"] for d in plan["decisions"] if d["action"] == "indoor"]
    reduced = [d["label"] for d in plan["decisions"] if d["action"] == "outdoor_reduced"]
    if indoor:
        outcome = ", ".join(indoor) + " indoors"
    elif reduced:
        outcome = ", ".join(reduced) + " outdoors but short and light"
    else:
        outcome = "all outdoor slots go ahead"
    sample = plan["source"] == "sample"
    subject = f"{'[SAMPLE] ' if sample else ''}Bad-Air Day Protocol {plan['date']}: {outcome}"
    subject = re.sub(r"[^\x20-\x7e]", "", subject)[:99]          # SNS subject: ASCII, < 100 chars
    slots_hi = {s["slot_id"]: s.get("label_hi", s["label"]) for s in bundle["school"]["schedule"]}
    lines = []
    if sample:
        lines += ["*** SAMPLE DATA: not today's real readings ***", ""]
    lines += [f"{bundle['school']['name']} | {plan['date']} (IST) | overall band: {plan['overall_band'].upper()}", "",
              plan["summary"]["en"], "", "Schedule:"]
    lines += [f"  {d['start']}-{d['end']}  {d['label']}: {ACTION_EN[d['action']]}  ({d['band']})" for d in plan["decisions"]]
    lines += ["", "Windows:"] + [f"  {w['start']}-{w['end']}  {w['state']}" for w in plan["windows"]]
    lines += ["", "-" * 40, plan["summary"]["hi"], "", "समय-सारणी:"]
    lines += [f"  {d['start']}-{d['end']}  {slots_hi.get(d['slot_id'], d['label'])}: {ACTION_HI[d['action']]}" for d in plan["decisions"]]
    lines += ["", "-" * 40, "Parent notice (copy / WhatsApp):", "", plan["parent_notice"]["en"], "", plan["parent_notice"]["hi"],
              "", "-" * 40, plan["disclaimer"]["en"], plan["disclaimer"]["hi"],
              "", f"Plan by: {plan['generator']['engine']}{' (' + plan['generator']['model_id'] + ')' if plan['generator'].get('model_id') else ''}"]
    return subject, "\n".join(lines)


def send_alert(school_id, trigger, now=None):
    now = now or utcnow()
    bundle = build_bundle(school_id, now)
    plan = bundle["plan"] or run_agent(school_id, now)
    subject, message = compose_alert(bundle, plan)
    resp = boto3.client("sns").publish(
        TopicArn=os.environ["ALERT_TOPIC_ARN"], Subject=subject, Message=message,
        MessageAttributes={"school_id": {"DataType": "String", "StringValue": school_id}})
    alert = {"school_id": school_id, "date": plan["date"], "sent_at": iso_z(now), "channel": "sns-email",
             "trigger": trigger, "subject": subject, "message_id": resp["MessageId"], "plan_generated_at": plan["generated_at"]}
    put_doc("ALERTS_TABLE", school_id, f"alert#{alert['sent_at']}", alert)
    return alert, message


def alert_handler(event=None, context=None):
    sent = []
    for school in all_schools():
        try:
            alert, _ = send_alert(school["school_id"], "schedule")
            sent.append(alert)
        except Exception as exc:  # noqa: BLE001
            sent.append({"school_id": school.get("school_id"), "error": repr(exc)})
    print(json.dumps({"alerts": sent}, ensure_ascii=False))
    return {"sent": sent}


# ---- API (HTTP API, payload v2) -----------------------------------------------------------------
def _resp(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json; charset=utf-8", **CORS},
            "body": json.dumps(body, ensure_ascii=False)}


def _body(event):
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw) if raw else {}


def put_school(school_id, school):
    school = {**school, "school_id": school_id}
    errs = contract_errors(school, "school")
    if errs:
        return _resp(400, {"error": "invalid School", "details": errs[:10]})
    put_doc("SCHOOLS_TABLE", school_id, "profile", school)
    _subscribe_emails(school_id, school.get("alert_emails", []))
    return _resp(200, school)


def _subscribe_emails(school_id, emails):
    """Email subscription per address, filtered to this school's alerts. SNS sends a confirmation email."""
    topic = os.environ.get("ALERT_TOPIC_ARN")
    if not topic or not emails:
        return
    sns = boto3.client("sns")
    existing = {s["Endpoint"] for s in sns.list_subscriptions_by_topic(TopicArn=topic).get("Subscriptions", [])}
    for email in emails:
        if email not in existing:
            sns.subscribe(TopicArn=topic, Protocol="email", Endpoint=email,
                          Attributes={"FilterPolicy": json.dumps({"school_id": [school_id]})})


def api_handler(event, context=None):
    route = event.get("routeKey", "")
    sid = (event.get("pathParameters") or {}).get("id", "")
    try:
        if route.startswith("OPTIONS"):
            return _resp(204, {})
        if route == "GET /schools/{id}/today":
            bundle = build_bundle(sid)
            errs = contract_errors(bundle, "today-bundle")
            if errs:
                print(json.dumps({"bundle_contract_errors": errs[:10]}))
            return _resp(200, bundle)
        if route == "POST /schools/{id}/protocol":
            school = get_school(sid)
            request_protocol(sid)
            return _resp(202, {"status": "accepted", "school_id": sid,
                               "date": plan_day(utcnow(), school).isoformat(), "requested_at": iso_z(utcnow())})
        if route == "POST /schools/{id}/alert/test":
            alert, message = send_alert(sid, "test")
            return _resp(200, {**alert, "preview": message})
        if route == "PUT /schools/{id}":
            return put_school(sid, _body(event))
        return _resp(404, {"error": f"no route {route}"})
    except NotFound as exc:
        return _resp(404, {"error": str(exc)})
    except json.JSONDecodeError:
        return _resp(400, {"error": "body is not valid JSON"})
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        return _resp(500, {"error": repr(exc)[:300]})

