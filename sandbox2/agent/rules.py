"""Deterministic planner: basis (air + smoke + schedule) -> ProtocolResponse (contracts/protocol.schema.json).

Contract fields are filled exactly as Yash's schema says. The prototype also adds fields the schema allows
(it has no additionalProperties: false), each answering an open question in dev's api/README.md:
  citations  [{ref, value, note}] on the plan and on every activity; ref is a JSON pointer into the basis  (Q7)
  hi         Hindi text: overall_message_hi, and activities[].hi {activity, reason, alternative}         (Q6)
  sample     true when any input is sample data                                                         (Q5)
  generator  {engine: "rules" | "strands-bedrock", model_id?, fallback_reason?}
"""
from datetime import date, timedelta

from data.ingest.airquality import fetch_forecast
from data.smoketrace.today import build_today_traces
from data.util import IST, ROOT, iso_z, ist_today_at, load_json, parse_utc, plan_day, utcnow

RULES = load_json(ROOT / "config" / "protocol_rules.json")
STEPS = ["outdoors", "indoors", "restricted"]
CATEGORY_EN = {"good": "Good", "moderate": "Moderate", "unhealthy_sensitive": "Unhealthy for Sensitive Groups",
               "unhealthy": "Unhealthy", "very_unhealthy": "Very Unhealthy", "hazardous": "Hazardous"}
CATEGORY_HI = {"good": "अच्छी", "moderate": "मध्यम", "unhealthy_sensitive": "संवेदनशील लोगों के लिए अस्वस्थ",
               "unhealthy": "अस्वस्थ", "very_unhealthy": "बहुत अस्वस्थ", "hazardous": "ख़तरनाक"}
DECISION_HI = {"outdoors": "बाहर", "indoors": "अंदर", "restricted": "रद्द / सीमित"}


def schedule_for(school):
    """The school's schedule, or the default one (the School contract has no schedule yet)."""
    return school.get("schedule") or RULES["default_schedule"]


def plan_date(school, now=None):
    """Today in IST, or tomorrow once the last slot has ended."""
    return plan_day(now, {"schedule": schedule_for(school)})


def build_basis(school, now=None, day=None, air=None, smoke=None):
    """Everything the plan may cite, in one document: school, date, schedule, air_quality, smoke."""
    now = now or utcnow()
    day = day or plan_date(school, now)
    return {"school": school, "date": day.isoformat(), "schedule": schedule_for(school),
            "air_quality": air or fetch_forecast(school, now=now, day=day),
            "smoke": smoke or build_today_traces(school, now=now, day=day)}


def is_sample(basis):
    smoke = basis["smoke"]
    return (basis["air_quality"]["current"]["source"].startswith("SAMPLE")
            or "sample" in (smoke["now"]["source"], smoke["afternoon"]["source"]))


def _ist(t):
    return t.astimezone(IST).strftime("%H:%M")


def worst_hour(basis, start, end):
    """(ref, aqi, category, time) of the worst forecast hour overlapping [start, end); the current reading
    if no forecast hour overlaps (e.g. the slot is before the forecast starts)."""
    air = basis["air_quality"]
    idx = [i for i, p in enumerate(air["forecast"])
           if parse_utc(p["hour"]) < end and parse_utc(p["hour"]) + timedelta(hours=1) > start]
    if not idx:
        c = air["current"]
        return "/air_quality/current/aqi", c["aqi"], c["category"], parse_utc(c["recorded_at"])
    i = max(idx, key=lambda k: air["forecast"][k]["aqi"])
    p = air["forecast"][i]
    return f"/air_quality/forecast/{i}/aqi", p["aqi"], p["category"], parse_utc(p["hour"])


def _decide(aqi, intensity):
    lim = RULES["decision_max_aqi"][intensity]
    return "outdoors" if aqi <= lim["outdoors"] else "indoors" if aqi <= lim["indoors"] else "restricted"


def _status(aqi):
    lim = RULES["status_max_aqi"]
    for status in ("all_clear", "caution", "restricted"):
        if aqi <= lim[status]:
            return status
    return "emergency"


def _now_trace_applies(basis, day):
    """The 'now' trace describes the planned day only when it is today."""
    return parse_utc(basis["smoke"]["now"]["target_time"]).astimezone(IST).date() == day


def _smoke_key(basis, start, day):
    """Which trace covers a slot: afternoon for slots from 12:00 IST, else 'now' (same day only)."""
    if start >= ist_today_at(RULES["smoke"]["afternoon_from_ist"], day=day):
        return "afternoon"
    return "now" if _now_trace_applies(basis, day) else None


def rules_protocol(basis, now=None):
    now = now or utcnow()
    day = date.fromisoformat(basis["date"])
    smoke = basis["smoke"]
    activities, worst = [], None
    for slot in basis["schedule"]:
        start, end = ist_today_at(slot["start"], day=day), ist_today_at(slot["end"], day=day)
        ref, aqi, cat, t = worst_hour(basis, start, end)
        if worst is None or aqi > worst[1]:
            worst = (ref, aqi, cat, t)
        decision = _decide(aqi, slot["intensity"])
        when = "now" if ref.endswith("current/aqi") else f"{_ist(t)} IST"
        cites = [{"ref": ref, "value": aqi, "note": f"Worst AQI during this slot ({when})"}]
        reason = f"AQI up to {aqi} ({CATEGORY_EN[cat]}) during this slot; limit for {slot['intensity']} activity outdoors is {RULES['decision_max_aqi'][slot['intensity']]['outdoors']}."
        reason_hi = f"इस समय AQI {aqi} तक ({CATEGORY_HI[cat]}) रहने का अनुमान है।"
        key = _smoke_key(basis, start, day)
        if key and smoke[key]["smoke_likely"] and decision != "restricted":
            decision = STEPS[STEPS.index(decision) + 1]
            n = smoke[key]["fire_count"]
            cites += [{"ref": f"/smoke/{key}/smoke_likely", "value": True, "note": "Indicative smoke trace"},
                      {"ref": f"/smoke/{key}/fire_count", "value": n, "note": "Farm fires on the wind path"}]
            reason += f" Farm-fire smoke likely ({n} fires on the wind path), so one step stricter."
            reason_hi += f" खेतों की आग का धुआँ आने की संभावना ({n} आग हवा के रास्ते में), इसलिए एक कदम ज़्यादा सावधानी।"
        item = {"activity": slot["activity"], "scheduled_time": f"{slot['start']}–{slot['end']}",
                "decision": decision, "reason": reason, "citations": cites,
                "hi": {"activity": slot.get("activity_hi", slot["activity"]), "reason": reason_hi}}
        if decision != "outdoors":
            item["alternative"] = slot[decision]
            item["hi"]["alternative"] = slot.get(f"{decision}_hi", slot[decision])
        activities.append(item)

    status = _status(worst[1])
    day_smoke = [k for k in ("now", "afternoon")
                 if smoke[k]["smoke_likely"] and (k == "afternoon" or _now_trace_applies(basis, day))]
    citations = [{"ref": worst[0], "value": worst[1], "note": "Worst AQI during school hours"}]
    if day_smoke and status == "all_clear":
        status = "caution"
    for k in day_smoke:
        citations.append({"ref": f"/smoke/{k}/smoke_likely", "value": True, "note": "Indicative smoke trace"})

    n_in = sum(a["decision"] == "indoors" for a in activities)
    n_off = sum(a["decision"] == "restricted" for a in activities)
    cat = worst[2]
    msg = (f"Air is {CATEGORY_EN[cat]} during school hours (AQI up to {worst[1]} around {_ist(worst[3])} IST). "
           f"{len(activities) - n_in - n_off} of {len(activities)} activities stay outdoors, {n_in} move indoors, {n_off} are restricted.")
    msg_hi = (f"स्कूल के समय हवा {CATEGORY_HI[cat]} रहने का अनुमान है (लगभग {_ist(worst[3])} बजे AQI {worst[1]} तक)। "
              f"{len(activities)} में से {len(activities) - n_in - n_off} गतिविधियाँ बाहर, {n_in} अंदर, और {n_off} रद्द या सीमित रहेंगी।")
    if "afternoon" in day_smoke:
        msg += " " + smoke["afternoon"]["headline"]["en"]
        msg_hi += " " + smoke["afternoon"]["headline"]["hi"]
    sample = is_sample(basis)
    if sample:
        msg, msg_hi = "SAMPLE DATA. " + msg, "सैंपल डेटा। " + msg_hi
    return {"school_id": basis["school"]["id"], "date": basis["date"], "overall_status": status,
            "overall_message": msg, "activities": activities, "generated_at": iso_z(now),
            "overall_message_hi": msg_hi, "citations": citations, "sample": sample,
            "generator": {"engine": "rules"}}
