"""Air-quality tests: US-EPA AQI breakpoints and the contract shape of what the data layer outputs.
Run: python tests/test_airquality.py (stdlib only; contract checks also run if jsonschema is installed)."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from data.ingest.airquality import epa_aqi, fetch_forecast  # noqa: E402
from data.util import MOCKS, load_json  # noqa: E402


def _validator(schema_file, definition=None):
    """Draft-07 validator for a contract (or one of its definitions); None if jsonschema is missing."""
    try:
        from jsonschema import Draft7Validator
    except ImportError:
        return None
    schema = json.loads((ROOT / "contracts" / schema_file).read_text(encoding="utf-8"))
    if definition:
        schema = {**schema["definitions"][definition], "definitions": schema["definitions"]}
    return Draft7Validator(schema)


def test_epa_breakpoints():
    cases = {0: (0, "good"), 9.0: (50, "good"), 9.1: (51, "moderate"), 35.4: (100, "moderate"),
             35.5: (101, "unhealthy_sensitive"), 55.5: (151, "unhealthy"), 125.5: (201, "very_unhealthy"),
             225.5: (301, "hazardous"), 325.4: (500, "hazardous"), 900: (500, "hazardous")}
    for pm, expected in cases.items():
        assert epa_aqi(pm) == expected, (pm, epa_aqi(pm), expected)


def test_offline_forecast_matches_contract():
    os.environ["BADAIR_OFFLINE"] = "1"
    try:
        school = load_json(MOCKS / "school.json")
        now = datetime(2026, 10, 12, 1, 30, tzinfo=timezone.utc)
        out = fetch_forecast(school, now=now)
    finally:
        os.environ.pop("BADAIR_OFFLINE")
    assert set(out) == {"current", "forecast", "metadata"}
    assert len(out["forecast"]) == 24 and out["current"]["source"].startswith("SAMPLE")
    assert all(p["hour"].endswith("Z") for p in out["forecast"])
    v = _validator("air_quality.schema.json")
    if v:
        errors = [e.message for e in v.iter_errors(out)]
        assert not errors, errors


def test_mocks_match_contracts():
    v_aq, v_school = _validator("air_quality.schema.json"), _validator("school.schema.json", "School")
    if not v_aq:
        print("  (jsonschema not installed: skipped contract validation)")
        return
    for name, v in (("forecast.json", v_aq), ("school.json", v_school)):
        errors = [e.message for e in v.iter_errors(load_json(MOCKS / name))]
        assert not errors, (name, errors)


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"{len(tests)} passed")
