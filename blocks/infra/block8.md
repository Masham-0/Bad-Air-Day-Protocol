# Infra 8: Demo evidence and cost safety

Scope: docs/aws-setup.md, docs/architecture.md, infra/README.md

Tasks:
- Run the full core loop on the live URL and record the result
- List the console views needed in the 3-minute video: Lambda, DynamoDB, Bedrock, SNS, EventBridge, API Gateway, Amplify
- Update docs/architecture.md to match what is actually deployed
- Add a billing alert and note the teardown command: sam delete
- Note which pieces are verified live and which still fall back to mocks

Done when: Every AWS service named in the rules can be shown from the console, and the docs match the deployed stack.
