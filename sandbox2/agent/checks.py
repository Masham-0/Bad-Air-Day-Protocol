"""Checks every generated document must pass: Yash's contracts (Draft-07, when jsonschema is installed)
and the citation rule (every `ref` resolves in the basis to the cited `value`)."""
import json
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACTS = ROOT / "contracts"
SCHEMAS = {"school": "school.schema.json", "air_quality": "air_quality.schema.json",
           "protocol": "protocol.schema.json", "parent_notice": "parent_notice.schema.json"}


@lru_cache(maxsize=None)
def _validator(name):
    try:
        from jsonschema import Draft7Validator, FormatChecker
    except ImportError:
        print("[checks] jsonschema not installed; contract checks skipped", file=sys.stderr)
        return None
    schema = json.loads((CONTRACTS / SCHEMAS[name]).read_text(encoding="utf-8"))
    return Draft7Validator(schema, format_checker=FormatChecker())


def contract_errors(doc, name):
    """Human-readable errors validating doc against contracts/<name>; [] if valid or jsonschema is missing."""
    v = _validator(name)
    if v is None:
        return []
    return [f"/{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in v.iter_errors(doc)]


def resolve_pointer(doc, ref):
    cur = doc
    for raw in ref.lstrip("/").split("/"):
        part = raw.replace("~1", "/").replace("~0", "~")
        cur = cur[int(part)] if isinstance(cur, list) else cur[part]
    return cur


def _same(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 0.051 + 0.001 * abs(b)
    return a == b


def citation_errors(protocol, basis):
    """Every citation in the protocol (top level and per activity) must resolve in `basis` to its value."""
    items = [("overall", protocol)] + [(a.get("activity", "?"), a) for a in protocol.get("activities", [])]
    errs = []
    for where, item in items:
        for c in item.get("citations", []):
            try:
                actual = resolve_pointer(basis, c["ref"])
            except (KeyError, IndexError, ValueError, TypeError):
                errs.append(f"{where}: ref {c.get('ref')} does not exist in the basis")
                continue
            if not _same(c.get("value"), actual):
                errs.append(f"{where}: ref {c['ref']} is {actual!r}, cited {c.get('value')!r}")
    for a in protocol.get("activities", []):
        if not a.get("citations"):
            errs.append(f"{a.get('activity', '?')}: no citations")
    return errs
