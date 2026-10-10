# API cheat sheet

Four routes, one error envelope. Every response shape below is defined by a file in `contracts/`. Anything that has no
contract yet is listed under [Open questions](#open-questions).

> **Where the contracts are right now:** the files named here (`today-bundle.schema.json`, `school.schema.json`,
> `protocol.schema.json`, `alert.schema.json`) live in `sandbox/contracts/` on the `sandbox-A` branch. They move to
> `contracts/` on `dev` once Krishna and Masham approve them (open question 1).

## Rules you can rely on

- **Base URL:** read it from `NEXT_PUBLIC_API_URL`, with no trailing slash. Locally that's `http://localhost:8787` (see below).
- **No auth.** There are no API keys, cookies or Cognito.
- **CORS is open:** `Access-Control-Allow-Origin: *`, with methods `GET, POST, PUT, OPTIONS` and header `content-type`.
  Preflight `OPTIONS` requests get a `204`.
- **JSON everywhere:** `content-type: application/json; charset=utf-8`. Hindi text is UTF-8 Devanagari.
- **Times:**
  - Every timestamp is UTC and ends in `Z` (`2026-10-12T01:30:00Z`). Display it in IST (UTC+05:30).
  - Schedule and window times are IST wall-clock `HH:MM`.
  - `date` is an IST calendar date (`YYYY-MM-DD`).
- **School day:** `date` is today in IST, or **tomorrow once today's last schedule slot has ended**.
- **Sample data:** wherever `source` (or `air.source`) is `"sample"`, the numbers come from mocks, not live feeds. Show a SAMPLE badge.
- **Smoke traces** are always `"indicative": true` (a wind back-trajectory, not a dispersion model). Say so in the UI.
- **Bands** (`green`, `amber`, `red`) are a team rule, not an official standard.
- **Timeout:** API Gateway cuts requests off at **29 s**.

## Error envelope

Every failure, on every route, returns this body with the matching status code:

```json
{"error": {"code": "not_found", "message": "unknown school no-such-school"}}
```

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | The body isn't valid JSON, or the PUT body fails `school.schema.json` |
| 404 | `not_found` | Unknown school id or unknown route |
| 500 | `internal` | Anything unexpected. `message` is safe to show and never contains a stack trace |

`code` values are lower-case strings, so a client can branch on `code` and show `message` to people.

## Routes

Set the base URL once to use the examples:

```bash
API=${NEXT_PUBLIC_API_URL:-http://localhost:8787}
```

### 1. `GET /schools/{id}/today`

**Purpose:** everything the dashboard needs for the school day, in one call: school, air now plus 24 h forecast,
both smoke traces, the plan (if one exists) and the alerts already sent.

- **Request body:** none.
- **200:** a TodayBundle, per `contracts/today-bundle.schema.json`. Top-level keys: `school`, `date`, `generated_at`, `air`
  (`forecast.schema.json`), `smoke.now` and `smoke.afternoon` (`trace.schema.json`), `plan` (`protocol.schema.json`, or
  `null` until generated), and `alerts` (an array of `alert.schema.json`).
- **404:** unknown school. **500:** unexpected error.
- **Timing:** if no data is stored for the school yet, or it's more than 2 h old, the API fetches it on the spot. That took
  **about 15 s** with live data. Normally the hourly ingest job has already stored it, and the call is fast.

```bash
curl -s "$API/schools/sample-dwarka/today"
```

### 2. `POST /schools/{id}/protocol`

**Purpose:** ask the agent to (re)write the day's plan. The call returns immediately, and the agent runs in the background.

- **Request body:** none.
- **202:** `{"status": "accepted", "school_id": "...", "date": "YYYY-MM-DD", "requested_at": "...Z"}`. This body has no
  contract file yet (open question 2).
- **404:** unknown school. **500:** unexpected error.
- **Getting the plan:** poll `GET /today` (every 2 s is fine) until `plan.generated_at >= requested_at`. The plan follows
  `protocol.schema.json`: one decision per schedule slot, window times, an English and Hindi parent notice, and a
  `citations` list on every decision, pointing to the TodayBundle values it used. `plan.generator.engine` is
  `strands-bedrock`, or `rules-fallback` with a `fallback_reason` when Bedrock wasn't available.

```bash
curl -s -X POST "$API/schools/sample-dwarka/protocol"
```

### 3. `POST /schools/{id}/alert/test`

**Purpose:** send the principal's alert email now, the same one the 06:00 IST schedule sends, so it can be shown in the video.

- **Request body:** none.
- **200:** an Alert, per `contracts/alert.schema.json`, plus a `preview` field holding the full email text. `preview` isn't in
  the contract yet (open question 3).
- **404:** unknown school. **500:** unexpected error.
- **Timing:** if there's no plan for the day yet, this route runs the agent first and **can pass 29 s** with Bedrock. Call
  `POST /protocol` and wait for the plan before testing the alert.
- **Delivery:** SNS email goes only to addresses that have confirmed their SNS subscription (see `PUT`).

```bash
curl -s -X POST "$API/schools/sample-dwarka/alert/test"
```

### 4. `PUT /schools/{id}`

**Purpose:** create or replace a school profile.

- **Request body:** a School, per `contracts/school.schema.json` (required: `name`, `lat`, `lon`, `schedule`). `school_id` is
  taken from the path, and any `school_id` in the body is overwritten.
- **200:** the stored School.
- **400:** the body isn't JSON, or it fails the schema. **500:** unexpected error.
- **Side effect:** each address in `alert_emails` gets an SNS confirmation email. Alerts reach it only after the link in
  that email is clicked.

```bash
curl -s -X PUT "$API/schools/sample-dwarka" -H 'content-type: application/json' \
  -d '{"name": "Sample Public School, Dwarka (demo)", "lat": 28.59, "lon": 77.05,
       "schedule": [{"slot_id": "pe", "label": "PE (Classes 6-8)", "start": "14:00", "end": "14:40", "outdoor": true}]}'
```

## Running it locally

There's no separate mock server. The existing `scripts/local_api.py` already serves all four routes on `:8787`. It runs
the **real** prototype handlers (`infra/lambda/handlers.py`) against a simulated AWS (moto DynamoDB and SNS), so local
behaviour matches what gets deployed. No AWS account is needed.

**Where it lives:** `sandbox/` on the `sandbox-A` branch, until the sandbox is merged. A separate worktree keeps your
`dev` checkout untouched.

**Setup (once):** Python 3.11+ (tested on 3.14).

```bash
git fetch origin && git worktree add ../bad-air-sandbox sandbox-A
cd ../bad-air-sandbox/sandbox
python -m venv .venv && .venv/bin/pip install jsonschema referencing boto3 moto
```

On Windows, use `.venv\Scripts\python` in place of `.venv/bin/python`.

**The one command:**

```bash
.venv/bin/python scripts/local_api.py --offline
```

It prints `local API on http://localhost:8787` and comes pre-loaded with the school `sample-dwarka`.

| Flag | Effect |
|---|---|
| `--offline` | Sample data only: the scripted day where smoke arrives by 14:00 and PE moves indoors. Use it for UI work and the video |
| *(no flag)* | Live Open-Meteo and NASA FIRMS data. Each source falls back to the sample if it fails. The first `GET /today` for a school takes about 15 s |
| `--port 8788` | A different port, if 8787 is taken |

**Behaviour to know:**
- **`POST /protocol` returns `202`, and the plan is stored about 0.03 s later** (measured on a cold start). Any client that
  waits, like a person or the web app's 2-second poll, sees it on the next `GET /today`. A script that fires the GET within
  milliseconds can miss it, so poll until `plan.generated_at >= requested_at`, as the deployed API also requires.
- **The plan comes from the rules engine** (`generator.engine: "rules-fallback"`, `fallback_reason: "no AWS credentials
  (local moto run)"`). With AWS credentials in the environment, the same command calls Bedrock for real, and only Bedrock
  leaves your machine.
- **`POST /alert/test` "sends" to the simulated SNS.** No real email goes out, but the alert is recorded and appears under
  `alerts` in `GET /today`.
- **`PUT` works for any new school id,** and that school's `GET /today` builds its data on demand.
- **State is in memory.** Restarting the server starts fresh.
- **Dependencies:** `strands-agents` isn't needed locally. It's only imported when Bedrock is actually called.

**Pointing the web app at it:** set `NEXT_PUBLIC_API_URL=http://localhost:8787`, and open the app at
**`http://localhost:3000`**. With `127.0.0.1:3000`, the Next.js 16 dev server blocks its own scripts unless
`allowedDevOrigins` is set. CORS is open, so any origin can call the API.

```bash
cd ../bad-air-sandbox/sandbox/web && npm install && NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev
```

## Open questions

1. **Contracts location:** the schemas named above are in `sandbox/contracts/` on `sandbox-A`. They need Krishna's and
   Masham's approval to move into `contracts/` on `dev`. The skeleton's empty files (`air_quality`, `parent_notice`) would go.
2. **The 202 body of `POST /protocol`** (`status`, `school_id`, `date`, `requested_at`) has no contract file.
3. **The `preview` field on `POST /alert/test`** isn't in `alert.schema.json`.
4. **Error `code` values** (`bad_request`, `not_found`, `internal`) are proposed here. They aren't in any contract yet.
5. **The prototype `infra/lambda/handlers.py` doesn't use this error envelope yet.** It returns `{"error": "<text>"}`. Block 4 lists the exact change for its owner.
