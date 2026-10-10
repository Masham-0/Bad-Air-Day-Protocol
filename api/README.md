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
  - `metadata`: `{request_id, generated_at, cache_ttl_seconds?}`
- **404:** unknown school. **500:** unexpected error.
- **Produced by:** `data/ingest/airquality.py`, via `fetch_forecast(school)`. The data is the CAMS model via Open-Meteo, a
  forecast and not a sensor. If Open-Meteo fails, it falls back to the sample day (`current.source` starts with `"SAMPLE:"`).

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

- **UI work:** keep `NEXT_PUBLIC_USE_MOCK` unset or `true`. The web app then runs entirely from the contract examples.
- **No local server serves these four routes yet.** The frozen sandbox's `scripts/local_api.py` (on `sandbox-A`) serves the
  earlier four-route design (`/today`, …) on `:8787`, so it doesn't match. A stdlib mock server for these routes is the
  natural redo of block 2.
- **The data you can produce today** (from the repo root, standard library only):

```bash
python -m data.ingest.airquality        # AirQualityResponse for mocks/school.json (live, or SAMPLE fallback)
python -m data.smoketrace.sources       # live wind grid + NASA FIRMS fire count
BADAIR_OFFLINE=1 python -m data.ingest.airquality   # force the sample day
```

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
