"""JSON Schema validation against /contracts (shared by agent, handlers and scripts)."""
import json
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

CONTRACTS = Path(__file__).resolve().parent.parent / "contracts"


@lru_cache(maxsize=None)
def _registry():
    schemas = {p.name: json.loads(p.read_text(encoding="utf-8")) for p in CONTRACTS.glob("*.schema.json")}
    return schemas, Registry().with_resources((n, Resource.from_contents(s)) for n, s in schemas.items())


def errors(obj, name):
    """List of human-readable errors validating obj against contracts/<name>.schema.json."""
    schemas, reg = _registry()
    v = Draft202012Validator(schemas[f"{name}.schema.json"], registry=reg)
    return [f"/{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in v.iter_errors(obj)]
