# IAM (from infra/template.yaml)

Each function gets only what it uses, through SAM policy templates:

| Function | DynamoDB | Other |
|---|---|---|
| SchoolFunction | schools: CRUD | |
| ForecastFunction | schools: read | |
| ProtocolFunction, DashboardFunction | schools: read; plans: CRUD | |
| GenerateProtocolFunction | schools: read; plans: CRUD | `bedrock:InvokeModel*`; `lambda:InvokeFunction` on itself (async run) |
| AlertsFunction | schools: read; plans + alerts: CRUD | `bedrock:InvokeModel*`; `sns:Publish` on the alert topic |

Bedrock is `Resource: "*"` because inference profiles (`us.*`) route across regions. Narrow it to the
profile and foundation-model ARNs once the model is fixed.
