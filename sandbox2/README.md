# Prototype 2 (sandbox2)

A working prototype of the whole core loop, built on `dev`'s shapes: Yash's snake_case contracts and four routes,
our data layer and smoke trace, then a planner, EN/HI parent notices, an alert email and a dashboard on top.
It exists to answer the open questions in `dev`'s `api/README.md` with running code, so the team can copy
whatever it likes. **It is not the deployed backend** (that's Krishna's SAM stack) and nothing here edits `dev`.

Python 3.11+, standard library only. boto3 + moto are optional (simulated AWS), and strands-agents + AWS
credentials are optional (the Bedrock agent).

## Run it

```bash
cd ~/Desktop/shawarma-sandbox            # the sandbox-A worktree
python sandbox2/api/server.py            # sample day on http://localhost:8000 (dashboard on /)
python sandbox2/api/server.py --live     # live Open-Meteo + NASA FIRMS; each source falls back to the sample
python sandbox2/api/server.py --aws-sim  # DynamoDB + SNS on moto (needs boto3 + moto)
python sandbox2/api/server.py --schedule # also run the daily job at 06:00 IST, like EventBridge
```

Open **localhost:8000**. Dashboard options: `?school=sch_rohini_03`, `?lang=hi`, `?api=http://other-host:8000`.
It opens on `sch_dwarka_02` because that school's sample day has the video hook (smoke likely by 14:00, so
afternoon sport moves off the field). Anand Vihar's sample day stays under the smoke threshold (132 of 150 MW).

Yash's Next.js app also works against this server, because the four routes keep his shapes:
`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 NEXT_PUBLIC_USE_MOCK=false npm run dev`.

## Tests

```bash
python sandbox2/tests/test_planner.py    # 10 tests: rules, notices, citation rule, School checks
python sandbox2/tests/test_api.py        # 11 tests: every route in process (+ the alert on moto SNS if installed)
python sandbox2/tests/e2e.py             # 15 steps over real HTTP; also --live, --aws-sim, --url <running server>
python api/tests/smoke_api.py            # dev's route smoke test (run from the dev checkout): 7/7 against this server
```

Results on 11 Oct 2026, ~01:45 IST: planner 10/10 and API 11/11 (contract checks and moto SNS ran under a venv
with jsonschema + moto), e2e 15/15 for sample data on memory and on moto, and 14/14 live. On live data the
demo-story step is reported as a NOTE and not counted, because it depends on the day's wind. That night it said
"no smoke on today's 14:00 path".

## What's where

| Path | What |
|---|---|
| `data/`, `mocks/`, `contracts/` | Snapshot of `dev` at 65a45c1 (our data layer, mocks, Yash's contracts). Don't edit `dev` from here |
| `config/protocol_rules.json` | Team rule for the planner: AQI limits per activity intensity, status bands, smoke step, default schedule (EN + HI) |
| `agent/rules.py` | Deterministic planner: each slot's worst forecast AQI → outdoors / indoors / restricted; smoke makes afternoon slots one step stricter |
| `agent/protocol_agent.py` | Optional Strands agent on Bedrock. Its output must pass the contract, the citation rule and the slot list, with one repair retry; anything else falls back to the rules plan (`generator.fallback_reason`) |
| `agent/checks.py` | Contract validation (when jsonschema is installed) and the citation rule: every `ref` must resolve in the basis to the cited `value` |
| `agent/notices.py` | EN + HI parent notices for the plan, plus a smoke notice when smoke is likely |
| `api/service.py` | Routes' logic, caching, daily job, alert email (`.eml` to `outbox/`, plus SNS when configured) |
| `api/store.py` | Memory store, or DynamoDB (`{school_id, sk, doc}`, as in CLAUDE.md) on moto |
| `api/server.py` | HTTP server: routes, CORS, error envelope, static dashboard |
| `web/` | No-build dashboard: `index.html`, `style.css`, `app.js` |
| `tests/` | The tests above |

## Routes

Yash's four routes keep his contract shapes. Extra fields are added only where the schemas allow them (none
of the contracts sets `additionalProperties: false`).

| Route | Returns |
|---|---|
| `GET /schools` | SchoolListResponse |
| `GET /schools/{id}/air-quality` | AirQualityResponse |
| `GET /schools/{id}/protocol` | ProtocolResponse, generated on the first request of the day |
| `GET /schools/{id}/notices[?lang=en,hi]` | ParentNoticeResponse |
| `GET /schools/{id}/smoke` | `{"now": trace, "afternoon": trace}` (proposed) |
| `POST /schools/{id}/protocol` | regenerates the plan now → ProtocolResponse (proposed) |
| `POST /schools/{id}/alerts` · `GET /schools/{id}/alerts` | sends the alert email now → 201 · history, newest first (proposed) |
| `GET /schools/{id}` · `PUT /schools/{id}` | one School · upsert (201 new, 200 updated, 400 invalid) (proposed) |
| `GET /schools/{id}/basis` | the inputs the plan's citations point into (proposed) |
| `POST /jobs/daily` | what EventBridge would run at 06:00 IST: plan and alert every school (proposed) |
| `GET /health` | store kind, SNS on or off |

## The open questions, answered in code

Numbers match "Open questions" in `dev`'s `api/README.md`. These are proposals. Each one still needs its owner's OK.

| # | Question | What the prototype does |
|---|---|---|
| 1 | Smoke has no route or contract | `GET /schools/{id}/smoke` returns both traces in the `mocks/trace-*.json` shape. The dashboard draws it as a map with a Now/14:00 toggle. Still needs a contract (Yash, Krishna) |
| 2 | Nothing triggers the plan; what does GET return before one exists? | `GET /protocol` generates and stores the plan on first request, so there's never a 404 for a known school. `POST /protocol` regenerates, and `POST /jobs/daily` (EventBridge stand-in) plans every school |
| 3 | The alert email has no route | `POST /schools/{id}/alerts` sends one email with both notices (EN then HI). It always writes an `.eml` to `outbox/`, and also publishes to SNS when a topic is configured. `GET` lists what was sent. The subject starts with `[SAMPLE]` on sample data |
| 4 | No school create/update; where does the list come from? | `PUT /schools/{id}` upserts (checked against the School contract), stored as `schools / profile`. The store is seeded from `contracts/examples/sample_schools.json` on first start |
| 5 | No sample flag | Keeps the `"SAMPLE:"` prefix in `current.source`, adds `sample: true` to the protocol, and starts notices with a bold "SAMPLE DATA" line. The dashboard shows a SAMPLE badge |
| 6 | Hindi | Two notices per kind, using the contract's own `lang` field (`?lang=` filters). The protocol adds `overall_message_hi` and `activities[].hi` (`activity`, `reason`, `alternative`) |
| 7 | No citations field | `citations: [{ref, value, note}]` on the protocol and on every activity. Each `ref` is a JSON pointer into `GET /basis` (e.g. `/air_quality/forecast/5/aqi`, `/smoke/afternoon/smoke_likely`), and the citation check rejects any plan whose numbers don't match |
| 8 | Error codes only proposed | Every error is `{"error": {"code", "message"}}` with `bad_request`, `not_found`, `method_not_allowed` or `internal`. 500s never leak a stack trace |
| 9 | Example AQI uses old breakpoints | Not changed (it's Yash's example file). Every AQI the prototype serves comes from the data layer's 2024 breakpoints |
| 10 | `alternative: null` vs the schema | `alternative` is left out when the decision is `outdoors`, so the schema stays as it is |

## Not verified

- **A real Bedrock call.** With no AWS credentials on this machine, every plan so far came from the rules
  planner (`fallback_reason: "boto3 not installed"` or `"AGENT_ENGINE=rules"`). The agent path is written
  against strands-agents 1.59, and its output goes through the same checks as the rules plan.
- **Real SNS email.** Only checked on moto (an SQS queue subscribed to the topic).
- **The dashboard buttons.** Regenerate, Send test alert and Run 06:00 job were checked through the routes behind
  them (e2e), not clicked in a real browser. Screenshots were checked at 1280 px, 390 px (Hindi) and in dark mode.

## Timing (live data, laptop)

The first `GET /smoke` took about 10 s (wind grid + FIRMS). `POST /jobs/daily` took about 21 s for 3 schools,
run one after another. That's fine for a scheduled Lambda but too close to API Gateway's 29 s limit to call over
HTTP with more schools. On AWS the job should be the EventBridge → Lambda path, not an API route.
