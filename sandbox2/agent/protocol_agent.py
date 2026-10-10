"""generate_protocol(basis) -> ProtocolResponse. Never raises.

PROTOTYPE of Masham's agent, adapted from sandbox v1 to Yash's contracts:
  1. A Strands agent on Amazon Bedrock reads the basis through tools and starts from the rules plan
     (get_baseline_plan). Its JSON must pass the protocol contract, the citation check and the slot check;
     one repair retry with the errors fed back.
  2. Otherwise (no credentials, AGENT_ENGINE=rules, an error, still invalid) the rules plan is returned with
     generator.engine = "rules" and generator.fallback_reason.

Env: BEDROCK_MODEL_ID (default us.amazon.nova-pro-v1:0), AWS_REGION (default us-east-1), AGENT_ENGINE=rules.
NOT verified against real Bedrock (no AWS credentials on the dev machine); the Strands signatures are the ones
v1 checked against strands-agents 1.x.
"""
import json
import os
import re
import sys

from agent.checks import citation_errors, contract_errors
from agent.rules import RULES, is_sample, rules_protocol
from data.util import IST, iso_z, parse_utc, utcnow

DEFAULT_MODEL = "us.amazon.nova-pro-v1:0"
MODEL_KEYS = ("overall_status", "overall_message", "overall_message_hi", "activities", "citations")

SYSTEM_PROMPT = """You write a Delhi school's "Bad-Air Day Protocol" for one school day, for the principal at 7 AM.

Use the tools to read the data, then reply with ONE JSON object and nothing else, with keys:
overall_status, overall_message, overall_message_hi, activities, citations.

Hard rules:
- Never invent numbers. Every activity has >= 1 citation {"ref", "value", "note"} where ref is a JSON pointer
  exactly as the tools print it (e.g. /air_quality/forecast/3/aqi, /smoke/afternoon/fire_count) and value is
  exactly the value shown at that pointer. The plan's top-level citations follow the same rule.
- One activity per schedule slot, in order, with the same "activity" name and "scheduled_time" (start–end).
  decision is outdoors | indoors | restricted (get_rules has the team limits per intensity; not official).
  If the smoke trace for that part of the day says smoke_likely, be one step stricter and cite it.
  Give an "alternative" (English) whenever the decision is not outdoors.
- overall_status is all_clear | caution | restricted | emergency.
- Each activity has "hi": {"activity", "reason", "alternative"?} in Hindi (Devanagari), plain and warm.
- No medical advice beyond masks for the commute and avoiding outdoor exertion. The smoke trace is indicative.
  Official GRAP/CAQM orders always win.
- get_baseline_plan returns a valid rules-based draft. Start from it; improve wording or judgement only where
  the data supports it, keeping every citation valid.
"""


def slot_errors(protocol, basis):
    want = [(s["activity"], f"{s['start']}–{s['end']}") for s in basis["schedule"]]
    got = [(a.get("activity"), a.get("scheduled_time")) for a in protocol.get("activities", [])]
    return [] if got == want else [f"activities must be exactly these slots in order: {want}"]


def validate(protocol, basis):
    return contract_errors(protocol, "protocol") + citation_errors(protocol, basis) + slot_errors(protocol, basis)


def _make_tools(basis, baseline):
    from strands import tool

    @tool
    def get_school_day() -> str:
        """The school, the IST date being planned and the schedule (IST HH:MM, with activity intensity)."""
        return json.dumps({k: basis[k] for k in ("school", "date", "schedule")}, ensure_ascii=False)

    @tool
    def get_air() -> str:
        """Current AQI and 24 hourly forecast points. Each row shows the JSON pointer to cite and its IST time."""
        air = basis["air_quality"]
        rows = [{"ref": f"/air_quality/forecast/{i}/aqi", "hour_ist": parse_utc(p["hour"]).astimezone(IST).strftime("%Y-%m-%d %H:%M"),
                 "aqi": p["aqi"], "pm25": p["pm25"], "category": p["category"]} for i, p in enumerate(air["forecast"])]
        return json.dumps({"current": {"ref": "/air_quality/current/aqi", **air["current"]}, "forecast": rows}, ensure_ascii=False)

    @tool
    def get_smoke() -> str:
        """Indicative farm-fire smoke traces arriving now and at 14:00 IST. Pointer prefixes: /smoke/now, /smoke/afternoon"""
        keep = ("kind", "target_time", "source", "smoke_likely", "fire_count", "frp_total_mw", "upwind_from_deg",
                "by_district", "headline")
        return json.dumps({k: {f: t[f] for f in keep} for k, t in basis["smoke"].items()}, ensure_ascii=False)

    @tool
    def get_rules() -> str:
        """Team limits: AQI per activity intensity and per overall status (a school rule, not official)."""
        return json.dumps({k: v for k, v in RULES.items() if k != "default_schedule"}, ensure_ascii=False)

    @tool
    def get_baseline_plan() -> str:
        """A valid deterministic draft of the plan. Refine it; keep citations valid."""
        return json.dumps({k: baseline[k] for k in MODEL_KEYS}, ensure_ascii=False)

    return [get_school_day, get_air, get_smoke, get_rules, get_baseline_plan]


def _extract_json(text):
    text = re.sub(r"```(?:json)?", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the model reply")
    return json.loads(text[start:end + 1])


def _bedrock_protocol(basis, baseline, now, model_id, region):
    from strands import Agent
    from strands.models import BedrockModel

    model = BedrockModel(model_id=model_id, region_name=region, temperature=0.2, max_tokens=6000)
    agent = Agent(model=model, tools=_make_tools(basis, baseline), system_prompt=SYSTEM_PROMPT, callback_handler=None)
    prompt = f"Write the protocol for {basis['school']['name']} for {basis['date']} (IST). Reply with the JSON object only."
    errs = []
    for attempt in range(2):
        try:
            body = _extract_json(str(agent(prompt)))
            protocol = {"school_id": basis["school"]["id"], "date": basis["date"], "generated_at": iso_z(now),
                        **{k: body[k] for k in MODEL_KEYS if k in body}, "sample": is_sample(basis),
                        "generator": {"engine": "strands-bedrock", "model_id": model_id}}
            errs = validate(protocol, basis)
            if not errs:
                return protocol, None
        except ValueError as exc:
            errs = [str(exc)]
        if attempt == 0:
            prompt = ("Your JSON failed validation. Fix exactly these problems and reply with the corrected JSON object only:\n- "
                      + "\n- ".join(errs[:20]))
    return None, "invalid after repair: " + "; ".join(errs[:5])


def _skip_reason():
    if os.environ.get("AGENT_ENGINE", "").lower() == "rules":
        return "AGENT_ENGINE=rules"
    try:
        import boto3
        import strands  # noqa: F401
    except ImportError as exc:
        return f"{exc.name} not installed"
    if boto3.Session().get_credentials() is None:
        return "no AWS credentials"
    return None


def generate_protocol(basis, now=None, model_id=None, region=None):
    """ProtocolResponse for a basis. Tries Strands + Bedrock, falls back to the rules plan. Never raises."""
    now = now or utcnow()
    baseline = rules_protocol(basis, now)
    reason = _skip_reason()
    if reason is None:
        model_id = model_id or os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL)
        try:
            protocol, reason = _bedrock_protocol(basis, baseline, now, model_id,
                                                 region or os.environ.get("AWS_REGION", "us-east-1"))
            if protocol:
                return protocol
        except Exception as exc:  # noqa: BLE001 - any Bedrock/Strands failure degrades to rules
            reason = f"bedrock error: {exc!r}"[:300]
    print(f"[agent] rules plan ({reason})", file=sys.stderr)
    baseline["generator"]["fallback_reason"] = reason
    return baseline
