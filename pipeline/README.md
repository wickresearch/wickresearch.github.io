# pipeline/

Python data pipeline for the Wick macro terminal. The main README covers setup and deployment. This file is a code map.

| File | Role |
|---|---|
| `run.py` | Orchestrator. `Run.run_series` → `run_curves` → `run_policy_rates` → `run_derived` → `write_series_and_catalog` → `run_extras` (calendar, news, research, auctions, events) → `write_status`. Each step catches its own failures. |
| `config/series.yaml` | Series catalogue: what to fetch, units, data type, verification level, derived formulas, curves, policy rates. |
| `config/sources.yaml` | Provider registry (enabled / verification status), RSS feeds, calendar release filter. |
| `providers/*.py` | One adapter per provider. Each pairs a pure `parse_*` function (unit-tested against `tests/fixtures/`) with a thin `fetch_*` wrapper. |
| `http.py` | The only network entry point: timeouts, retries with exponential backoff on 429/5xx and network errors, API-key redaction in logs. |
| `calc.py` | Pure calculations (as-of joins, transforms, summaries, staleness). No I/O. |
| `store.py` | Atomic JSON writes, file layout, access to the previous build (URL or directory). |
| `probe.py` | One representative live call per provider. Writes a JSON report. |

**Failure policy.** A provider failure is logged in `status.json`. The series keeps its previous data (`status: fallback`), or is reported `failed` if there is none. Series with a configured `fallback:` try the secondary provider first. The run exits non-zero only if it produced nothing.

**Logging.** Standard `logging` to stderr. Use `--log-level DEBUG` for request-level detail. In GitHub Actions a Markdown summary table is also written to the job summary.
