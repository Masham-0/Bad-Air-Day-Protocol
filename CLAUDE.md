# Infrastructure guardrails

These rules apply to infrastructure changes in this repository.

- Use AWS SAM and CloudFormation for stack resources.
- The baseline stack contains five DynamoDB tables (`schools`, `readings`, `traces`, `plans`, `alerts`), one SNS topic, one API Gateway HTTP API, and four Lambda functions (`ingest`, `agent`, `alert`, `api`).
- The only AWS services to add to the template are Lambda, DynamoDB, SNS, API Gateway HTTP APIs, IAM, CloudWatch Logs, and EventBridge when a numbered Infra block calls for a schedule. Bedrock model invocation is performed by the agent Lambda under an explicit model-scoped IAM permission.
- Amplify hosting is configured outside the SAM template in the hosting block. Do not add Cognito, SQS, Step Functions, VPC resources, SMS subscriptions, or other services without a project decision.
- Use one least-privilege execution role per Lambda. Never use wildcard IAM actions. Keep resources and environment variables specific to the function's job.
- Do not commit credentials, API keys, personal email addresses, or account-specific stack outputs. Use parameters and environment configuration for deployment-specific values.
- Keep Lambda handlers in `infra/lambda/handlers.py` until a block explicitly moves them. Keep the documented API routes and shared JSON contracts aligned.
- Mark all sample or fallback data as fixture data. Never describe it as a live observation.
