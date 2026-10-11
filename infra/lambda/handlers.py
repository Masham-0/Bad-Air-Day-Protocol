"""Lambda entry points for the SAM stack."""

from __future__ import annotations

import json
import os
from typing import Any


def _api_response(status_code: int, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {"content-type": "application/json; charset=utf-8"},
        "body": json.dumps(payload, ensure_ascii=False),
    }


def ingest_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda entry point reserved for source ingestion (Infra Block 4)."""
    return {"status": "not_configured", "component": "ingest"}


def agent_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda entry point reserved for protocol generation (Masham Block 4)."""
    return {"status": "not_configured", "component": "agent"}


def alert_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda entry point reserved for SNS delivery (Infra Block 6)."""
    return {"status": "not_configured", "component": "alert"}


def api_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Upsert a school and return the available dashboard data for a school."""
    route_key = event.get("routeKey", "")
    path_parameters = event.get("pathParameters") or {}
    school_id = path_parameters.get("school_id")
    if not school_id:
        return _api_response(400, {"error": "missing_school_id"})

    if route_key == "PUT /schools/{school_id}":
        return _put_school(event, school_id)
    if route_key == "GET /schools/{school_id}/today":
        return _get_today(school_id)
    return _api_response(501, {"error": "not_implemented", "route": route_key})


def _dynamodb_table():
    """Return the configured DynamoDB table using the Lambda runtime SDK."""
    import boto3

    table_name = os.environ.get("SCHOOLS_TABLE")
    if not table_name:
        raise RuntimeError("SCHOOLS_TABLE is not configured")
    return boto3.resource("dynamodb").Table(table_name)


def _request_body(event: dict[str, Any]) -> dict[str, Any] | None:
    body = event.get("body")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            return None
    return body if isinstance(body, dict) else None


def _put_school(event: dict[str, Any], school_id: str) -> dict[str, Any]:
    school = _request_body(event)
    if school is None:
        return _api_response(400, {"error": "invalid_json_body"})

    if (
        school.get("id") != school_id
        or not isinstance(school.get("name"), str)
        or not school["name"].strip()
        or not isinstance(school.get("latitude"), (int, float))
        or isinstance(school.get("latitude"), bool)
        or not -90 <= school["latitude"] <= 90
        or not isinstance(school.get("longitude"), (int, float))
        or isinstance(school.get("longitude"), bool)
        or not -180 <= school["longitude"] <= 180
        or any(
            key in school and not isinstance(school[key], str)
            for key in ("address", "district")
        )
    ):
        return _api_response(
            400,
            {
                "error": "invalid_school",
                "message": "Provide a School object whose id matches the path, with name, latitude, and longitude.",
            },
        )

    _dynamodb_table().put_item(
        Item={
            "school_id": school_id,
            "sk": "SCHOOL",
            "doc": json.dumps(school, ensure_ascii=False),
        }
    )
    return _api_response(200, {"school": school})


def _get_today(school_id: str) -> dict[str, Any]:
    result = _dynamodb_table().get_item(
        Key={"school_id": school_id, "sk": "SCHOOL"}
    )
    item = result.get("Item")
    if item is None:
        return _api_response(404, {"error": "school_not_found", "school_id": school_id})

    try:
        school = json.loads(item["doc"])
    except (KeyError, TypeError, json.JSONDecodeError):
        return _api_response(500, {"error": "invalid_school_record"})

    # Other dashboard data is filled by the ingestion, agent, and alert blocks.
    return _api_response(
        200,
        {
            "school": school,
            "air_quality": None,
            "protocol": None,
            "notices": [],
        },
    )
