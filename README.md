# Bad-Air Day Protocol

**Environmental Hacks 2026, Air track** (WeMakeDevs × AWS Builder Center). Team Shawarma.

A Delhi-NCR school principal at 7 AM has an AQI number but not a decision. Bad-Air Day Protocol turns the morning air forecast into a plan for the school day: an outdoor/indoor/restricted decision for each timetable slot, the smoke source for the afternoon, and a parent notice in English and Hindi, before the first bell.

## What it does

1. **Air:** PM2.5 now plus a 24 h hourly forecast at the school (Open-Meteo / CAMS), with US-EPA AQI bands for outdoor activity.
2. **Smoke trace:** a wind back-trajectory from the school matched to NASA FIRMS farm-fire detections ("where is today's smoke from, and will it arrive by 14:00?"). Indicative only: a single-level trajectory, not a dispersion model.
3. **Protocol:** a Strands agent on Amazon Bedrock writes an action per schedule slot and cites the numbers it used. A deterministic rules engine produces a valid plan when Bedrock is unavailable.
4. **Parent notice:** English and Hindi, ready to copy or share on WhatsApp.
5. **Alert:** EventBridge at 06:00 IST → Lambda → SNS email.

## Architecture (AWS)

```
Open-Meteo AQ + wind ─┐
NASA FIRMS fires ─────┴─> Lambda (ingest, back-trajectory) ─> DynamoDB
API Gateway (HTTP API) ─> Lambda handlers ─> DynamoDB / agent Lambda
agent Lambda ─> Strands Agent ⇄ Amazon Bedrock (rules fallback) ─> DynamoDB plans
EventBridge 06:00 IST ─> alert Lambda ─> SNS email
Next.js web app ─> AWS Amplify
```

The whole backend is one SAM template: `infra/template.yaml` (see `infra/README.md` to deploy). Every external call falls back to labelled sample data, so the dashboard is never blank.

## Repo layout

| Path | What |
|---|---|
| `web/` | Next.js dashboard, parent notice and history pages (EN/HI) |
| `contracts/` | JSON Schemas for every API shape (source of truth) |
| `data/` | Stdlib data layer: Open-Meteo ingest, FIRMS + wind back-trajectory, alerts handler, config (bands, GRAP, protocol rules) |
| `agent/` | Strands/Bedrock protocol agent, output validator, EN/HI notices, rules fallback |
| `api/` | Lambda handlers, API cheat sheet (`api/README.md`), mock server, smoke test |
| `infra/` | SAM template, build script, IAM notes |
| `mocks/`, `scripts/`, `tests/` | Sample data, probes and local runners, tests |

## Run locally

```bash
pip install jsonschema referencing boto3 strands-agents
python scripts/local_backend.py                # API on :8000 (add --live for real data)
cd web && npm ci && NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 NEXT_PUBLIC_USE_MOCK=false npm run dev
python api/tests/smoke_api.py                  # route smoke test
python tests/test_trace.py && python tests/test_airquality.py
python agent/tests/test_agent.py && python api/tests/test_handlers.py
```

## Honest limits

- Demo data is sample data and is labelled SAMPLE in the UI and API.
- AQI bands and activity limits are a team rule, not an official standard. Official GRAP/CAQM and Directorate of Education orders take precedence.
- The smoke trace is indicative (single-level wind back-trajectory), not a dispersion model.
- CAMS resolution is about 40 km, so nearby schools can show the same PM2.5.

## AI usage

The team used AI coding tools during the hackathon and records that use here.

- **Claude Code (Anthropic), used by Ahaan:** wrote most of the data layer (`data/ingest`, `data/smoketrace`, `data/util.py`, `mocks/`, `scripts/make_mocks.py`, `scripts/probe_apis.py`, `tests/test_trace.py`, `tests/test_airquality.py`); `api/README.md`, `api/mock_server.py` and `api/tests/smoke_api.py`; the backend on `dev2` (agent package, API handlers, alerts handler, SAM infra, `scripts/local_backend.py` and their tests); the sandbox prototypes on `sandbox-A`; this README; and the demo video's narration script, slides and ffmpeg assembly. The video voiceover is AI text-to-speech (Microsoft Edge neural TTS, en-IN-NeerjaNeural).
- **Other team members:** add your tools and what they produced here.
