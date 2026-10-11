"""generate_protocol(basis) -> ProtocolResponse. Never raises.

  1. A Strands agent on Amazon Bedrock reads the basis through tools and starts from the rules plan
     (get_baseline_plan). Its JSON must pass the protocol contract, the citation check and the slot check,
     with one repair retry that feeds the errors back.
  2. Otherwise (no credentials, AGENT_ENGINE=rules, an error, still invalid) the rules plan is returned with
     generator.engine = "rules" and generator.fallback_reason.

Both paths then get the fields the web app reads: valid_for, sources, is_fallback.

Env: BEDROCK_MODEL_ID (default us.amazon.nova-pro-v1:0), AWS_REGION (default us-east-1), AGENT_ENGINE=rules.
NOT verified against real Bedrock yet (no AWS credentials on the machine it was written on).
"""
import json
import os
import re
import sys

from bad_air_agent.output_validator import citation_errors, contract_errors
from bad_air_agent.prompts import SYSTEM_PROMPT, repair_prompt, user_prompt
from bad_air_agent.tools.activity_policy import RULES, is_sample, rules_protocol
from bad_air_agent.tools.air_quality import air_rows
from bad_air_agent.tools.smoke_risk import smoke_summary
from data.util import iso_z, utcnow

DEFAULT_MODEL = "us.amazon.nova-pro-v1:0"
MODEL_KEYS = ("overall_status", "overall_message", "overall_message_hi", "activities", "citations")


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
        return json.dumps(air_rows(basis), ensure_ascii=False)

    @tool
    def get_smoke() -> str:
        """Indicative farm-fire smoke traces arriving now and at 14:00 IST. Pointer prefixes: /smoke/now, /smoke/afternoon"""
        return json.dumps(smoke_summary(basis), ensure_ascii=False)

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
    prompt = user_prompt(basis)
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
            prompt = repair_prompt(errs)
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


def _for_web(protocol, basis):
    """Fields Krishna's web components read (web/src/types/api.ts); the protocol schema allows them."""
    inputs = basis["smoke"]["afternoon"].get("inputs", {})
    sources = [basis["air_quality"]["current"]["source"],
               "Wind: Open-Meteo" + (" (sample)" if inputs.get("wind") == "sample" else ""),
               "Fires: NASA FIRMS VIIRS" + (" (sample)" if inputs.get("fires") == "sample" else "")]
    gen = protocol["generator"]
    sources.append(f"Amazon Bedrock ({gen['model_id']}) via Strands" if gen["engine"] == "strands-bedrock"
                   else "Rules engine (team thresholds)")
    return {**protocol, "valid_for": protocol["date"], "sources": sources,
            "is_fallback": gen["engine"] != "strands-bedrock"}


def generate_protocol(basis, now=None, model_id=None, region=None, rules_only=False):
    """ProtocolResponse for a basis. Tries Strands + Bedrock unless rules_only, falls back to the rules plan.
    Never raises."""
    now = now or utcnow()
    baseline = rules_protocol(basis, now)
    reason = "rules only on this path (API time limit)" if rules_only else _skip_reason()
    if reason is None:
        model_id = model_id or os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL)
        try:
            protocol, reason = _bedrock_protocol(basis, baseline, now, model_id,
                                                 region or os.environ.get("AWS_REGION", "us-east-1"))
            if protocol:
                return _for_web(protocol, basis)
        except Exception as exc:  # noqa: BLE001 - any Bedrock/Strands failure degrades to rules
            reason = f"bedrock error: {exc!r}"[:300]
    print(f"[agent] rules plan ({reason})", file=sys.stderr)
    baseline["generator"]["fallback_reason"] = reason
    return _for_web(baseline, basis)
