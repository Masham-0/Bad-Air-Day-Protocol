# CLAUDE.md: Bad-Air Day Protocol (Team Shawarma)

Context for Claude Code. Read this whole file before touching code.

## What we are building

**Environmental Hacks 2026, Air track** (WeMakeDevs × AWS Builder Center). Hard deadline: **Sun 11 Oct 2026, 20:00 IST**. Feature freeze is Sun 13:00, and we submit at 18:30.

**User:** a Delhi-NCR school principal at 7 AM, deciding whether assembly, PE and recess happen outdoors.

**Core loop (the MVP; nothing else matters until this runs end to end on a live URL):**
1. **Air:** PM2.5 now plus a 24 h hourly forecast at the school. Each hour gets a band (green, amber or red) for outdoor activity.
2. **Live smog tracker:** a wind back-trajectory from the school, matched to NASA FIRMS farm-fire detections. It answers "where is today's smoke from?" for now and for 14:00 (afternoon PE).
3. **Agent:** a Strands agent on Amazon Bedrock writes the day's protocol: an action per schedule slot, window open/close times, and a parent notice in English and Hindi. Every decision cites the numbers it used.
4. **Alert:** EventBridge at 06:00 IST → Lambda → SNS email.

**Out of scope:** our own sensors, replacing official GRAP orders, a general AQI app, user accounts/Cognito (stretch only).

## Rules that can disqualify us

- **Only new work counts.** The repo's commit history must fall inside 8–11 Oct 2026. Make small commits, often, from each member's own GitHub account. Never squash everything into one commit.
- **Log AI tool use.** The team records all AI tool use (Claude Code included) in the AI usage section of `README.md`. Never add Co-Authored-By or other AI attribution lines to commits or PRs.
- **AWS must be visible in the 3-min video:** Lambda, DynamoDB, Bedrock, SNS, EventBridge, API Gateway, Amplify, plus Strands (AWS open source).
- **Judges score only the video, repo and writeup.** There is no live demo, so a feature not shown in the video doesn't exist.

## Architecture

```
Open-Meteo AQ ─┐                          ┌─> DynamoDB readings
Open-Meteo wind├─> ingest Lambda (hourly) ─┤
NASA FIRMS ────┘   (falls back to /mocks)  └─> DynamoDB traces (now#…, forecast#…)

API Gateway (HTTP API) ─> api Lambda ─┬─ GET  /schools/{id}/today        -> TodayBundle (joins all tables)
                                      ├─ POST /schools/{id}/protocol     -> 202; async-invokes agent Lambda
                                      ├─ POST /schools/{id}/alert/test   -> sends the alert now
                                      └─ PUT  /schools/{id}              -> upsert School

agent Lambda ─> Strands Agent ⇄ Bedrock ─> DynamoDB plans
EventBridge cron(30 0 * * ? *) = 06:00 IST ─> alert Lambda ─> SNS (email) ─> DynamoDB alerts
Next.js on Amplify ─> GET /today, polls after "Regenerate plan"
```

**Storage pattern:** every DynamoDB item is `{school_id (PK), sk (SK), doc}`, where `doc` is the contract object stored as a JSON string. This avoids Decimal handling, and the stored shape is exactly what `/contracts` says. Don't change it.

## Repo map and owners

| Path | Owner | What |
|---|---|---|
| `contracts/` | Krishna (changes need Masham's OK) | JSON Schemas, the **source of truth** for every shape. `contracts/README.md` lists producers, consumers and API routes |
| `mocks/` | Aani | Sample data that validates against the contracts. Regenerate with `scripts/make_mocks.py` |
| `data/config/` | Aani | `bands.json` (PM2.5 thresholds), `grap.json` (stages), `districts.json` (approximate HQ coordinates) |
| `data/ingest/airquality.py` | Aani | Open-Meteo AQ → `forecast` contract; optional WAQI "now" |
| `data/smoketrace/trace.py` | Aani | Pure-Python back-trajectory, fire matching, district grouping, EN/HI headline |
| `data/smoketrace/sources.py` | Aani | Open-Meteo multi-point wind grid (`GridWind`) + FIRMS area API |
| `agent/protocol_agent.py` | Masham | Strands agent: tools `get_air_now`, `get_forecast`, `get_smoke`, `get_school`, `get_rules`; output validated against `protocol.schema.json` with one repair retry |
| `web/` | Yash | Next.js on Amplify. `web/lib/types.ts` mirrors the contracts |
| `infra/template.yaml`, `infra/lambda/handlers.py`, `infra/build.sh` | Krishna | SAM stack: 5 tables, SNS topic, HTTP API, 4 Lambdas (`ingest`, `agent`, `alert`, `api`) |
| `docs/` | Krishna | architecture diagram, writeup, feedback |
| `tests/test_trace.py` | Aani | Trajectory tests |

**Stay in the folder of the person you're working for.** If a task needs a change in someone else's folder, say so instead of making it.

## Commands

```bash
pip install jsonschema referencing boto3          # + strands-agents for the agent
python scripts/probe_apis.py                      # live check of every external endpoint (reads .env)
python scripts/validate_mocks.py                  # must print OK for every mock
python tests/test_trace.py                        # trajectory tests
python scripts/make_mocks.py                      # regenerate synthetic mocks (source="sample")
python -m data.smoketrace.sources                 # live wind + FIRMS check (FIRMS_MAP_KEY optional)
AWS_REGION=us-east-1 BEDROCK_MODEL_ID=<id> python agent/protocol_agent.py mocks/today-bundle.json

bash infra/build.sh && sam build -t infra/template.yaml && sam deploy --guided

# Sandbox: whole backend on a moto-simulated AWS (no AWS account needed)
python scripts/e2e_local.py [--offline]            # PASS/FAIL per step of the core loop
python scripts/local_api.py [--offline]            # API on :8787 for the web app
cd web && npm install && NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev   # needs Node 20+
```

`infra/build.sh` copies `data/ agent/ contracts/ mocks/` plus `handlers.py` and `requirements.txt` into `.build/backend`. All Lambdas share that one package, and handlers import `data.*` and `agent.*` from it.

**Before every commit:** `validate_mocks.py` and `test_trace.py` must both pass.

## Conventions (don't break these)

- **Contracts first.** If a shape changes, update the schema, the mocks (`make_mocks.py`) and `web/lib/types.ts` in the same PR, then run `validate_mocks.py`.
- **Time zones.** Store UTC (`...Z`) and display IST (UTC+05:30). Schedule times in `School.schedule` are IST `HH:MM`.
- **Thresholds live in config.** Bands and GRAP come from `data/config/*.json`; never hard-code them.
- **Label sample data.** Any number from mock or cache data has `source: "sample"`, and the UI shows a SAMPLE badge. The smoke trace is always labelled "indicative": it's a single-level wind back-trajectory, not a dispersion model. Bands are a team rule, not an official standard.
- **Wind direction** is meteorological: `wind_from_deg` is where the wind comes FROM, so going back in time moves the parcel toward that bearing.
- **The agent never invents numbers.** Every decision has at least one `citation` whose `ref` is a JSON pointer into the TodayBundle (`/air/hours/3/pm25`, `/air/now/aqi`, `/smoke/afternoon/smoke_likely`).
- **Hindi** is in Devanagari, plain and warm. No medical advice beyond masks for the commute and avoiding outdoor exertion.
- **Failures degrade to mocks.** Every external call is wrapped so that a failure falls back to `/mocks`. The UI must never be blank during the video.
- **Dependencies.** Lambda code under `data/` is stdlib-only (urllib, no requests). Only the agent needs `strands-agents`.

## Status (scaffold built Sat 10 Oct 11:00–11:20; sandbox updates below)

**Verified:**
- All mocks validate against the contracts.
- The 3 trajectory tests pass.
- `cfn-lint` passes on the template.
- Handlers were tested against a simulated AWS (moto):
    - PUT school, ingest falling back to mocks, GET /today (the result validates as a TodayBundle), alert test sending via SNS, 404 for an unknown school.

**Verified live, Sat 10 Oct ~15:30 IST, by `scripts/probe_apis.py` in Aani's backend sandbox (`~/Desktop/hackathon`; merge into the repo):**
- Open-Meteo AQ: hourly/current `pm2_5` in µg/m³. Times have **no `Z`**, even with `timezone=GMT`, so code appends it. `us_aqi` can go past 500 (we saw 580), so it isn't used. `now.aqi` is the CPCB PM2.5 sub-index of the trailing 24 h model mean (indicative).
- Open-Meteo wind: `wind_speed_120m` and `wind_direction_120m` exist (m/s with `wind_speed_unit=ms`). Several coordinates **return a JSON list** in request order. Coordinates snap to the model grid, so match by position, not by lat/lon.
- FIRMS VIIRS CSV columns: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight` (`acq_time` is UTC `HHMM`). The **public South_Asia 24h/48h/7d CSVs need no key**, and `sources.fetch_fires` uses them when `FIRMS_MAP_KEY` is missing.
- Live end to end: `fetch_forecast` + `build_today_traces` on real data validate against the contracts, and a simulated outage falls back to mocks (`source: "sample"`).

**NOT verified yet:**
- FIRMS area API with a real `FIRMS_MAP_KEY` (it's expected to return the same columns; with a bad key it returns `400 Invalid MAP_KEY.`).
- WAQI with a real token: the field names (`data.aqi`, `data.iaqi.pm25.v`, `data.city.name`, `data.time.iso`) are unverified. Both values are US-EPA sub-indices, not µg/m³, so don't show them as a concentration.
- The sandbox `contracts/` are minimal stand-ins. Reconcile them with Krishna's real schemas when merging.
- A real Bedrock call. The Strands 1.59 signatures are checked against the installed package (`BedrockModel(model_id=, region_name=, temperature=, max_tokens=)`, `Agent(model=, tools=, system_prompt=, callback_handler=None)`), but with no AWS credentials every plan so far came from the rules fallback. Also check the model ID or inference profile for our region (default `us.amazon.nova-pro-v1:0`).
- A real AWS deploy (`sam` and the AWS CLI aren't installed on Aani's machine), and Amplify hosting of `web/out`.
- SNS email delivery to a real inbox (only checked in moto, via an SQS capture queue).

**Sandbox prototypes (Sat 10 Oct, ~16:00 IST, in Aani's folder; owners replace them with their real versions):**
- `agent/protocol_agent.py` (Masham): Strands + Bedrock with tools, schema and citation validation, one repair retry, and a deterministic rules fallback (`generator.engine = "rules-fallback"` plus `fallback_reason`). The fallback is a valid plan on its own. `AGENT_ENGINE=rules` forces it.
- `infra/` (Krishna): `template.yaml` (passes `cfn-lint`), `lambda/handlers.py` (4 handlers, `{school_id, sk, doc}` storage), `build.sh`, `requirements.txt`. GET /today ingests on demand when data is missing or stale (>2 h). It took 15 s live, under the 29 s API limit.
- `contracts/protocol.schema.json` and `alert.schema.json` (Krishna/Masham): prototypes. TodayBundle now `$ref`s them and requires `alerts`.
- `web/` (Yash): Next.js 16 static export (`output: "export"`, so Amplify can serve `out/`). It has `lib/types.ts`, an SVG smoke map, the 24 h strip, the protocol with citations, the EN/HI notice with Copy and WhatsApp, Regenerate (POST, then poll) and Test alert. It falls back to the bundled mock bundle when the API is down. `?lang=hi` opens it in Hindi. It builds and type-checks, and its screenshots render at 1200 px and 390 px.
- `scripts/e2e_local.py`: 10 pass and 1 skip (Bedrock) in both offline and live mode.
- `BADAIR_OFFLINE=1` (or `--offline`) forces mock data. Mock timestamps shift onto the planned day, so the sample "smoke by 14:00 → PE indoors" story works on any date.
- "School day" means today, or tomorrow once today's last slot has ended (`data.util.plan_day`).

**Known risks:**
- `POST /alert/test` calls the agent inline if there's no plan for today, and the API Lambda times out at 29 s. Generate the plan first.
- SNS SMS to Indian numbers needs sandbox verification and may hit DLT rules, so email is the demo channel.
- `frp_threshold_mw` is the **total** FRP of matched fires that, together with `min_fires` (3), makes `smoke_likely` true. Live VIIRS farm fires are small (on 10 Oct: median 3.6 MW, max 24 MW, 533 fires in the grid), so a per-fire threshold of 150 would match nothing. The default stays 150 and the mocks use 100. `corridor_km` (25) still needs tuning on late-October counts.
- On 10 Oct the wind was easterly, so live traces said "smoke unlikely" (12 fires, 24 MW). For the video's "smoke by 14:00" hook, use the mocks, or real data from a north-westerly day.
- Mock wind and fire times are fixed (11–12 Oct 2026). When a live fetch falls back to them on another date, the trace still validates but the time windows won't line up.

> Team: update this Status section as things land, so the next Claude Code session starts from the truth.

## Priorities when time is short

1. The end-to-end loop on the live Amplify URL (mock data allowed, labelled).
2. Real data in place of the mocks.
3. The smoke map and the "smoke likely by 14:00 → PE indoors" moment (the video's hook).
4. Hindi parent notice + copy/WhatsApp share.
5. Stretch, only after 1–4: Polly Hindi audio, setup screen, Cedar roles, history.

## How to work in this repo

- Keep diffs small and in one person's folder, and suggest a commit message after each logical step.
- Don't add frameworks, auth, or new AWS services unless asked. Each one costs deploy time we don't have.
- If a live API call fails, keep the mock fallback working. Don't remove it.
- When unsure about an external API's exact field names, write a quick probe script, run it, and tell the user what you saw. Don't guess.
- When you finish a task, tell the user what AI-written work to add to the AI usage section of `README.md`. Don't write co-author lines.
