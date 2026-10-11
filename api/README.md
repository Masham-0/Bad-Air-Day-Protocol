# API cheat sheet

The four routes the web app calls (`web/src/lib/api-client.ts`). Every response shape is a file in `contracts/`, with an
example in `contracts/examples/`. Anything without a contract yet is listed under [Open questions](#open-questions).

## Rules you can rely on

- **Base URL:** `NEXT_PUBLIC_API_BASE_URL`, with no trailing slash. The client defaults to `http://localhost:8000`.
- **Mock mode:** `NEXT_PUBLIC_USE_MOCK` is **on unless it's exactly `"false"`**. In mock mode the client never calls the API;
  it serves the `contracts/examples` data inlined in `api-client.ts`. Set it to `false` to use the API.
- **No auth.** There are no API keys, cookies or Cognito.
- **CORS is open.** The client sends `Content-Type: application/json` even on GET requests, so browsers send a preflight
  `OPTIONS` first. The API must answer `OPTIONS` with `204` and these headers: `Access-Control-Allow-Origin: *`,
  `Access-Control-Allow-Headers: content-type`, `Access-Control-Allow-Methods: GET, OPTIONS`.
- **JSON everywhere:** `content-type: application/json; charset=utf-8`.
- **Timestamps** are ISO 8601 `date-time` values:
  - The backend sends **UTC with `Z`** (`2026-10-12T01:00:00Z`).
  - The contract examples use `+05:30` offsets. Both are valid, so parse them as dates and never compare the strings.
  - Display everything in IST.
- **`date`** fields are IST calendar dates (`YYYY-MM-DD`).
- **AQI:**
  - The contracts use US-EPA categories (`good`, `moderate`, `unhealthy_sensitive`, `unhealthy`, `very_unhealthy`, `hazardous`).
  - The backend computes the AQI from PM2.5 using the EPA's February 2024 breakpoints (`data/config/bands.json`), applied
    to each hourly model value. That makes it indicative, not an official reading.
- **Sample data:** the contracts have no sample flag, so sample readings carry `current.source` starting with `"SAMPLE:"`.
  Show a SAMPLE badge whenever it does.
- **Timeout:** API Gateway cuts requests off at **29 s**.

## Error envelope

Every failure, on every route, returns this body with the matching status code:

```json
{"error": {"code": "not_found", "message": "unknown school sch_nope"}}
```

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | A path parameter is malformed |
| 404 | `not_found` | Unknown school id or unknown route |
| 500 | `internal` | Anything unexpected. `message` never contains a stack trace |

The current client checks only the status code (`apiFetch` throws when `!res.ok`), so `message` is for people and logs.

## Routes

```bash
API=${NEXT_PUBLIC_API_BASE_URL:-http://localhost:8000}
```

### 1. `GET /schools`

**Purpose:** the list of schools for the school selector.

- **200:** `SchoolListResponse`, per `contracts/school.schema.json` (example: `contracts/examples/sample_schools.json`):
  `{"schools": [{"id", "name", "address"?, "latitude", "longitude", "district"?}]}`
- **500:** unexpected error.

```bash
curl -s "$API/schools"
```

### 2. `GET /schools/{id}/air-quality`

**Purpose:** PM2.5 now, plus an hourly forecast for the next 24 hours.

- **200:** `AirQualityResponse`, per `contracts/air_quality.schema.json` (example: `contracts/examples/sample_readings.json`):
  - `current`: `{aqi, pm25, pm10?, category, source, recorded_at}`
  - `forecast`: 24 × `{hour, aqi, pm25, category}`, starting the hour after `current`
  - `metadata`: `{request_id, generated_at, cache_ttl_seconds?}`. `request_id` is **unique per request**, even when
    the data is cached; `generated_at` is when the data itself was produced
- **404:** unknown school. **500:** unexpected error.
- **Produced by:** `data/ingest/airquality.py`, via `fetch_forecast(school)`. The data is the CAMS model via Open-Meteo, a
  forecast and not a sensor. If Open-Meteo fails, it falls back to the sample day (`current.source` starts with `"SAMPLE:"`).
  The model is coarse (about 40 km), so nearby schools can show identical values. On 10 Oct, Anand Vihar and Rohini both
  read 58.7 µg/m³ while Dwarka read 105.2.

```bash
curl -s "$API/schools/sch_dwarka_02/air-quality"
```

### 3. `GET /schools/{id}/protocol`

**Purpose:** the day's plan, with one decision per activity.

- **200:** `ProtocolResponse`, per `contracts/protocol.schema.json` (example: `contracts/examples/sample_protocol.json`):
  `{school_id, date, overall_status, overall_message?, activities: [{activity, scheduled_time?, decision, reason, alternative?}], generated_at}`
  - `overall_status` is one of `all_clear`, `caution`, `restricted`, `emergency`.
  - `decision` is one of `outdoors`, `indoors`, `restricted`.
- **404:** unknown school. **500:** unexpected error. (What this route returns before any plan exists is open question 2.)
- **Produced by:** the agent (Masham).

```bash
curl -s "$API/schools/sch_dwarka_02/protocol"
```

### 4. `GET /schools/{id}/notices`

**Purpose:** notices for parents.

- **200:** `ParentNoticeResponse`, per `contracts/parent_notice.schema.json` (example: `contracts/examples/sample_notices.json`):
  `{school_id, date, notices: [{id, severity, title, body, issued_at, expires_at?}]}`
  - `severity` is one of `info`, `warning`, `critical`.
- **404:** unknown school. **500:** unexpected error.

```bash
curl -s "$API/schools/sch_dwarka_02/notices"
```

## Running it locally

`api/mock_server.py` serves all four routes on `http://localhost:8000`, Yash's default base URL. It uses the standard
library only (Python 3.11+), with open CORS and the error envelope above. **The one command**, from the repo root:

```bash
python api/mock_server.py            # sample data
```

| Flag | Effect |
|---|---|
| *(none)* | Sample data: the scripted day from `mocks/`, shifted onto today (`current.source` starts with `"SAMPLE:"`) |
| `--live` | Air quality from live Open-Meteo for each school, cached for an hour. It falls back to the sample if Open-Meteo fails |
| `--port 8001` | Another port |
| `--host 0.0.0.0` | Reachable from other devices on your network (e.g. a phone, for the video) |

Where each route's data comes from:

| Route | Data |
|---|---|
| `GET /schools` | `contracts/examples/sample_schools.json` (3 schools) |
| `GET /schools/{id}/air-quality` | The data layer (`data/ingest/airquality.py`). Every school gets the same sample day unless `--live` is set |
| `GET /schools/{id}/protocol` | `contracts/examples/sample_protocol.json`, with that school's id and today's date. A null `alternative` is dropped (open question 10) |
| `GET /schools/{id}/notices` | `contracts/examples/sample_notices.json`, with that school's id and today's date |

There's no POST route, because the client doesn't make one. State is read-only, so restarting changes nothing.

**Pointing the web app at it:**

```bash
cd web && npm install && NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 NEXT_PUBLIC_USE_MOCK=false npm run dev
```

Then open http://localhost:3000. For UI work without any server, leave `NEXT_PUBLIC_USE_MOCK` unset: the client then serves
the contract examples itself.

**Data you can produce without the server** (from the repo root):

```bash
python -m data.ingest.airquality        # AirQualityResponse for mocks/school.json (live, or SAMPLE fallback)
python -m data.smoketrace.sources       # live wind grid + NASA FIRMS fire count
```

## Smoke test

`api/tests/smoke_api.py` checks any running API: the local mock server, or the deployed URL later. It uses the standard
library only, and validates with `jsonschema` when that's installed (falling back to a built-in check).

```bash
python api/tests/smoke_api.py                       # default http://localhost:8000
python api/tests/smoke_api.py "$NEXT_PUBLIC_API_BASE_URL"
```

It prints one PASS or FAIL line per check, with the status code and the time taken, and exits 1 if anything fails:
- the four routes return 200, with the CORS header and a body that matches their contract
- an unknown school returns 404 with the error envelope
- the CORS preflight allows `content-type`
- any response slower than 29 s is flagged
- two air-quality calls return different `metadata.request_id` values

## Open questions

1. **Smoke trace has no route or contract.** CLAUDE.md treats it as core (the "smoke likely by 14:00, so PE moves indoors"
   video hook), and `data/smoketrace` already produces it. Proposal: `GET /schools/{id}/smoke` returning
   `{"now": trace, "afternoon": trace}`, in the shape of `mocks/trace-now.json` (snake_case: `smoke_likely`,
   `fire_count`, `by_district`, `headline.en` / `headline.hi`, `indicative: true`, …). It needs a contract (Yash, Krishna) and types (Yash).
2. **Generating a plan:** no route triggers the agent, for example `POST /schools/{id}/protocol` or a schedule. It's also
   undecided what `GET /protocol` returns before a plan exists (404, or an empty plan?).
3. **The alert email has no route.** The video needs to show it. Options: invoke the `data/alerts` Lambda directly, or add
   a test route. Owner?
4. **Schools:** there's no route to create or update a school, and the list's source (static config? DynamoDB?) isn't decided.
5. **No sample flag in the contracts.** For now the backend marks sample data with a `"SAMPLE:"` prefix in `current.source`.
6. **Hindi:** notices and protocol text are plain strings. CLAUDE.md wants an English and a Hindi parent notice. Two
   notices, or a language field?
7. **Citations:** CLAUDE.md says every decision cites the numbers it used. `ProtocolResponse` has no field for that.
8. **Error `code` values** (`bad_request`, `not_found`, `internal`) are proposed here. They aren't in any contract yet.
9. **Example AQI values** in `contracts/examples/sample_readings.json` match the pre-2024 EPA breakpoints. The backend uses
   the current ones: 65.3 µg/m³ gives 158, not 156.
10. **`alternative: null` in the protocol example:** `contracts/examples/sample_protocol.json` has `"alternative": null`,
    but `protocol.schema.json` only allows a string. The TypeScript type (`string | null`) allows null. Either the schema
    should allow `null`, or the example should drop the key (Yash). Until then, the mock server drops it.

## Handler consistency review (block 4)

> ⚠️ **REWRITE NEEDED (owner: Krishna, to fix later).** The only `infra/lambda/handlers.py` and `infra/template.yaml`
> are the sandbox prototypes on `sandbox-A` (`sandbox/infra/…`, reviewed at commit `f4a467b`). On `dev`, `infra/` has
> only empty placeholders. Those prototypes implement the **earlier four-route design** (`GET /today`, `POST /protocol`,
> `POST /alert/test`, `PUT /schools/{id}`), so **none of this README's routes exist there**. Against `dev`'s current data
> layer they would also crash with a `KeyError` on the first request (items 7–8, checked by running the data layer).
> Local work isn't blocked: `api/mock_server.py` and `api/tests/smoke_api.py` already follow this README.

Line numbers refer to `sandbox/infra/lambda/handlers.py` at `f4a467b`.

| # | Area | This README | handlers.py / template.yaml today | Owner | Exact change |
|---|---|---|---|---|---|
| 1 | Routes ⚠️ | `GET /schools`, `/schools/{id}/air-quality`, `/protocol` (GET), `/notices` | `api_handler` serves `GET /today`, `POST /protocol`, `POST /alert/test`, `PUT /schools/{id}` only (L255–276) | Krishna | **Rewrite** `api_handler` routing for the four GET routes. Drop the old four, or park them until open questions 2–4 are decided |
| 2 | Template routes ⚠️ | The four GET paths | `HttpApi` events for the old paths (template L171–180). `dev`'s `infra/template.yaml` is empty | Krishna | Write the template on `dev` with one `HttpApi` event per GET path on the API function, and `CorsConfiguration` with `AllowMethods: [GET, OPTIONS]` and `AllowHeaders: [content-type]` |
| 3 | Error shape | `{"error": {"code", "message"}}` | `{"error": "<text>"}` (L276–283), plus `details` on 400 (L235) | Krishna | Return `{"error": {"code": "not_found" \| "bad_request" \| "internal", "message": "…"}}` from every error path |
| 4 | 500 message | `message` never exposes internals | Returns `repr(exc)[:300]` to the client (L283) | Krishna | Send `"internal error"` to the client and log `repr(exc)` to CloudWatch only |
| 5 | Preflight | `OPTIONS` → `204` with no body | `204` with body `{}` (L259). A 204 must not carry a body | Krishna | Return `204` with an empty body, or let the `HttpApi` CORS configuration answer preflight |
| 6 | CORS methods | `GET, OPTIONS` | `GET,POST,PUT,OPTIONS` (L39–40) | Krishna | Tighten to `GET,OPTIONS` in the rewrite. It works as-is, so this is low priority |
| 7 | School shape ⚠️ | Contract School `{id, name, latitude, longitude, …}` | Reads `school["school_id"]` (L86, L101, L210) and stores the old School shape via `PUT`. `dev`'s School has no `school_id`, so this throws a `KeyError` | Krishna | Read `school["id"]`, and store and serve the contract School |
| 8 | Air-quality body ⚠️ | `GET /air-quality` returns `fetch_forecast(school)` unchanged (`AirQualityResponse`) | Wraps the data in the old TodayBundle and reads the top-level `forecast["generated_at"]` (L88, L114). `dev`'s output has `metadata.generated_at`, so this throws a `KeyError` | Krishna | Store the `fetch_forecast` output as-is, check staleness from `metadata.generated_at`, and return it as the body of `GET /air-quality` |
| 9 | `request_id` | Unique per request | Would serve the stored `metadata` unchanged | Krishna | Set `metadata.request_id = context.aws_request_id` on every response |
| 10 | `GET /schools` | `SchoolListResponse` | No list route; schools only arrive via `PUT` | Krishna | Scan the schools table (or seed it from `contracts/examples/sample_schools.json`) and return `{"schools": [...]}`. The source is open question 4 |
| 11 | `GET /protocol` | `ProtocolResponse` (Yash's contract) | No GET. Stores the agent prototype's old plan shape (`decisions`, `windows`, `citations`) | Masham + Krishna | Masham: the agent outputs `ProtocolResponse`. Krishna: GET reads today's plan from the plans table (behaviour before a plan exists is open question 2) |
| 12 | `GET /notices` | `ParentNoticeResponse` | No producer at all | Masham + Krishna | Build the notices from the agent's parent notice (how English and Hindi are split is open question 6), and serve them from a GET route |
| 13 | Imports and packaging ⚠️ | n/a | Imports `agent.contracts` and `agent.protocol_agent` (L32–33), which are sandbox prototypes; `agent/` on `dev` is an empty skeleton. The import fails on `dev` | Krishna (+ Masham) | Import Masham's real entry point (`generate_protocol`, per Masham's block 6) or drop it from the API function. Package `data/` next to the handlers |
| 14 | 29 s limit | Every route under 29 s | `POST /alert/test` can run the agent inline (L271) and pass 29 s | Krishna | Only matters if a test-alert route comes back (open question 3). Keep the agent async if it does |

**Fixed in `api/` during this review:**
- `api/mock_server.py` repeated the cached `metadata.request_id` on every request. It now generates a new id per request,
  and the "unique per request" rule is now stated in this README.
- `api/tests/smoke_api.py` gained a check for that rule. It passes on the fixed server and fails on the previous version.
- Nothing outside `api/` was modified.

