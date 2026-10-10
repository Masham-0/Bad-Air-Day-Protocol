"""Storage in CLAUDE.md's pattern: every item is {school_id (PK), sk (SK), doc}, doc = the contract JSON.

  schools  sk=profile          School
  plans    sk=plan#<date>      ProtocolResponse     sk=notices#<date>  ParentNoticeResponse
           sk=basis#<date>     the inputs the plan cites
  alerts   sk=alert#<sent_at>  alert record
<date> is the IST school day being planned.

MemoryStore needs nothing. DynamoStore is the same thing on DynamoDB (boto3); `aws_sim()` starts it on a
moto-simulated AWS with an SNS topic, so the deployed storage and email paths can be rehearsed locally.
"""
import json
import threading

TABLES = ("schools", "plans", "alerts")


class MemoryStore:
    kind = "memory"

    def __init__(self):
        self._items, self._lock = {}, threading.Lock()

    def put(self, table, school_id, sk, doc):
        with self._lock:
            self._items[(table, school_id, sk)] = json.dumps(doc, ensure_ascii=False)

    def get(self, table, school_id, sk):
        raw = self._items.get((table, school_id, sk))
        return json.loads(raw) if raw else None

    def query(self, table, school_id, prefix, limit=20):
        """Newest first (sort keys descending), like a DynamoDB query with ScanIndexForward=False."""
        with self._lock:
            keys = sorted((k for k in self._items if k[0] == table and k[1] == school_id and k[2].startswith(prefix)),
                          reverse=True)[:limit]
            return [json.loads(self._items[k]) for k in keys]

    def scan(self, table, sk):
        with self._lock:
            return [json.loads(v) for k, v in sorted(self._items.items()) if k[0] == table and k[2] == sk]


class DynamoStore:
    kind = "dynamodb"

    def __init__(self, names):
        import boto3
        self._t = {t: boto3.resource("dynamodb").Table(names[t]) for t in TABLES}

    def put(self, table, school_id, sk, doc):
        self._t[table].put_item(Item={"school_id": school_id, "sk": sk, "doc": json.dumps(doc, ensure_ascii=False)})

    def get(self, table, school_id, sk):
        item = self._t[table].get_item(Key={"school_id": school_id, "sk": sk}).get("Item")
        return json.loads(item["doc"]) if item else None

    def query(self, table, school_id, prefix, limit=20):
        from boto3.dynamodb.conditions import Key
        resp = self._t[table].query(KeyConditionExpression=Key("school_id").eq(school_id) & Key("sk").begins_with(prefix),
                                    ScanIndexForward=False, Limit=limit)
        return [json.loads(i["doc"]) for i in resp.get("Items", [])]

    def scan(self, table, sk):
        from boto3.dynamodb.conditions import Attr
        items = self._t[table].scan(FilterExpression=Attr("sk").eq(sk)).get("Items", [])
        return [json.loads(i["doc"]) for i in sorted(items, key=lambda i: i["school_id"])]


def aws_sim(region="us-east-1"):
    """Start moto, create the tables and an SNS topic with an SQS queue subscribed (to read what was sent).
    Returns (DynamoStore, sns_topic_arn, sqs_queue_url, mock)."""
    import os

    import boto3
    from moto import mock_aws

    os.environ.setdefault("AWS_DEFAULT_REGION", region)
    mock = mock_aws()
    mock.start()
    ddb = boto3.client("dynamodb")
    for t in TABLES:
        ddb.create_table(TableName=f"badair-{t}", BillingMode="PAY_PER_REQUEST",
                         AttributeDefinitions=[{"AttributeName": "school_id", "AttributeType": "S"},
                                               {"AttributeName": "sk", "AttributeType": "S"}],
                         KeySchema=[{"AttributeName": "school_id", "KeyType": "HASH"},
                                    {"AttributeName": "sk", "KeyType": "RANGE"}])
    sns, sqs = boto3.client("sns"), boto3.client("sqs")
    topic = sns.create_topic(Name="bad-air-alerts")["TopicArn"]
    queue = sqs.create_queue(QueueName="bad-air-alerts-capture")["QueueUrl"]
    q_arn = sqs.get_queue_attributes(QueueUrl=queue, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    sns.subscribe(TopicArn=topic, Protocol="sqs", Endpoint=q_arn)
    return DynamoStore({t: f"badair-{t}" for t in TABLES}), topic, queue, mock
