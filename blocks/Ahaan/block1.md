# Ahaan 1: API cheat sheet

Scope: api/README.md

Tasks:
- Read CLAUDE.md and contracts/README.md first
- Document exactly four routes: GET /schools/{id}/today, POST /schools/{id}/protocol (202, async), POST /schools/{id}/alert/test, PUT /schools/{id}
- For each route: purpose, request body, response shape (name the contract file), status codes, and a curl example
- Document one error envelope for every failure: {"error": {"code": "...", "message": "..."}}
- State the rules everyone can rely on: no auth, CORS open, all timestamps UTC with Z, base URL comes from NEXT_PUBLIC_API_URL
- Do not invent fields. Anything not in contracts/ is listed under Open questions

Done when: A teammate can call every route from api/README.md alone, and every response shape points to a real file in contracts/.
