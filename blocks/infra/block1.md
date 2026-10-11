# Infra 1: Baseline audit and tooling

Scope: infra/README.md

Tasks:
- Read CLAUDE.md, infra/template.yaml, infra/lambda/handlers.py and infra/build.sh
- Confirm the template defines 5 tables, 1 SNS topic, 1 HTTP API and 4 Lambdas (ingest, agent, alert, api)
- Run bash infra/build.sh and cfn-lint infra/template.yaml, and report the results
- Write infra/README.md listing resources, parameters, outputs and how to build and deploy
- Do not add services beyond those in CLAUDE.md

Done when: build.sh and cfn-lint pass, and infra/README.md lists every resource with its purpose.
