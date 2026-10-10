# Ahaan 3: Route smoke test

Scope: api/tests/smoke_api.py

Tasks:
- stdlib-only script taking a base URL argument, default http://localhost:8787
- Hit all four routes, print PASS or FAIL per route with the status code
- Validate the GET /today body against the TodayBundle schema in contracts/ using jsonschema
- Check that an unknown school returns 404 with the error envelope
- Check the CORS header is present

Done when: The script prints PASS for every route against the local server and exits non-zero on any failure.
