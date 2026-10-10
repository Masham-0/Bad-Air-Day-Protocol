"""PROTOTYPE (written in Aani's backend sandbox so the loop can run; Masham's version replaces it).

generate_protocol(bundle) -> `protocol` contract dict. Never raises.

  1. Strands agent on Amazon Bedrock with tools get_air_now, get_forecast, get_smoke, get_school,
     get_rules (+ get_baseline_plan, a deterministic draft it may refine). Output is JSON, validated
     against protocol.schema.json AND a citation check (every `ref` must resolve in the TodayBundle
     to the cited `value`). One repair retry with the errors fed back.
  2. If Bedrock is unavailable (no credentials, AGENT_ENGINE=rules, error, or still invalid after
     the retry) -> the deterministic rules planner, marked generator.engine="rules-fallback".

Env: BEDROCK_MODEL_ID (default us.amazon.nova-pro-v1:0), AWS_REGION (default us-east-1),
     AGENT_ENGINE=rules to skip Bedrock.
CLI: python agent/protocol_agent.py mocks/today-bundle.json
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.contracts import errors as contract_errors  # noqa: E402
from data.util import IST, iso_z, ist_today_at, load_config, parse_utc, utcnow  # noqa: E402

DEFAULT_MODEL = "us.amazon.nova-pro-v1:0"
BAND_ORDER = {"green": 0, "amber": 1, "red": 2}
ACTIONS = ["outdoor", "outdoor_reduced", "indoor"]
ACTION_TEXT = {
    "outdoor": ("Outdoors as planned", "बाहर, योजना के अनुसार"),
    "outdoor_reduced": ("Outdoors but short and light, no running", "बाहर, पर छोटा और हल्का, दौड़-भाग नहीं"),
    "indoor": ("Move indoors", "अंदर करें"),
}
DISCLAIMER = {
    "en": ("Indicative guidance from model forecasts (CAMS via Open-Meteo) and an indicative wind back-trajectory "
           "smoke trace. Bands are a school rule, not an official standard. Official GRAP/CAQM and Directorate of "
           "Education orders always take precedence."),
    "hi": ("यह सलाह मॉडल पूर्वानुमान और हवा के रुख़ से धुएँ के संकेतात्मक अनुमान पर आधारित है। बैंड स्कूल का अपना नियम है, "
           "कोई आधिकारिक मानक नहीं। सरकारी GRAP/CAQM और शिक्षा निदेशालय के आदेश हमेशा मान्य होंगे।"),
}


# ---- citations --------------------------------------------------------------------------------
def resolve_pointer(doc, ref):
    cur = doc
    for raw in ref.lstrip("/").split("/"):
        part = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(cur, list):
            cur = cur[int(part)]
        elif isinstance(cur, dict):
            cur = cur[part]
        else:
            raise KeyError(ref)
    return cur


def _same(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 0.051 + 0.001 * abs(b)
    return a == b


def citation_errors(protocol, bundle):
    errs = []
    items = [("decisions", d) for d in protocol.get("decisions", [])] + [("windows", w) for w in protocol.get("windows", [])]
    for kind, item in items:
        for c in item.get("citations", []):
            try:
                actual = resolve_pointer(bundle, c["ref"])
            except (KeyError, IndexError, ValueError, TypeError):
                errs.append(f"{kind} {item.get('slot_id', item.get('start'))}: ref {c.get('ref')} does not exist in the bundle")
                continue
            if not _same(c.get("value"), actual):
                errs.append(f"{kind} {item.get('slot_id', item.get('start'))}: ref {c['ref']} is {actual!r}, cited {c.get('value')!r}")
    return errs


def validate_protocol(protocol, bundle):
    return contract_errors(protocol, "protocol") + citation_errors(protocol, bundle)


# ---- rules planner (deterministic, also the agent's baseline) --------------------------------
def _bundle_source(bundle):
    srcs = [bundle["air"]["source"], bundle["smoke"]["now"]["source"], bundle["smoke"]["afternoon"]["source"]]
    return "sample" if "sample" in srcs else "live"


def _slot_hours(hours, start, end):
    out = []
    for i, h in enumerate(hours):
        t = parse_utc(h["time"])
        if t < end and t + timedelta(hours=1) > start:
            out.append(i)
    return out


def _band_labels():
    """band -> (label_en, label_hi, name_hi)"""
    return {b["band"]: (b["label_en"], b["label_hi"], b["name_hi"]) for b in load_config("bands")["bands"]}


def rules_protocol(bundle, now=None, fallback_reason=None):
    now = now or utcnow()
    school, air, smoke = bundle["school"], bundle["air"], bundle["smoke"]
    day = datetime.strptime(bundle["date"], "%Y-%m-%d").date()
    hours, labels = air["hours"], _band_labels()
    noon = ist_today_at("12:00", day=day)
    now_trace_day = parse_utc(smoke["now"]["target_time"]).astimezone(IST).date()

    decisions = []
    for slot in school["schedule"]:
        start, end = ist_today_at(slot["start"], day=day), ist_today_at(slot["end"], day=day)
        idx = _slot_hours(hours, start, end)
        if idx:
            worst = max(idx, key=lambda i: hours[i]["pm25"])
            pm, band = hours[worst]["pm25"], hours[worst]["band"]
            cites = [{"ref": f"/air/hours/{worst}/pm25", "value": pm, "note": f"highest hourly PM2.5 during {slot['label']}"}]
        else:
            pm, band = air["now"]["pm25"], air["now"]["band"]
            cites = [{"ref": "/air/now/pm25", "value": pm, "note": "slot outside the forecast window; using the current value"}]
        if not slot["outdoor"]:
            action = "indoor"
        else:
            action = ACTIONS[BAND_ORDER[band]]
        reason_en = f"PM2.5 up to {pm:g} µg/m³ during this slot ({band}: {labels[band][0].lower()})."
        reason_hi = f"इस समय PM2.5 {pm:g} µg/m³ तक रहने का अनुमान ({labels[band][1]})।"
        key = "afternoon" if start >= noon else "now"
        tr = smoke[key]
        if slot["outdoor"] and tr["smoke_likely"] and (key == "afternoon" or now_trace_day == day):
            action = ACTIONS[min(2, ACTIONS.index(action) + 1)]
            cites += [{"ref": f"/smoke/{key}/smoke_likely", "value": True, "note": "indicative smoke trace"},
                      {"ref": f"/smoke/{key}/fire_count", "value": tr["fire_count"]}]
            reason_en += f" Farm-fire smoke likely ({tr['fire_count']} fires on the wind path), so one step more cautious."
            reason_hi += f" खेतों की आग का धुआँ आने की संभावना ({tr['fire_count']} आग हवा के रास्ते में), इसलिए एक कदम ज़्यादा सावधानी।"
        decisions.append({"slot_id": slot["slot_id"], "label": slot["label"], "start": slot["start"], "end": slot["end"],
                          "action": action, "band": band, "reason": {"en": reason_en, "hi": reason_hi}, "citations": cites})

    windows = _windows(school, day, hours, air)
    overall = max((d["band"] for d in decisions), key=BAND_ORDER.get)
    n_out = sum(1 for s in school["schedule"] if s["outdoor"])
    n_in = sum(1 for d, s in zip(decisions, school["schedule"]) if s["outdoor"] and d["action"] == "indoor")
    smoke_line = smoke["afternoon"]["headline"]
    sample_en = " (SAMPLE DATA)" if _bundle_source(bundle) == "sample" else ""
    sample_hi = " (सैंपल डेटा)" if sample_en else ""
    summary = {
        "en": f"{overall.capitalize()} air day{sample_en}: {n_in} of {n_out} outdoor slots move indoors. {smoke_line['en']}",
        "hi": f"आज हवा {labels[overall][2]} बैंड में{sample_hi}: {n_out} में से {n_in} बाहरी गतिविधियाँ अंदर होंगी। {smoke_line['hi']}",
    }
    return {
        "school_id": school["school_id"], "date": bundle["date"], "generated_at": iso_z(now),
        "generator": {"engine": "rules-fallback", **({"fallback_reason": fallback_reason} if fallback_reason else {})},
        "source": _bundle_source(bundle), "overall_band": overall, "summary": summary,
        "decisions": decisions, "windows": windows,
        "parent_notice": _parent_notice(school, bundle["date"], decisions, overall, labels),
        "disclaimer": DISCLAIMER,
    }


def _windows(school, day, hours, air):
    s_start = min(s["start"] for s in school["schedule"])
    s_end = max(s["end"] for s in school["schedule"])
    w_start, w_end = ist_today_at(s_start, day=day), ist_today_at(s_end, day=day)
    idx = _slot_hours(hours, w_start, w_end)
    if not idx:
        state = "open" if air["now"]["band"] == "green" else "closed"
        return [{"state": state, "start": s_start, "end": s_end,
                 "reason": {"en": "Based on the current reading (school hours are outside the forecast window).",
                            "hi": "अभी की रीडिंग के आधार पर (स्कूल का समय पूर्वानुमान अवधि से बाहर है)।"},
                 "citations": [{"ref": "/air/now/pm25", "value": air["now"]["pm25"]}]}]
    groups = []
    for i in idx:
        state = "open" if hours[i]["band"] == "green" else "closed"
        if groups and groups[-1][0] == state:
            groups[-1][1].append(i)
        else:
            groups.append((state, [i]))
    out = []
    for gi, (state, ids) in enumerate(groups):
        g_start = max(w_start, parse_utc(hours[ids[0]]["time"]))
        g_end = min(w_end, parse_utc(hours[ids[-1]]["time"]) + timedelta(hours=1))
        pick = min(ids, key=lambda i: hours[i]["pm25"]) if state == "open" else max(ids, key=lambda i: hours[i]["pm25"])
        pm = hours[pick]["pm25"]
        if state == "open":
            reason = {"en": f"Air is in the green band (PM2.5 {pm:g} µg/m³ or lower): open windows to ventilate.",
                      "hi": f"हवा हरे बैंड में है (PM2.5 {pm:g} µg/m³ या कम): हवा आने के लिए खिड़कियाँ खोलें।"}
        else:
            reason = {"en": f"PM2.5 up to {pm:g} µg/m³: keep windows and doors closed.",
                      "hi": f"PM2.5 {pm:g} µg/m³ तक: खिड़कियाँ और दरवाज़े बंद रखें।"}
        out.append({"state": state, "start": g_start.astimezone(IST).strftime("%H:%M"),
                    "end": g_end.astimezone(IST).strftime("%H:%M"), "reason": reason,
                    "citations": [{"ref": f"/air/hours/{pick}/pm25", "value": pm}]})
    return out


def _parent_notice(school, date, decisions, overall, labels):
    lines_en = [f"- {d['label']} ({d['start']}): {ACTION_TEXT[d['action']][0].lower()}" for d in decisions]
    slots_hi = {s["slot_id"]: s.get("label_hi", s["label"]) for s in school["schedule"]}
    lines_hi = [f"- {slots_hi[d['slot_id']]} ({d['start']}): {ACTION_TEXT[d['action']][1]}" for d in decisions]
    en = (f"Dear parents,\nThe air near {school['name']} on {date} is expected to be in our {overall} band "
          f"({labels[overall][0].lower()}). Today's plan:\n" + "\n".join(lines_en) +
          "\nPlease send your child with a well-fitting mask for the journey to and from school. "
          "We will keep outdoor exertion to a minimum.\nThank you, School Office")
    hi = (f"प्रिय अभिभावकगण,\n{date} को {school.get('name_hi', school['name'])} के आसपास हवा हमारे "
          f"{labels[overall][2]} बैंड ({labels[overall][1]}) में रहने का अनुमान है। आज की योजना:\n" + "\n".join(lines_hi) +
          "\nकृपया स्कूल आते-जाते समय बच्चे को अच्छी तरह फ़िट होने वाला मास्क पहनाकर भेजें। "
          "हम बाहर की थकाने वाली गतिविधियाँ कम से कम रखेंगे।\nधन्यवाद, स्कूल कार्यालय")
    return {"en": en, "hi": hi}


# ---- Strands agent ----------------------------------------------------------------------------
SYSTEM_PROMPT = """You write a Delhi school's "Bad-Air Day Protocol" for one school day, for the principal at 7 AM.

Use the tools to read the data. Then reply with ONE JSON object and nothing else, with keys:
overall_band, summary, decisions, windows, parent_notice, disclaimer (shapes are in get_rules().protocol_shape).

Hard rules:
- Never invent numbers. Every decision and window has >= 1 citation {"ref", "value", "note"?} where ref is a
  JSON pointer into the TodayBundle exactly as the tools print it (e.g. /air/hours/3/pm25, /air/now/aqi,
  /smoke/afternoon/smoke_likely) and value is exactly the value the tool showed at that pointer.
- One decision per schedule slot (same slot_id, label, start, end). action is outdoor | outdoor_reduced | indoor.
  Band each slot by the WORST hourly band overlapping it (bands come from get_rules, a school rule, not official).
  If the smoke trace for that part of the day says smoke_likely, be one step more cautious and cite it.
- windows: open/closed periods (IST HH:MM) covering school hours.
- summary, reason, parent_notice and disclaimer have "en" and "hi". Hindi in Devanagari, plain and warm.
  No medical advice beyond masks for the commute and avoiding outdoor exertion. The smoke trace is indicative.
  Official GRAP/CAQM orders always win; say so in the disclaimer.
- get_baseline_plan returns a valid rules-based draft. Start from it; improve wording or judgement only where the
  data supports it, keeping every citation valid.
"""


def _make_tools(bundle, baseline):
    from strands import tool

    @tool
    def get_school() -> str:
        """The school profile and today's schedule (times are IST HH:MM). Pointer prefix: /school"""
        return json.dumps({"date_ist": bundle["date"], "school": bundle["school"]}, ensure_ascii=False)

    @tool
    def get_air_now() -> str:
        """Current PM2.5 (ug/m3), its band and the AQI-style number. Pointer prefix: /air/now"""
        return json.dumps({"pointer_prefix": "/air/now", "source": bundle["air"]["source"], **bundle["air"]["now"]}, ensure_ascii=False)

    @tool
    def get_forecast() -> str:
        """24 hourly PM2.5 values with bands. Each row shows the JSON pointer to cite and its IST time."""
        rows = [{"ref": f"/air/hours/{i}/pm25", "time_utc": h["time"],
                 "time_ist": parse_utc(h["time"]).astimezone(IST).strftime("%Y-%m-%d %H:%M"),
                 "pm25": h["pm25"], "band": h["band"]} for i, h in enumerate(bundle["air"]["hours"])]
        return json.dumps({"source": bundle["air"]["source"], "hours": rows}, ensure_ascii=False)

    @tool
    def get_smoke() -> str:
        """Indicative farm-fire smoke traces arriving now and at 14:00 IST. Pointer prefixes: /smoke/now, /smoke/afternoon"""
        keep = ("kind", "target_time", "source", "smoke_likely", "fire_count", "frp_total_mw", "upwind_from_deg", "by_district", "headline")
        return json.dumps({k: {f: t[f] for f in keep} for k, t in bundle["smoke"].items()}, ensure_ascii=False)

    @tool
    def get_rules() -> str:
        """Band thresholds (school rule), GRAP stages (context only) and the protocol JSON shape."""
        return json.dumps({"bands": load_config("bands")["bands"], "grap": load_config("grap"),
                           "protocol_shape": {k: v for k, v in _protocol_schema()["properties"].items()
                                              if k in ("overall_band", "summary", "decisions", "windows", "parent_notice", "disclaimer")}},
                          ensure_ascii=False)

    @tool
    def get_baseline_plan() -> str:
        """A valid deterministic draft of the protocol (rules engine). Refine it; keep citations valid."""
        return json.dumps({k: baseline[k] for k in ("overall_band", "summary", "decisions", "windows", "parent_notice", "disclaimer")},
                          ensure_ascii=False)

    return [get_school, get_air_now, get_forecast, get_smoke, get_rules, get_baseline_plan]


def _protocol_schema():
    from agent.contracts import CONTRACTS
    return json.loads((CONTRACTS / "protocol.schema.json").read_text(encoding="utf-8"))


def _extract_json(text):
    text = re.sub(r"```(?:json)?", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the model reply")
    return json.loads(text[start:end + 1])


def _bedrock_protocol(bundle, baseline, now, model_id, region):
    from strands import Agent
    from strands.models import BedrockModel

    model = BedrockModel(model_id=model_id, region_name=region, temperature=0.2, max_tokens=6000)
    agent = Agent(model=model, tools=_make_tools(bundle, baseline), system_prompt=SYSTEM_PROMPT, callback_handler=None)
    prompt = f"Write the protocol for {bundle['school']['name']} for {bundle['date']} (IST). Reply with the JSON object only."
    for attempt in range(2):
        reply = str(agent(prompt))
        try:
            body = _extract_json(reply)
            errs = []
        except ValueError as exc:
            body, errs = None, [str(exc)]
        if body is not None:
            protocol = {**body, "school_id": bundle["school"]["school_id"], "date": bundle["date"],
                        "generated_at": iso_z(now), "generator": {"engine": "strands-bedrock", "model_id": model_id},
                        "source": _bundle_source(bundle)}
            errs = validate_protocol(protocol, bundle)
            if not errs:
                return protocol, None
        if attempt == 0:
            prompt = ("Your JSON failed validation. Fix exactly these problems and reply with the corrected JSON object only:\n- "
                      + "\n- ".join(errs[:20]))
    return None, "invalid after repair: " + "; ".join(errs[:5])


def generate_protocol(bundle, now=None, model_id=None, region=None):
    """`protocol` dict for a TodayBundle. Tries Strands+Bedrock, falls back to rules. Never raises."""
    now = now or utcnow()
    baseline = rules_protocol(bundle, now)
    model_id = model_id or os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL)
    region = region or os.environ.get("AWS_REGION", "us-east-1")
    reason = None
    if os.environ.get("AGENT_ENGINE", "").lower() == "rules":
        reason = os.environ.get("AGENT_RULES_REASON", "AGENT_ENGINE=rules")
    else:
        try:
            import boto3
            if boto3.Session().get_credentials() is None:
                reason = "no AWS credentials"
        except ImportError:
            reason = "boto3 not installed"
    if reason is None:
        try:
            protocol, reason = _bedrock_protocol(bundle, baseline, now, model_id, region)
            if protocol:
                return protocol
        except Exception as exc:  # noqa: BLE001 - any Bedrock/Strands failure degrades to rules
            reason = f"bedrock error: {exc!r}"[:300]
    print(f"[agent] using rules fallback ({reason})", file=sys.stderr)
    baseline["generator"]["fallback_reason"] = reason
    return baseline


if __name__ == "__main__":
    bundle = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else "mocks/today-bundle.json").read_text(encoding="utf-8"))
    out = generate_protocol(bundle)
    print(json.dumps(out, ensure_ascii=False, indent=2))
    errs = validate_protocol(out, bundle)
    print("VALID protocol" if not errs else f"INVALID: {errs}", file=sys.stderr)
