"""Agent view of the air-quality part of the basis: every number with the JSON pointer to cite."""
from data.util import IST, parse_utc


def air_rows(basis):
    """Current reading and the hourly forecast, each with its `ref` and the hour in IST."""
    air = basis["air_quality"]
    rows = [{"ref": f"/air_quality/forecast/{i}/aqi",
             "hour_ist": parse_utc(p["hour"]).astimezone(IST).strftime("%Y-%m-%d %H:%M"),
             "aqi": p["aqi"], "pm25": p["pm25"], "category": p["category"]} for i, p in enumerate(air["forecast"])]
    return {"current": {"ref": "/air_quality/current/aqi", **air["current"]}, "forecast": rows}
