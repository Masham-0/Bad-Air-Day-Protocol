"""POST /schools/{id}/protocol: regenerate today's plan with the Strands agent on Bedrock.

A Bedrock run can take longer than API Gateway's 29 s, so the HTTP call only queues the work: this function
invokes itself asynchronously with {"school_id": ...} and answers 202. The async run stores the new plan, and
the web app sees it on its next GET /protocol (generator.engine = "strands-bedrock", is_fallback = false).
"""
import json
import os

from api.handlers.common import ApiError, handle_http, request_parts, response, service

SELF = os.environ.get("SELF_FUNCTION_NAME")


def handler(event, context):
    if "school_id" in event:                                   # the async run
        plan = service().protocol(event["school_id"], regenerate=True)
        return {"school_id": plan["school_id"], "date": plan["date"], "engine": plan["generator"]["engine"],
                "fallback_reason": plan["generator"].get("fallback_reason")}
    if not SELF:                                               # local runs: regenerate inline
        return handle_http(event)
    try:
        method, path, _ = request_parts(event)
        parts = path.strip("/").split("/")
        if method != "POST" or len(parts) != 3 or parts[0] != "schools" or parts[2] != "protocol":
            raise ApiError(404, "not_found", f"no route {method} {path}")
        service().school(parts[1])                             # 404 for an unknown school
        import boto3
        boto3.client("lambda").invoke(FunctionName=SELF, InvocationType="Event",
                                      Payload=json.dumps({"school_id": parts[1]}).encode())
        return response(202, {"status": "accepted", "school_id": parts[1],
                              "poll": f"/schools/{parts[1]}/protocol"})
    except ApiError as e:
        return response(e.status, {"error": {"code": e.code, "message": e.message}})
