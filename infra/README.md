# Backend deploy (SAM)

**DRAFT, 11 Oct 2026.** Ported from Ahaan's prototype 2 (`sandbox2/` on `sandbox-A`) into the skeleton's empty
files. It still needs Krishna's (infra, handlers) and Masham's (agent) OK.

One package serves every Lambda: `infra/build.sh` copies `data/`, `contracts/`, `mocks/`,
`agent/src/bad_air_agent/` and `api/handlers/` into `.build/backend` and pip-installs `infra/requirements.txt`
for Linux x86_64 / Python 3.12 (about 100 MB).

## Deploy

You need the AWS CLI with credentials, SAM CLI, and Bedrock model access for `BedrockModelId` in the region
(console → Bedrock → Model access; the default is `us.amazon.nova-pro-v1:0` in us-east-1).

```bash
bash infra/build.sh
sam deploy -t infra/template.yaml --stack-name bad-air-day --region us-east-1 --resolve-s3 \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --no-confirm-changeset \
  --parameter-overrides AlertEmail=you@example.com SampleData=false
# AlertEmail is optional (click the SNS confirmation email). The same settings are in infra/samconfig.toml.
```

The stack output `ApiUrl` is the web app's `NEXT_PUBLIC_API_BASE_URL` (no trailing slash; set
`NEXT_PUBLIC_USE_MOCK=false`). Then check it:

```bash
python api/tests/smoke_api.py "$API_URL"                         # 7 checks on Yash's routes
curl -X POST "$API_URL/schools/sch_dwarka_02/protocol"            # 202; the Bedrock plan lands in ~10-60 s
curl "$API_URL/schools/sch_dwarka_02/protocol" | jq .generator   # engine "strands-bedrock" once it has run
curl -X POST "$API_URL/schools/sch_dwarka_02/alerts"              # sends the EN + HI email through SNS
```

If `generator.engine` stays `"rules"`, its `fallback_reason` says why (no model access, wrong model ID, bad JSON).
`aws logs tail /aws/lambda/bad-air-day-generate-protocol --follow` shows the agent's output.

## What runs where

| Function | Handler | Routes / trigger | Timeout |
|---|---|---|---|
| SchoolFunction | `api/handlers/get_school.py` | `GET /schools`, `GET /schools/{id}`, `PUT /schools/{id}` | 29 s |
| ForecastFunction | `api/handlers/get_forecast.py` | `GET /schools/{id}/air-quality`, `GET /schools/{id}/smoke` | 29 s |
| ProtocolFunction | `api/handlers/get_protocol.py` | `GET /schools/{id}/protocol`, `/notices`, `/basis` (rules plan if none stored yet) | 29 s |
| DashboardFunction | `api/handlers/get_dashboard.py` | `GET /schools/{id}/dashboard` | 29 s |
| GenerateProtocolFunction | `api/handlers/generate_protocol.py` | `POST /schools/{id}/protocol` → 202, then runs the Strands agent async | 180 s |
| AlertsFunction | `data/alerts/handler.py` | EventBridge `cron(30 0 * * ? *)` (06:00 IST): plan + email every school; `POST`/`GET /schools/{id}/alerts` | 300 s |

All shared logic is in `api/handlers/common.py`. Tables are `schools`, `plans` and `alerts`, each storing
`{school_id, sk, doc}`. Schools are seeded from `contracts/examples/sample_schools.json` on first use.

## Data and labels

- Air: CAMS via Open-Meteo, live. Smoke: Open-Meteo wind + NASA FIRMS public VIIRS CSV, live. Each falls back
  to `mocks/`, and then `current.source` starts with `SAMPLE:`, the plan has `sample: true` and the email subject
  starts with `[SAMPLE]`. The `sources` field on the protocol lists what was used.
- To film the "smoke by 14:00 → PE indoors" story on a day with easterly wind, redeploy with
  `SampleData=true` (sets `BADAIR_OFFLINE=1`: the labelled sample day, shifted onto today).

## Test without AWS

```bash
python agent/tests/test_agent.py        # 10: rules plan, citations, bilingual notices, fallback, web fields
python api/tests/test_handlers.py       # 6: every handler via HTTP API events; DynamoDB + SNS on moto if installed
python scripts/local_backend.py         # the handlers on :8000 for the web app and smoke_api.py
```

## Not verified yet

- A real deploy and a real Bedrock call (written against strands-agents 1.x; checked that it imports and falls
  back cleanly in the `public.ecr.aws/lambda/python:3.12` image).
- SNS email to a real inbox (checked on moto via an SQS subscription).
- `data/alerts/message_builder.py` and `sns_publisher.py` stay empty: the email is built in `common.py`.
