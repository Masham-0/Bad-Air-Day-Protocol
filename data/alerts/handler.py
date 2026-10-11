"""Alerts Lambda.

  EventBridge cron(30 0 * * ? *) = 06:00 IST: regenerate every school's plan (Strands agent on Bedrock, rules
  fallback) and email the EN + HI parent notices through SNS.
  POST /schools/{id}/alerts: send the alert for today's plan now (for the video); GET lists what was sent.
"""
from api.handlers.common import handle_http, service


def handler(event, context):
    if event.get("source") == "aws.events" or event.get("detail-type") == "Scheduled Event":
        return service().daily_job()
    return handle_http(event)
