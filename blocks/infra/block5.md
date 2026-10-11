# Infra 5: Agent wiring and async protocol

Scope: infra/template.yaml, infra/lambda/handlers.py, infra/README.md

Tasks:
- Confirm POST /schools/{id}/protocol returns 202 and async-invokes the agent Lambda
- Set the agent Lambda timeout and memory above the measured Bedrock latency
- Confirm the package including strands-agents builds and stays under Lambda size limits
- Confirm the plan lands in the plans table and appears in GET /today
- Report any handler change needed outside infra/ instead of editing it

Done when: POST then GET /today shows a generated plan, and the response states which engine produced it.
