# Infra 3: IAM and Bedrock permissions

Scope: infra/template.yaml, infra/policies/iam-policies.md

Tasks:
- Give each Lambda a role with only what it needs: agent gets bedrock:InvokeModel and InvokeModelWithResponseStream plus DynamoDB access, alert gets SNS publish, api gets lambda:InvokeFunction on agent, ingest gets table write
- Pass BEDROCK_MODEL_ID and AWS_REGION as parameters and environment variables for the agent
- Confirm model access is enabled in the Bedrock console and run a one-line converse test
- Document each role and why in infra/policies/iam-policies.md

Done when: The agent Lambda can call Bedrock, and no role uses a wildcard action beyond what the document justifies.
