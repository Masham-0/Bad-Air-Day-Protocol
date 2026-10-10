# Ahaan 4: Protocol generation

Scope: api/handlers/generate_protocol.py, api/services/protocol_service.py

Tasks:
- Call Masham's generate_protocol function, persist the validated plan, return it
- Fall back to the latest stored plan on agent failure and flag it in the response

Done when: Generation works with a stubbed agent and failure fallback is tested.
