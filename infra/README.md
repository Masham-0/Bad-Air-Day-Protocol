# Infrastructure

The SAM stack in `infra/template.yaml` defines **5 DynamoDB tables, 1 SNS topic, 1 API Gateway HTTP API, and 4 Lambda functions**. The API Lambda supports creating/updating a school and reading its dashboard shell. Ingestion, protocol generation, and alert delivery are completed by later blocks.

## Resources

| Resource | Purpose |
|---|---|
| `SchoolsTable` (`<stack>-schools`) | School configuration, keyed by `school_id` and `sk`. |
| `ReadingsTable` (`<stack>-readings`) | Normalized current air readings and forecast items. |
| `TracesTable` (`<stack>-traces`) | Smoke-trace context items. |
| `PlansTable` (`<stack>-plans`) | Generated daily protocol plans. |
| `AlertsTable` (`<stack>-alerts`) | Alert delivery records. |
| `AlertsTopic` (`<stack>-alerts`) | SNS destination for school alert messages. The stack does not subscribe a personal email address. |
| `BadAirDayHttpApi` | HTTP API entry point for the school routes below. CORS is configured for the web client. |
| `IngestFunction` (`<stack>-ingest`) | Entry point for air-quality and smoke-trace ingestion. |
| `AgentFunction` (`<stack>-agent`) | Entry point for Strands/Bedrock protocol generation. |
| `AlertFunction` (`<stack>-alert`) | Entry point for SNS alert delivery. |
| `ApiFunction` (`<stack>-api`) | HTTP API handler and asynchronous dispatcher for agent and alert work. |
| SAM-generated Lambda roles and API invoke permissions | Give each function the resource access it needs and allow API Gateway to invoke `ApiFunction`. Policies are declared on each function in the template. |

The five tables use on-demand billing and the shared `{school_id (partition key), sk (sort key), doc}` item pattern. DynamoDB server-side encryption is enabled. No EventBridge schedule is included in this baseline; the ingestion and daily-alert blocks add those schedules when their handlers are ready.

The HTTP API routes in this baseline are:

| Method and path | Purpose |
|---|---|
| `GET /schools/{school_id}/today` | Read the dashboard bundle. |
| `POST /schools/{school_id}/protocol` | Dispatch protocol generation. |
| `POST /schools/{school_id}/alert/test` | Dispatch a test alert. |
| `PUT /schools/{school_id}` | Create or update school configuration. |

`PUT /schools/{school_id}` validates a `School` object, stores it in `SchoolsTable` under `{school_id, sk: "SCHOOL", doc}`, and returns it. `GET /schools/{school_id}/today` reads that item and returns it with `air_quality: null`, `protocol: null`, and `notices: []` until the later data and protocol handlers are connected. The ingest, agent, and alert handlers remain placeholders.

## Parameters

| Parameter | Required | Purpose |
|---|---:|---|
| `BedrockModelId` | Yes | Foundation model ID for the agent Lambda's model-scoped Bedrock permissions and `BEDROCK_MODEL_ID` environment variable. Model access must be enabled in the target account and region. |

The Lambda runtime supplies `AWS_REGION`; the template does not override this reserved environment variable. The stack name and region are selected during SAM deployment.

## Outputs

| Output | Value |
|---|---|
| `ApiBaseUrl` | HTTPS base URL for the HTTP API. |
| `SchoolsTableName` | Physical name of the school table. |
| `ReadingsTableName` | Physical name of the readings table. |
| `TracesTableName` | Physical name of the traces table. |
| `PlansTableName` | Physical name of the plans table. |
| `AlertsTableName` | Physical name of the alert records table. |
| `AlertsTopicArn` | SNS topic ARN. |
| `IngestFunctionName` | Ingestion Lambda name. |
| `AgentFunctionName` | Agent Lambda name. |
| `AlertFunctionName` | Alert Lambda name. |
| `ApiFunctionName` | API Lambda name. |

## Build and validate

Use the repository virtual environment for the template linter:

```bash
.venv/bin/python -m pip install -r infra/requirements-dev.txt
bash infra/build.sh
.venv/bin/cfn-lint infra/template.yaml
```

`infra/build.sh` runs `cfn-lint` and compiles the Python handler module. It does not deploy resources or claim the placeholder handlers are functional.

## Build and deploy with SAM

The AWS CLI and AWS SAM CLI are installed in the repository's ignored `.sam-cli-venv`, separate from the application's Python environment. Configure AWS credentials with permissions to create the listed resources, then verify the target account and deploy to `us-east-1`:

```bash
.sam-cli-venv/bin/aws sts get-caller-identity --region us-east-1
.sam-cli-venv/bin/sam build -t infra/template.yaml
.sam-cli-venv/bin/sam deploy --guided --template-file .aws-sam/build/template.yaml --config-file infra/samconfig.toml
```

The checked-in SAM config uses stack name `bad-air-day-protocol-dev`, region `us-east-1`, S3 packaging resolution, and IAM role creation. Guided deploy still prompts for the required `BedrockModelId`; use a model enabled in the target account and region. Credentials belong in the AWS profile/environment and must not be committed here.

After deployment, use the `ApiBaseUrl` output and verify both routes before treating the stack as ready:

```bash
API_BASE_URL="<ApiBaseUrl output>"
SCHOOL_ID="infra-block2-smoke-test"
curl -i -X PUT "$API_BASE_URL/schools/$SCHOOL_ID" \
  -H 'content-type: application/json' \
  -d '{"id":"infra-block2-smoke-test","name":"Infra Block 2 Smoke Test","latitude":28.6139,"longitude":77.2090}'
curl -i "$API_BASE_URL/schools/$SCHOOL_ID/today"
```

Deployment status: **pending AWS credentials in this environment**. `sam build -t infra/template.yaml` succeeds locally. Once deployed and verified, record the stack and URL here:

| Stack name | API base URL | Verification |
|---|---|---|
| Pending | Pending | Pending AWS credentials and deployment |
