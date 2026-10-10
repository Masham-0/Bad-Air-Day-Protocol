"""Shared stdlib-only helpers: .env loading, HTTP, UTC time, config/mock paths."""
import json
import os
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "data" / "config"
MOCKS = ROOT / "mocks"
USER_AGENT = "bad-air-day-protocol/0.1 (Environmental Hacks 2026)"
IST = timezone(timedelta(hours=5, minutes=30))
MOCK_DAY = date(2026, 10, 12)   # IST school day the synthetic mocks describe


def load_env(path=ROOT / ".env"):
    """Read KEY=VALUE lines from .env into os.environ without overriding what is already set."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        if value:
            os.environ.setdefault(key.strip(), value)


def http_get(url, timeout=20):
    if os.environ.get("BADAIR_OFFLINE") == "1":   # force the mock fallback everywhere (demo/video)
        raise ConnectionError("BADAIR_OFFLINE=1")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


def http_get_json(url, timeout=20):
    return json.loads(http_get(url, timeout))


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_config(name):
    return load_json(CONFIG / f"{name}.json")


def utcnow():
    return datetime.now(timezone.utc)


def iso_z(dt):
    """UTC datetime -> '2026-10-10T09:00:00Z' (the only time format stored in contracts)."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_utc(s):
    """Parse '2026-10-10T09:00', '...:00Z' or '...+00:00' as UTC. Open-Meteo omits the Z."""
    s = s.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def ist_today_at(hhmm, now=None, day=None):
    """HH:MM IST on `day` (default: today in IST) as an aware UTC datetime."""
    day = day or (now or utcnow()).astimezone(IST).date()
    h, m = map(int, hhmm.split(":"))
    return datetime(day.year, day.month, day.day, h, m, tzinfo=IST).astimezone(timezone.utc)


def plan_day(now=None, school=None):
    """The IST school day being planned: today, or tomorrow once today's last slot has ended."""
    now = now or utcnow()
    today = now.astimezone(IST).date()
    if school and school.get("schedule"):
        last_end = max(slot["end"] for slot in school["schedule"])
        if now >= ist_today_at(last_end, day=today):
            return today + timedelta(days=1)
    return today


def mock_shift_days(day):
    """Whole days to add to mock timestamps so the sample scenario lands on `day`."""
    return (day - MOCK_DAY).days if day else 0


def shift_iso(s, days):
    return iso_z(parse_utc(s) + timedelta(days=days)) if days else s
