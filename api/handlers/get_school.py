"""GET /schools, GET /schools/{id}, PUT /schools/{id} (upsert: 201 new, 200 updated, 400 invalid)."""
from api.handlers.common import handle_http


def handler(event, context):
    return handle_http(event)
