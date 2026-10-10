# Contracts (backend sandbox copy)

Minimal schemas written so the data layer can be validated before it is merged into the team repo.
**Reconcile with the team's `contracts/` (owner: Krishna, changes need Masham's OK) before merging.**

| Schema | Producer | Consumers | Stored as |
|---|---|---|---|
| `school.schema.json` | `PUT /schools/{id}` | ingest, agent, web | `schools` table, `sk=profile` |
| `forecast.schema.json` | `data/ingest/airquality.py::fetch_forecast` | agent (`get_air_now`, `get_forecast`), web | `readings` table |
| `trace.schema.json` | `data/smoketrace/trace.py::build_trace` | agent (`get_smoke`), web map | `traces` table, `sk=now#…` / `forecast#…` |
| `protocol.schema.json` | `agent/protocol_agent.py::generate_protocol` | web, alert | `plans` table, `sk=plan#<date>` |
| `alert.schema.json` | alert Lambda | web | `alerts` table, `sk=alert#<sent_at>` |
| `today-bundle.schema.json` | api Lambda `GET /schools/{id}/today` | web, agent input | not stored (join) |

`protocol` and `alert` are PROTOTYPES written in Aani's sandbox so the loop can run; the owners' versions win.

## API routes (HTTP API)

| Route | Body | Returns |
|---|---|---|
| `GET /schools/{id}/today` | | 200 TodayBundle (runs ingest on demand if nothing stored yet) |
| `POST /schools/{id}/protocol` | | 202 `{status, date, requested_at}`; agent runs async |
| `POST /schools/{id}/alert/test` | | 200 Alert + `preview` (the email text); generates the plan inline if missing |
| `PUT /schools/{id}` | School | 200 School |

