# Ahaan 2: Local mock API

Scope: api/mock_server.py

Tasks:
- First check scripts/local_api.py. If it already serves all four routes on :8787, document it in api/README.md and skip the new server
- Otherwise write a stdlib-only server on :8787 that serves the four routes from mocks/ with open CORS and the error envelope
- POST /protocol returns 202 and then serves the mock plan on the next GET /today
- No new dependencies

Done when: Anyone runs one command, the web app loads against http://localhost:8787, and all four routes respond.
