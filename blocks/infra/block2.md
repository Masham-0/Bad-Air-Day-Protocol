# Infra 2: Minimal AWS slice

Scope: infra/template.yaml, infra/samconfig.toml, infra/README.md

Tasks:
- Verify aws sts get-caller-identity and set the region to us-east-1
- Run sam build -t infra/template.yaml and sam deploy --guided
- Commit samconfig.toml without secrets
- Verify PUT /schools/{id} then GET /schools/{id}/today against the deployed API with curl
- Record the stack name and API base URL in infra/README.md

Done when: One Lambda invocation, one API Gateway call and one DynamoDB write and read all succeed on the deployed stack.
