"""Local stand-in for the SAM stack: moto-simulated DynamoDB (5 tables) + SNS topic, env vars set
like template.yaml. If real AWS credentials exist, Bedrock calls pass through to real AWS (so the
Strands agent can run for real); everything else stays simulated. Without them the agent uses
its rules fallback."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "infra" / "lambda"))

TABLES = {"SCHOOLS_TABLE": "schools", "READINGS_TABLE": "readings", "TRACES_TABLE": "traces",
          "PLANS_TABLE": "plans", "ALERTS_TABLE": "alerts"}


def start(offline=False):
    """Start moto, create resources, set env. Returns a dict describing the setup."""
    import boto3
    from moto import mock_aws

    from data.util import load_env
    load_env()
    os.environ.setdefault("AWS_DEFAULT_REGION", os.environ.get("AWS_REGION", "us-east-1"))
    os.environ.setdefault("AWS_REGION", os.environ["AWS_DEFAULT_REGION"])
    real_creds = boto3.Session().get_credentials() is not None
    if real_creds:
        mock = mock_aws(config={"core": {"mock_credentials": False,
                                         "passthrough": {"services": ["bedrock-runtime"]}}})
    else:
        mock = mock_aws()
        os.environ.setdefault("AGENT_ENGINE", "rules")
        os.environ.setdefault("AGENT_RULES_REASON", "no AWS credentials (local moto run)")
    mock.start()

    ddb = boto3.client("dynamodb")
    for env, name in TABLES.items():
        ddb.create_table(TableName=name, BillingMode="PAY_PER_REQUEST",
                         AttributeDefinitions=[{"AttributeName": "school_id", "AttributeType": "S"},
                                               {"AttributeName": "sk", "AttributeType": "S"}],
                         KeySchema=[{"AttributeName": "school_id", "KeyType": "HASH"},
                                    {"AttributeName": "sk", "KeyType": "RANGE"}])
        os.environ[env] = name
    os.environ["ALERT_TOPIC_ARN"] = boto3.client("sns").create_topic(Name="bad-air-alerts")["TopicArn"]
    os.environ["AGENT_INLINE"] = "1"
    if offline:
        os.environ["BADAIR_OFFLINE"] = "1"
    return {"mock": mock, "real_aws_credentials": real_creds, "offline": offline,
            "bedrock": "real (passthrough)" if real_creds else "skipped: rules fallback"}
