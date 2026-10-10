# Wick Research — website, macro terminal and data pipeline

Wick Research is the research platform and professional portfolio of **Ishrit Tewari**. The site is served from the `wickresearch` GitHub account at **https://wickresearch.github.io/** once deployed (see §11). It has three parts:

* **Public pages**: home, research library, investment framework, projects, about/CV.
* **Macro terminal** (`/terminal/`): 15 analytical modules, including a **FRED library** with about 170 FRED series (fed funds history, the full Treasury curve, money markets, the Fed balance sheet, inflation, labour, activity, fiscal, SEP projections, markets and international data) and a chart builder, covering rates and curves, the Fed's front end, central banks, liquidity, inflation and labour, global macro, cross-asset analysis, event studies, regimes, risk and sizing, and the calendar. A series view shows sources, timestamps and statistics for every number.
* **Data pipeline** (`pipeline/`): Python, run by GitHub Actions on a schedule. It fetches from **tested** public providers, validates and derives series, and writes static JSON.

Every data source was tested before use. The record is in **[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)**: the source matrix, the verification status of each feature, and the rejected sources with reasons.

---

## 1. Purpose
A credible public demonstration of how rates, monetary policy, liquidity, cross-asset relationships and portfolio risk are analysed, and a tool for daily research. The design priorities are reliability and honesty: every series is labelled with its source and timestamps, nothing is called real-time, no number is simulated, and a provider outage degrades one panel rather than the site.

## 2. Architecture
```
GitHub Actions (cron, ~5×/day)                         GitHub Pages
┌──────────────────────────────────────────────┐        ┌──────────────────────────┐
│ pytest + node --test                         │        │ static site/             │
│ python -m pipeline.run                       │ deploy │  ├─ HTML/CSS/JS (no build)│
│   ├─ fetch (FRED, NY Fed, Treasury, …)       │ ─────▶ │  └─ data/*.json          │
│   ├─ validate · merge · derive               │        └───────────▲──────────────┘
│   └─ write site/data/*.json                  │                    │ previous build =
│ upload-pages-artifact → deploy-pages         │ ◀──────────────────┘ last-good cache
└──────────────────────────────────────────────┘
```
Reasons for this design and the alternatives considered are in [docs/AUDIT_AND_ARCHITECTURE.md](docs/AUDIT_AND_ARCHITECTURE.md). In short: every free source is end-of-day or published on a schedule, so scheduled static builds are as fresh as any backend would be, cost nothing and have nothing to keep running. User-dependent analytics run in the browser.

## 3. Folder structure
```
.
├── site/                         # everything that is deployed
│   ├── index.html                # home
│   ├── terminal/index.html       # macro terminal shell
│   ├── research/ framework/ projects/ about/   # public pages
│   ├── assets/css/               # site.css (brand tokens), terminal.css
│   ├── assets/js/site.js         # public-page behaviour (research index, snapshot)
│   ├── assets/js/terminal/       # app.js (router), data.js, chart.js, stats.js, fmt.js, ui.js
│   │   └── modules/*.js          # one file per terminal module
│   ├── assets/js/tests/          # node --test unit tests for stats.js
│   ├── assets/vendor/uplot/      # uPlot 1.6.31 (MIT), vendored
│   ├── assets/img/               # logo crops, favicons, social card
│   ├── *.html (old dashboard URLs) # redirects to the terminal
│   ├── robots.txt sitemap.xml 404.html favicon.ico
│   └── data/                     # GENERATED at build time (git-ignored)
├── pipeline/
│   ├── run.py                    # orchestrator (entry point)
│   ├── probe.py                  # one test call per provider
│   ├── calc.py                   # pure calculations (tested)
│   ├── http.py store.py model.py # retries/timeouts, file I/O, types
│   ├── providers/                # one adapter per provider
│   ├── config/series.yaml        # ← the series catalogue (add series here)
│   ├── config/sources.yaml       # provider registry, news feeds, calendar filter
│   └── tests/                    # parser, calculation and resilience tests (+ fixtures)
├── content/
│   ├── articles.yaml             # ← research library entries (add articles here)
│   └── calendar.yaml             # ← central-bank meeting dates (update yearly)
├── brand/                        # original logo files + palette (unmodified)
├── docs/                         # DATA_SOURCES, METHODOLOGY, AUDIT_AND_ARCHITECTURE
├── tools/run_tests.py            # runs pytest, or a stdlib fallback
├── .github/workflows/            # build-and-deploy, tests, probe-sources
├── requirements.txt              # requests, PyYAML
└── requirements-dev.txt          # + pytest
```

## 4. Data providers
| Provider | Used for | Key? |
|---|---|---|
| FRED (St. Louis Fed) | The core macro source: fed funds (daily since 1954), target and range, IORB/IOER, SOFR and averages, full CMT curve and bills, TIPS, breakevens, H.4.1, money, credit, inflation, labour, activity, housing, fiscal, SEP, US indices, VIX, FX, energy, metals, crypto, international rates, release calendar. The broad watchlist is `fred_library` in `pipeline/config/series.yaml`. | **Yes** (free) |
| NY Fed Markets API | EFFR, OBFR, SOFR, TGCR, BGCR with percentiles and volumes | No |
| U.S. Treasury | Par yield curve XML (fallback for the US curve, which is built from FRED's DGS series); FiscalData: daily TGA, auctions | No |
| Deutsche Bundesbank | Bund yield curve (Svensson), 1–30Y | No |
| Bank of England | Bank Rate, gilt par yields 5/10/20Y | No |
| Bank of Canada | Policy rate, GoC benchmark yields | No |
| Ministry of Finance Japan | JGB curve | No |
| BIS | Policy rates: Fed, ECB, BoE, BoJ, BoC, SNB, RBA | No |
| Coinbase Exchange | BTC, ETH, PAXG (gold proxy) daily | No |
| Medium RSS, central-bank RSS | Research index, official headlines | No |

Licensing, rate limits, coverage, fallbacks and test evidence: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## 5. API-key configuration
Only one secret is needed.
1. Get a free key at https://fredaccount.stlouisfed.org/apikeys. **Rotate the old key**: it was committed in the previous version and remains in git history.
2. GitHub → repository **Settings → Secrets and variables → Actions → New repository secret**. Name it `FRED_API_KEY`.
3. For local runs, set `export FRED_API_KEY=…` (or use an untracked `.env` file). The key is never written to `site/` and never reaches the browser. The HTTP layer also redacts it from logs.

## 6. Local installation
```bash
git clone https://github.com/wickresearch/wickresearch.github.io.git
cd wickresearch.github.io
python3 -m venv .venv && source .venv/bin/activate     # Python ≥ 3.11
pip install -r requirements-dev.txt
```
Node.js ≥ 20 is needed only for the front-end unit tests. There is no front-end build step.

## 7. Local development
```bash
export FRED_API_KEY=your_key
python -m pipeline.run --out site/data --mode full      # first time: full history (~3–5 min)
python -m http.server 8000 -d site                      # open http://localhost:8000
```
* Faster iteration: `python -m pipeline.run --out site/data --previous site/data` refreshes incrementally on top of your last local build.
* Run a subset: `--only UST10Y CPI calendar` (series IDs or `calendar news research auctions events`). The rest of the catalogue is kept from `--previous`.
* Edit HTML, CSS and JS directly and reload the browser.

## 8. Running the data pipeline
`python -m pipeline.run [--out DIR] [--previous URL|DIR] [--mode incremental|full] [--only …] [--log-level DEBUG]`

* `--previous` (or env `WICK_PREVIOUS_BASE`) points to the last good build. In CI this is the live site's `/data`. It is used for incremental fetching and for fallback.
* Outputs: `catalog.json` (every series with metadata, latest values, changes, status), `series/<ID>.json`, `curves/<US|DE|UK|JP|CA>.json`, `calendar.json`, `news.json`, `research.json`, `auctions.json`, `events.json` and `status.json` (run report).
* Exit code is non-zero only if nothing at all could be produced. Partial failures are recorded in `status.json` and in the Actions job summary.

## 9. Tests
```bash
python tools/run_tests.py                       # or: python -m pytest -q pipeline/tests
node --test site/assets/js/tests/*.test.mjs
python -m pipeline.probe --out probe.json       # live check of every provider (needs network + key)
```
* `test_parsers.py` checks each provider parser against recorded or representative payloads.
* `test_calc.py` covers the pipeline calculations: as-of joins, y/y, annualisation, realised vol, net liquidity, summaries and staleness.
* `test_run_resilience.py` is an end-to-end run with simulated outages. It asserts fallbacks, secondary sources and that the run never crashes.
* `stats.test.mjs` covers VaR/ES, risk contributions, OLS, duration/DV01, bill forwards, curve shocks, sizing, event paths and regime lagging.

## 10. Scheduled updates
`.github/workflows/build-and-deploy.yml` runs on every push to `main` that touches the site, content or pipeline, and on this schedule (UTC):

| Cron | Why |
|---|---|
| 13:20 Mon–Fri | NY Fed rates (~08:00 ET) and the Daily Treasury Statement are out |
| 21:50 Mon–Fri | FRED/H.15 and US closes are updated |
| 23:40 Mon–Fri | Treasury par curve (~18:00 ET) and UTC crypto close |
| 05:20 daily | BoJ/MoF, BIS, RSS; weekend crypto |
| 04:10 Sunday | **full** refetch (catches deep revisions) and a keep-alive commit |

GitHub may delay cron runs. The terminal header always shows when the data were built, and each series shows its own observation date.

## 11. Deployment (wickresearch account)
The site moves from `macroalphaconsultancy.github.io` to **`wickresearch.github.io`**. A GitHub *user site* is served at `<account>.github.io` only when the repository has exactly that name.

One-time setup:
1. On the `wickresearch` account, create a **public** repository named **`wickresearch.github.io`**. Leave it empty: no README or licence.
2. Push this code to it, either by giving Claude access (link GitHub in claude.ai → Settings → Connectors, allowing the `wickresearch` account or the new repo) or yourself:
   ```bash
   git clone <this bundle or zip>  &&  cd wickresearch.github.io
   git remote set-url origin https://github.com/wickresearch/wickresearch.github.io.git   # or: git remote add origin …
   git push -u origin main
   ```
3. **Settings → Secrets and variables → Actions → New repository secret:** `FRED_API_KEY` (a new key; see §5).
4. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
5. **Actions → Build data & deploy site → Run workflow** with mode `full` (the first run fetches full histories, about 5–8 minutes). Then run **Probe data sources** once.
6. Retire the old site: copy `tools/legacy-redirect/index.html` and `404.html` into the **old** `macroalphaconsultancy.github.io` repository (replacing its contents) and delete its old workflows. Every old URL, including `/dashboard.html`, then forwards to the same path on `wickresearch.github.io`. Update the link on your CV and LinkedIn.

After that, deployment is automatic. To publish content changes, edit `content/articles.yaml` on github.com and commit. A custom domain can be added later under Settings → Pages (see the audit doc, §3).

## 12. Troubleshooting
| Symptom | Where to look / what to do |
|---|---|
| A tile shows **LAST GOOD** | The provider failed on the latest run. See the terminal's *Sources & status* page or the Actions job summary. It usually clears on the next run. |
| A tile shows **STALE** | The provider has not published new data, or the series was discontinued. Check the provider link on the series page. If it was discontinued, replace it in `series.yaml`. |
| Whole terminal says "Data files unavailable" | The deploy produced no `data/`. Open the latest Actions run and check the *Run data pipeline* step. |
| FRED errors: `FRED_API_KEY is not set` / HTTP 400 | The secret is missing or wrong (§5). |
| Bank of England curve empty | The BoE CSV format is the one partially verified source. Run *Probe data sources* and read `boe_csv`. The parser in `pipeline/providers/boe.py` tolerates title rows. |
| Schedules stopped | GitHub disables cron after 60 days of inactivity. The Sunday keep-alive commit prevents this. If it happens anyway, re-enable the workflow in the Actions tab. |
| Debugging locally | `python -m pipeline.run --only SERIES_ID --log-level DEBUG --out /tmp/out` |

## 13. Adding a new data series
1. Find the series at its provider (for FRED, the ID shown in the URL).
2. Add one line to `pipeline/config/series.yaml`. Copy a similar entry and set `id`, `name`, `group`, `provider`, `key`, `units`, `freq`, `change` (`bp` / `pct` / `abs`), `type` and `check`.
3. `python -m pipeline.run --only NEW_ID --previous site/data`, then check `site/data/catalog.json` and `/terminal/#series/NEW_ID`.
4. To show it in a module, add its ID to that module's list (for example `GROUPS` in `modules/markets.js`, or a `chartPanel(...)` call).
5. **FRED shortcut:** to add any FRED series, append its ID to a group under `fred_library:`. Name, units and frequency come from FRED's metadata, and the series appears in the terminal's FRED library (and at `#series/<ID>`) after the next build.
6. For a derived series, add an entry under `derived:` using an existing `op`. A new formula belongs in `pipeline/calc.py`, with a test.
7. For a **new provider**, test it first and record the result in `docs/DATA_SOURCES.md`. Then add an adapter in `pipeline/providers/`, a parser test with a fixture, a branch in `Run.fetch_one`, a registry entry in `sources.yaml` and a probe in `probe.py`.

## 14. Adding a terminal module
1. Create `site/assets/js/terminal/modules/<id>.js` exporting `async function render(root, { params, setParams, go })`.
2. Register it in `MODULES` in `site/assets/js/terminal/app.js` (id, title, group).
3. Use the helpers: `tiles`, `seriesTable`, `chartPanel` (`modules/common.js`); `panel`, `table`, `segmented` (`ui.js`); `timeChart`, `curveChart`, `heatmap` (`chart.js`); calculations from `stats.js`. Put new maths in `stats.js` with a test.
4. Call `setParams({...})` to keep the view shareable by URL.

## 15. Known limitations
* **No real-time data.** Everything is end-of-day or latest-published, refreshed about 5 times a day.
* **No futures-implied policy path or meeting probabilities.** CME data is licensed. A T-bill forward proxy and the FOMC SEP median are shown instead.
* **Not covered:** European and other Asian equity indices, MOVE, ICE DXY, ISM and S&P Global PMIs, consensus forecasts, UK CPI, spot silver. Gold is shown only through the PAXG proxy, and copper monthly.
* **Licence-limited history:** S&P 500 and Dow (10 years on FRED); ICE BofA credit spreads (about 3 years).
* **Partially verified:** Bank of England CSV export and MoF JGB history file. Both are confirmed on the first GitHub run (*Probe data sources*). Until then the UK and Japan curves may be short or flagged.
* **BIS policy rates** can lag announcements by days. Central-bank meeting dates in `content/calendar.yaml` need a yearly update.
* **LinkedIn articles** have no public API. Add them to `content/articles.yaml` by hand.
* **Saved views** (instrument selections, portfolios) are stored in the viewer's browser (`localStorage`). Shareable state lives in the URL hash. Accounts or server-side saved views would need a backend.
* **Approximations** (documented in METHODOLOGY.md): first-order bond return proxy and DV01 P&L, simple-rate bill forwards, close-to-close event windows.
