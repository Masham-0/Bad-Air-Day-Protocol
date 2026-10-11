"""GET /schools/{id}/dashboard: school, air quality and protocol in one call (one cold start, not three)."""
from api.handlers.common import handle_http


def handler(event, context):
    return handle_http(event)
