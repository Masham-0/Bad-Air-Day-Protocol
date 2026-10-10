"""Validate every contract mock against /contracts. Prints OK per file; exits 1 on any failure."""
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent.parent
MOCK_SCHEMAS = {
    "school.json": "school.schema.json",
    "forecast.json": "forecast.schema.json",
    "trace-now.json": "trace.schema.json",
    "trace-afternoon.json": "trace.schema.json",
    "protocol.json": "protocol.schema.json",
    "alert.json": "alert.schema.json",
    "today-bundle.json": "today-bundle.schema.json",
}


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def main():
    schemas = {p.name: load(p) for p in (ROOT / "contracts").glob("*.schema.json")}
    registry = Registry().with_resources((name, Resource.from_contents(s)) for name, s in schemas.items())
    failed = 0
    for mock, schema_name in MOCK_SCHEMAS.items():
        path = ROOT / "mocks" / mock
        if not path.exists():
            print(f"MISSING mocks/{mock}")
            failed += 1
            continue
        data = load(path)
        v = Draft202012Validator(schemas[schema_name], registry=registry, format_checker=FormatChecker())
        errors = sorted(v.iter_errors(data), key=lambda e: list(e.absolute_path))
        sources = {o.get("source") for o in (data, data.get("air"), data.get("plan")) if isinstance(o, dict) and "source" in o}
        if sources - {"sample"}:
            errors.append(f"mock has source {sources}, expected 'sample'")
        if errors:
            failed += 1
            print(f"FAIL mocks/{mock} ({schema_name})")
            for e in errors[:10]:
                where = "/" + "/".join(map(str, e.absolute_path)) if hasattr(e, "absolute_path") else ""
                print(f"   {where}: {getattr(e, 'message', e)}")
        else:
            print(f"OK   mocks/{mock} ({schema_name})")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
