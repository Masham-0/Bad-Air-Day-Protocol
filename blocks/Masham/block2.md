# Masham 2: Deterministic policy module

Scope: agent/src/bad_air_agent/tools/activity_policy.py, agent/tests/

Tasks:
- Implement a versioned, pure-function policy mapping PM2.5/AQI band to decisions per activity (assembly, PE, recess, ventilation)
- Keep AQI standard and units explicit
- Unit tests for every band boundary

Done when: All boundary tests pass and no LLM call is involved.
