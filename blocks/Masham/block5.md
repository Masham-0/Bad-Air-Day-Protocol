# Masham 5: Output validation and tests

Scope: agent/src/bad_air_agent/output_validator.py, agent/tests/

Tasks:
- Validate agent output against contracts/protocol.schema.json
- Reject plans whose decisions contradict the policy module
- Tests for valid, malformed and policy-violating outputs

Done when: test_output_schema.py and test_agent.py pass.
