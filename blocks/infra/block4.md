# Infra 4: Ingestion schedule and data path

Scope: infra/template.yaml, infra/README.md

Tasks:
- Add an hourly EventBridge schedule for the ingest Lambda
- Pass FIRMS_MAP_KEY as an optional template parameter marked NoEcho, never in the repo
- Invoke ingest manually and confirm items appear in the readings and traces tables
- Confirm the mock fallback works when an external call fails
- Set timeout and memory large enough for the live calls, which took about 15 s

Done when: After a manual invoke, readings and traces contain items, and GET /today returns a bundle that validates against the TodayBundle contract.
