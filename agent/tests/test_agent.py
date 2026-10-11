"""Planner tests: the rules plan, EN/HI notices, the citation rule and School input checks.
Run from the repo root: python agent/tests/test_agent.py
(stdlib only; contract checks also run if jsonschema is installed)."""
import copy
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

os.environ["BADAIR_OFFLINE"] = "1"      # sample data, shifted onto the planned day
os.environ["AGENT_ENGINE"] = "rules"    # never call Bedrock from a test

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "agent" / "src")]

from bad_air_agent.output_validator import citation_errors, contract_errors, school_errors  # noqa: E402
from bad_air_agent.notices import build_notices  # noqa: E402
from bad_air_agent.agent import generate_protocol  # noqa: E402
from bad_air_agent.tools.activity_policy import build_basis, rules_protocol  # noqa: E402
from data.util import load_json  # noqa: E402

SCHOOLS = {s["id"]: s for s in load_json(ROOT / "contracts" / "examples" / "sample_schools.json")["schools"]}
NOW = datetime(2026, 10, 11, 0, 30, tzinfo=timezone.utc)     # 06:00 IST, when the daily job runs
_BASES = {}


def basis_for(school_id):
    if school_id not in _BASES:
        _BASES[school_id] = build_basis(SCHOOLS[school_id], now=NOW)
    return copy.deepcopy(_BASES[school_id])


def _category(aqi):
    for top, cat in ((50, "good"), (100, "moderate"), (150, "unhealthy_sensitive"), (200, "unhealthy"), (300, "very_unhealthy")):
        if aqi <= top:
            return cat
    return "hazardous"


def flat_day(aqi, smoke_now=False, smoke_afternoon=False):
    """The Dwarka sample day with every hour at one AQI and the smoke flags set by hand."""
    b = basis_for("sch_dwarka_02")
    for p in b["air_quality"]["forecast"] + [b["air_quality"]["current"]]:
        p["aqi"], p["category"] = aqi, _category(aqi)
    b["smoke"]["now"]["smoke_likely"] = smoke_now
    b["smoke"]["afternoon"]["smoke_likely"] = smoke_afternoon
    return b


def decisions(plan):
    return {a["activity"]: a["decision"] for a in plan["activities"]}


def test_sample_plans_pass_contract_and_citations():
    for sid in SCHOOLS:
        b = basis_for(sid)
        plan = rules_protocol(b, NOW)
        assert not contract_errors(plan, "protocol"), (sid, contract_errors(plan, "protocol"))
        assert not citation_errors(plan, b), (sid, citation_errors(plan, b))
        assert plan["sample"] is True and plan["overall_message"].startswith("SAMPLE DATA.")
        assert plan["overall_message_hi"].startswith("सैंपल डेटा।")
        assert len(plan["activities"]) == len(b["schedule"])


def test_clean_air_keeps_everything_outdoors():
    plan = rules_protocol(flat_day(80), NOW)
    assert plan["overall_status"] == "all_clear"
    assert set(decisions(plan).values()) == {"outdoors"}
    assert all("alternative" not in a for a in plan["activities"])


def test_thresholds_depend_on_intensity():
    d = decisions(rules_protocol(flat_day(130), NOW))       # vigorous/moderate out to 100, light to 150
    assert d["PE – Outdoor Sports"] == "indoors"
    assert d["Recess – Playground"] == "indoors"
    assert d["Morning Assembly"] == "outdoors"
    d = decisions(rules_protocol(flat_day(180), NOW))       # vigorous indoors to 150, moderate to 200
    assert d["PE – Outdoor Sports"] == "restricted"
    assert d["Recess – Playground"] == "indoors"
    assert d["Morning Assembly"] == "indoors"


def test_status_bands():
    for aqi, status in ((80, "all_clear"), (140, "caution"), (190, "restricted"), (260, "emergency")):
        assert rules_protocol(flat_day(aqi), NOW)["overall_status"] == status, aqi


def test_afternoon_smoke_makes_afternoon_slots_one_step_stricter():
    b = flat_day(80, smoke_afternoon=True)
    plan = rules_protocol(b, NOW)
    d = decisions(plan)
    assert d["Morning Assembly"] == "outdoors"               # before 12:00 IST: the afternoon trace doesn't apply
    assert d["Lunch Break"] == "indoors"
    assert d["Afternoon Sports Practice"] == "indoors"
    assert plan["overall_status"] == "caution"               # smoke lifts an all-clear day to caution
    lunch = next(a for a in plan["activities"] if a["activity"] == "Lunch Break")
    assert {c["ref"] for c in lunch["citations"]} >= {"/smoke/afternoon/smoke_likely", "/smoke/afternoon/fire_count"}
    assert not citation_errors(plan, b)


def test_demo_story_smoke_by_14_00():
    """The video hook: in the Dwarka sample day, smoke is likely by 14:00 and afternoon sport stays off the field."""
    b = basis_for("sch_dwarka_02")
    assert b["smoke"]["afternoon"]["smoke_likely"] is True
    plan = rules_protocol(b, NOW)
    assert "/smoke/afternoon/smoke_likely" in {c["ref"] for c in plan["citations"]}
    assert decisions(plan)["Afternoon Sports Practice"] != "outdoors"
    assert "14:00" in plan["overall_message"]


def test_notices_are_bilingual_and_pass_contract():
    for sid in SCHOOLS:
        b = basis_for(sid)
        plan = rules_protocol(b, NOW)
        out = build_notices(plan, b)
        assert not contract_errors(out, "parent_notice"), (sid, contract_errors(out, "parent_notice"))
        kinds = [n["kind"] for n in out["notices"]]
        smoke = b["smoke"]["afternoon"]["smoke_likely"]
        assert kinds == ["plan"] + (["smoke"] if smoke else []), (sid, kinds)
        for n in out["notices"]:
            assert n["body"].startswith("**") and n["body_hi"].startswith("**"), (sid, n["kind"])  # SAMPLE line leads
            assert any("\u0900" <= ch <= "\u097f" for ch in n["title_hi"] + n["body_hi"]), "Hindi is not Devanagari"
        for a in plan["activities"]:
            assert a["activity"] in out["notices"][0]["body"], a["activity"]


def test_citation_check_catches_bad_numbers():
    b = basis_for("sch_dwarka_02")
    plan = rules_protocol(b, NOW)
    bad = copy.deepcopy(plan)
    bad["activities"][0]["citations"][0]["value"] += 40
    assert any("cited" in e for e in citation_errors(bad, b))
    bad = copy.deepcopy(plan)
    bad["citations"][0]["ref"] = "/air_quality/forecast/99/aqi"
    assert any("does not exist" in e for e in citation_errors(bad, b))
    bad = copy.deepcopy(plan)
    bad["activities"][1]["citations"] = []
    assert any("no citations" in e for e in citation_errors(bad, b))


def test_agent_falls_back_to_rules():
    b = basis_for("sch_rohini_03")
    plan = generate_protocol(b, now=NOW)
    assert plan["generator"] == {"engine": "rules", "fallback_reason": "AGENT_ENGINE=rules"}
    assert not citation_errors(plan, b)
    assert not contract_errors(plan, "protocol")
    # the fields the web app reads (web/src/types/api.ts)
    assert plan["is_fallback"] is True and plan["valid_for"] == plan["date"]
    assert plan["sources"][-1] == "Rules engine (team thresholds)" and any("(sample)" in x for x in plan["sources"])


def test_school_input_checks():
    good = SCHOOLS["sch_dwarka_02"]
    assert school_errors(good) == []
    assert any("latitude is required" in e for e in school_errors({k: v for k, v in good.items() if k != "latitude"}))
    assert school_errors({**good, "latitude": 100})
    assert school_errors({**good, "longitude": True})
    assert school_errors({**good, "name": "  "})


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"{len(tests)} passed")
