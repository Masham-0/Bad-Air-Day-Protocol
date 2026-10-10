"""Build the two traces for a school day: arriving now, and arriving at 14:00 IST (afternoon PE)."""
from data.smoketrace.sources import GridWind, fetch_fires
from data.smoketrace.trace import build_trace
from data.util import IST, ist_today_at, mock_shift_days, utcnow  # noqa: F401 - IST re-exported

AFTERNOON_IST = "14:00"


def build_today_traces(school, now=None, day=None, wind=None, fires=None, fire_source=None, **params):
    """{'now': trace, 'afternoon': trace}. Loads live wind/fires (mock fallback, shifted onto `day`)
    unless given. For a future day the afternoon trace assumes recent fire activity persists."""
    now = now or utcnow()
    day = day or now.astimezone(IST).date()
    shift = mock_shift_days(day)
    wind = wind or GridWind.load(mock_shift_days=shift)
    if fires is None:
        fires, fire_source = fetch_fires(mock_shift_days=shift)
    common = dict(wind_source=wind.source, fire_source=fire_source or "sample", generated_at=now, **params)
    return {
        "now": build_trace(school, wind, fires, now.replace(minute=0, second=0, microsecond=0), "now", **common),
        "afternoon": build_trace(school, wind, fires, ist_today_at(AFTERNOON_IST, day=day), "forecast", **common),
    }
