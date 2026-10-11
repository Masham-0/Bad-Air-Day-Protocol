"""GET /schools/{id}/protocol, /notices and /basis.

The first request of the day stores a plan. This function runs with AGENT_ENGINE=rules so it always answers
inside API Gateway's 29 s; the Bedrock plan comes from POST /protocol (generate_protocol) or the 06:00 job."""
from api.handlers.common import handle_http


def handler(event, context):
    return handle_http(event)
