# Backend sandbox (Aani)

A self-contained, runnable test bed for the whole Bad-Air Day Protocol loop. It isn't wired into the
team skeleton at the repo root yet. Its layout follows `sandbox/CLAUDE.md`, not the root folders.

| Part | Status |
|---|---|
| `data/` (air forecast, wind grid, FIRMS fires, smoke back-trajectory), `mocks/`, `tests/`, `scripts/{probe_apis,make_mocks,validate_mocks}.py` | Aani's real work, verified against the live APIs on 10 Oct |
| `agent/` (Strands + Bedrock, rules fallback) | **PROTOTYPE** of Masham's part, for reference only |
| `infra/` (SAM template, 4 Lambda handlers) | **PROTOTYPE** of Krishna's part, for reference only |
| `web/` (Next.js static app) | **PROTOTYPE** of Yash's part, for reference only |
| `contracts/` | Stand-ins. Reconcile with the team's `contracts/` |
| `scripts/{local_stack,local_api,e2e_local}.py` | Local harness: the whole stack on a moto-simulated AWS |

## Run

```bash
cd sandbox
python -m venv .venv && .venv/bin/pip install jsonschema referencing boto3 moto strands-agents cfn-lint
.venv/bin/python scripts/validate_mocks.py        # every mock validates
python tests/test_trace.py                        # trajectory tests
python scripts/probe_apis.py                      # live check of every external API
.venv/bin/python scripts/e2e_local.py --offline   # whole loop, PASS/FAIL per step (no AWS account needed)
.venv/bin/python scripts/local_api.py --offline   # API on :8787
cd web && npm install && NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev   # Node 20+
```

`--offline` forces the sample data: the scripted "smoke likely by 14:00, so PE moves indoors" day.
Without it every source is live, and each falls back to the sample data on failure. Bedrock runs
only if AWS credentials are present; otherwise the plan comes from the rules fallback and says so.
