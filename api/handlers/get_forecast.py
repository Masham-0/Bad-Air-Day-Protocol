"""GET /schools/{id}/air-quality (AirQualityResponse) and GET /schools/{id}/smoke (indicative smoke traces).

Each falls back to the labelled sample data in mocks/ when Open-Meteo or FIRMS fails."""
from api.handlers.common import handle_http


def handler(event, context):
    return handle_http(event)
