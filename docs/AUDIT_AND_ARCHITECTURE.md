# Audit (Phase 1) and architecture decision (Phase 2)

*Prepared 10 October 2026 from the repository at commit `4284a33`, the live site and the attached CV.*

## 1. Audit of the previous site

| Area | Finding | Decision |
|---|---|---|
| Architecture | Static HTML on GitHub Pages, served from the root of `main`. Three GitHub Actions workflows ran Python scripts every 2 hours and daily, and committed `data/raw.json` and `data/derived.json` back to `main`. | **Keep** the GitHub Pages + Actions model. **Replace** the commit-the-data approach with build-time data and Pages artifacts (see §2). |
| Security | **The FRED API key was hard-coded in four public Python files** (`backend/*.py`). | **Removed.** The key is now read from the `FRED_API_KEY` Actions secret. **Rotate the old key**: it remains in git history. |
| Data correctness | 15 of 74 FRED series returned nothing (ISM `NAPMPI`, LBMA gold, DAX/FTSE/STOXX/Hang Seng/Shanghai, Russell, Wilshire, China 10Y, UK policy rate, BoJ/PBoC balance sheets). Stale series were displayed as current: bank reserves (`RESBALNS`, ends Aug 2020) and the "BoJ policy rate" (`IRSTCB01JPM156N`, ends Dec 2023 at 0.30%; BIS shows 1.25% since 24 Sep 2026). `DTWEXBGS` was labelled "DXY". | Every series was re-checked against its provider (see `DATA_SOURCES.md`). Discontinued series were dropped, stale ones replaced (reserves → `WRESBAL`; policy rates → BIS), and labels corrected. Staleness is now detected and shown. |
| Dashboard | Eight static pages of value tiles with no timestamps, units, sources, history or charts. Three tiles were permanently blank (MOVE, fed funds futures, MSCI World). The palette (white and teal) did not match the brand. | **Replaced** with a single terminal application (14 modules plus a series drill-down) in the brand palette. Old URLs redirect. |
| Research | `research.json` had one article, with the wrong date (shown as 2025-11-29; actually published 2021-05-20). | The library is rebuilt from the Medium RSS feed (9 articles, verified) and `content/articles.yaml`. |
| Branding | Logo PNGs: cream candle-bars mark and wordmark with glow on a grey field. CSS palette: navy `#0D1B2A`, card `#0F2330`, slate `#415A77`, cream `#F2EECF`, text `#E8E8E8`. Inter and Arial fonts. Hero image alt text read "MAC logo". A legacy "Macro Alpha Consultancy" logo was still in the repo. | Palette and logos **kept**. Originals moved unmodified to `brand/`, and web versions produced only by cropping and resizing. Typography, spacing and density improved. The legacy MAC logo is kept in `brand/` but not used. |
| Positioning | The home page described a "boutique macro-strategy practice" offering services. | Repositioned as the research platform and professional portfolio of Ishrit Tewari, in line with the CV. |
| SEO | No meta descriptions, Open Graph tags, sitemap or robots.txt. | All added, plus structured data (schema.org Organization) and a 1200×630 social card. |

## 2. Hosting options compared

| | A. GitHub Pages + GitHub Actions (chosen) | B. Pages + free-tier backend (e.g. Cloudflare Workers, Render, Fly) | C. Cloudflare Pages + Workers + cron |
|---|---|---|---|
| Cost | Free (public repository: unlimited Actions minutes) | Free tiers, with limits on sleep, cold starts and request quotas | Free tier |
| Scheduled updates | Actions cron, about 5 runs a day (can be delayed several minutes). Laptop not needed. | Backend cron, plus a second deployment to maintain | Workers cron |
| API keys | Actions secrets. Never sent to the browser. | Backend environment variables | Worker secrets |
| What it can't do | Real-time or on-demand queries. Data is as fresh as the last run. | Can proxy live calls, but free market data isn't real-time anyway | As B |
| Maintenance | One repository, Python and static files | Two deployables, API versioning, uptime | New platform account and DNS |

**Decision: Option A.** Every verified source is end-of-day or published on a schedule, so a backend would add cost and moving parts without making the data any fresher. All analysis that depends on user input (risk, sizing, event studies, correlations) runs in the browser on static JSON, so no server-side computation is needed.

**Deployment detail.** The workflow builds `site/data/` at build time and deploys `site/` as a Pages artifact (`actions/deploy-pages`). Data is not committed, so `main` no longer gets about 12 commits a day of JSON churn. Before this change the repository had grown to 12 MB, mostly data commits. The previous deployment acts as the last-known-good cache: the pipeline downloads it, fetches incrementally, and falls back to it if a provider fails. A weekly keep-alive commit (`status/last-run.json`) stops GitHub from disabling scheduled workflows after 60 days without repository activity.

## 3. Account and URL: move to `wickresearch.github.io`

**Decision (10 Oct 2026, at your request): host on the `wickresearch` GitHub account as the user site `wickresearch/wickresearch.github.io`.**

* *Why:* the old account name ("Macro Alpha Consultancy") doesn't match the brand. A dedicated account gives a clean URL, `wickresearch.github.io`, at no cost.
* *Keeping old links working:* `tools/legacy-redirect/` contains an `index.html` and a `404.html` for the **old** repository. They forward every path to the same path on the new site, and the old dashboard pages to the matching terminal modules. Search engines see `noindex` plus a canonical link to the new site.
* *Later:* a custom domain (e.g. `wickresearch.com`, about £10/year) can be added under Settings → Pages. GitHub then redirects `wickresearch.github.io` to it automatically. Update `site/sitemap.xml`, `robots.txt` and the canonical/OG URLs (search for `wickresearch.github.io`).
* *Nothing in the code depends on the account name* apart from those URLs. The workflow derives the previous-build URL from `github.repository_owner`.

## 4. Stack

* **Data:** Python 3.11+ with `requests` and `PyYAML` only. Config in YAML, pure calculation functions, provider adapters with recorded-fixture tests.
* **Front end:** static HTML/CSS and vanilla ES modules, with no build step. Charts use **uPlot 1.6.31** (MIT, about 50 KB, vendored so there is no CDN dependency). There is no framework, because the site has to stay maintainable without a toolchain.
* **Scheduled jobs:** `.github/workflows/build-and-deploy.yml` (data + deploy), `tests.yml` (PRs and branches), and `probe-sources.yml` (manual source re-verification).
