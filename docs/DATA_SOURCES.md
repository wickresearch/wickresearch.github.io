# Wick Research — Data-Source Matrix and Verification Record

**Verification date:** 10 October 2026 (Europe/London)
**Method:** representative API calls to each provider. All provider responses quoted below came from live calls on that date.
Shell egress from the build environment is restricted. Calls were therefore made with an HTTP fetch tool from the public internet.
This file is the reference for which sources the terminal is allowed to depend on. A source moves to `enabled: true` in
`pipeline/config/sources.yaml` only when its status here is **Verified** or **Partially verified with a documented gap**.

> **Re-verification.** `python -m pipeline.probe` (also the *Probe data sources* GitHub Actions workflow) re-runs one
> representative call per source from a GitHub runner and writes `data/probe.json`. Use it after adding a provider, and
> whenever a provider changes its API.

## 1. Status definitions

| Status | Meaning |
|---|---|
| **Verified** | A representative call on the verification date returned current, correctly structured data. The parser target (JSON keys / CSV columns / XML fields) was observed. |
| **Partially verified** | The provider responded and data was observed, but at least one item is unconfirmed. Examples: the exact export format the pipeline parses, history depth, licensing detail, or only some series. The gap is stated. |
| **Not verified** | No usable response from this environment (robots-blocked, error, needs a key we do not hold), or the data was found to be stale or discontinued. **Not used by the terminal.** |

## 2. Provider matrix

| # | Provider | Datasets used | Endpoint (representative) | Auth | Rate limit | Historical coverage* | Provider refresh | Licensing / public-site use | Fallback | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | **FRED API** (St. Louis Fed) | US Treasury CMT yields, TIPS real yields, breakevens, admin rates (target range, IORB), EFFR, SOFR, H.4.1 balance sheet, TGA, ON RRP, macro releases (BLS/BEA/Census/Fed mirrors), NFCI, STLFSI4, HY OAS, US indices, VIX/GVZ, H.10 FX, EIA energy spot, IMF copper, euro-area HICP, FOMC SEP medians, GDPNow, release calendar | `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=…&file_type=json`; `…/fred/series?series_id=…`; `…/fred/releases/dates`; `…/fred/release/dates?release_id=…` | **Free API key** (GitHub secret `FRED_API_KEY`) | 120 requests/min per key (FRED docs). The pipeline sleeps 0.6 s between calls. | Series-dependent: DGS10 1962-; DGS1MO 2001-; DFII10 2003-; SOFR 2018-; IORB 2021-; WALCL 2002-. **SP500/DJIA: rolling 10 years only** (2,610 obs; first obs 2016-10-10). **BAMLH0A0HYM2: rolling ~3 years only** (first obs 2023-10-10) | Same day to next business day for markets; per release schedule for macro | FRED's own and Fed/BLS/BEA data are public. **Third-party series (S&P, Dow Jones, ICE BofA, CBOE, Nikkei, Coinbase) are copyrighted by their owners.** FRED shows them with citation, and some owners limit the history shown. The pipeline stores each series' `notes` copyright line and the terminal shows the owner. | NY Fed API for EFFR/SOFR; Treasury XML for curve; BIS for policy rates | **Verified**. Tested on 10 Oct: DGS10 (2026-10-08 = 5.22), DGS1MO, T5YIFR, IORB, WRESBAL, TREAST, WSHOMCB, CBBTCUSD, NFCI, STLFSI4, GDPNOW, CES0500000003, GACDFSA066MSFRBPHI, GVZCLS, FEDTARMD (metadata), BAMLH0A0HYM2, SP500, DJIA, series search, releases/dates. Production `data/raw.json` (written by the existing Actions job on 9 Oct) confirms 59 further series. |
| P2 | **NY Fed Markets Data API** | EFFR, OBFR, SOFR, TGCR, BGCR with 1st/25th/75th/99th percentiles and volumes; ON RRP operation results; SOMA holdings summary | `https://markets.newyorkfed.org/api/rates/all/latest.json`; `/api/rates/secured/sofr/search.json?startDate=…`; `/api/rp/reverserepo/propositions/search.json?startDate=…`; `/api/soma/summary.json` | None | None published. The pipeline makes fewer than 10 calls per run. | SOFR/TGCR/BGCR 2018-04-; EFFR/OBFR 2016- via API | Daily ~08:00 ET for the prior business day | NY Fed terms of use: public data, attribution required | FRED (EFFR, SOFR, RRPONTSYD) | **Verified**. `rates/all/latest.json` returned EFFR 3.88 (2026-10-08, target 3.75–4.00, vol $117bn), SOFR 3.87 (vol $2,963bn), TGCR/BGCR 3.85. RRP ops returned 2026-10-01…10-09 totals. SOMA summary returned (the fetch tool truncated the payload, but the structure was confirmed). |
| P3 | **US Treasury — Daily Par Yield Curve (XML feed)** | Full par curve 1M…30Y including 6W/1.5M, 4M | `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=YYYY` | None | Not published | 1990- | Each business day ~18:00 ET | US Government work, public domain | FRED DGS* | **Verified**. 2026-10-09 entry: 1M 4.13, 3M 4.25, 6M 4.32, 1Y 4.47, 2Y 4.80, 5Y 5.02, 10Y 5.24, 30Y 5.60. |
| P4 | **US Treasury FiscalData API** | Daily Treasury Statement: TGA operating cash balance; auction results (`auctions_query`) | `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance?sort=-record_date&page[size]=…`; `/v1/accounting/od/auctions_query?sort=-auction_date` | None | Not published (open data) | DTS 2005-; auctions 1979- | DTS: ~16:00 ET next business day; auctions: same day | Public domain | FRED WTREGEN (weekly) | **Verified**. DTS 2026-10-08: TGA opening balance $885,783m. Auctions: 2026-10-13 bills (6/13/26-week) announced with offering amounts; results null until auction. |
| P5 | **Deutsche Bundesbank Statistics API** | German Federal securities yield curve (Svensson, daily) at 1–30Y residual maturities | `https://api.statistiken.bundesbank.de/rest/data/BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A?lastNObservations=…` (tenor code `R02XX`, `R05XX`, `R10XX`, `R30XX` …) | None | Not published | 1997- (daily) | Business days, T+0/T+1 | Free reuse with source attribution ("Deutsche Bundesbank") | FRED IRLTLT01DEM156N (monthly 10Y only) | **Verified** (default SDMX-ML format). 2026-10-09: 2Y 3.08, 5Y 3.21, 10Y 3.53, 30Y 3.94. The CSV format request came back non-text, so the pipeline parses SDMX-ML. |
| P6 | **Bank of England IADB** | Bank Rate (IUDBEDR), gilt nominal par yields 5Y/10Y/20Y (IUDSNPY, IUDMNPY, IUDLNPY) | `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&SeriesCodes=…&UsingCodes=Y&CSVF=TN&Datefrom=…&Dateto=now` | None (the endpoint is known to reject requests without a browser-style User-Agent) | Not published | Bank Rate 1975-; par yields 1970s- | Daily, ~T+1 | BoE terms: reuse with attribution | BIS (Bank Rate); FRED IRLTLT01GBM156N (monthly 10Y) | **Partially verified**. The HTML view of the same IADB query returned data: IUDMNPY 07 Oct 26 = 5.3852, IUDBEDR 3.75. The CSV export (what the pipeline parses) responded with a non-text payload that could not be inspected here. **Gap:** the CSV parse is confirmed on the first GitHub run (the probe workflow checks it). |
| P7 | **Bank of Canada Valet API** | Target for the overnight rate (V39079); GoC benchmark yields 2/5/10Y/long (BD.CDN.*.DQ.YLD) | `https://www.bankofcanada.ca/valet/observations/V39079,BD.CDN.10YR.DQ.YLD/json?start_date=…` | None | Not published | Policy rate 2009- (daily series); benchmarks 2001- | Daily | BoC terms: reuse with attribution | BIS (policy rate) | **Verified**. 2026-10-06…08: target 2.25%; 10Y 3.92/3.94/3.93. |
| P8 | **Ministry of Finance Japan** | JGB constant-maturity yields 1–40Y | Current month: `https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv`; history: `…/historical/jgbcme_all.csv` | None | Not published | 1974- (history file) | Daily | Government of Japan standard terms (attribution) | FRED IRLTLT01JPM156N (monthly 10Y) | **Partially verified**. Current-month CSV verified (2026/10/8: 2Y 1.936, 10Y 3.089, 30Y 4.136). **Gap:** the history file URL has not been fetched; the pipeline falls back to current-month data only. |
| P9 | **BIS Data Portal (SDMX v1)** | Central-bank policy rates (WS_CBPOL), daily: US, XM, GB, JP, CA, CH, AU and others | `https://stats.bis.org/api/v1/data/WS_CBPOL/D.US+XM+GB+JP+CA+CH+AU/all?startPeriod=…&format=csv` | None | Not published | 1946- for some economies | Weekly-ish updates (BIS compiles from CBs). **Can lag the CB announcement by several days.** | BIS terms: free reuse with attribution | FRED (DFEDTARU/L, ECBDFR); BoE/BoC direct | **Verified**. 2026-10-05/06: US 3.875 (mid-range), XM 2.50 (DFR), GB 3.75, JP 1.25 (raised from 24 Sep 2026), CA 2.25. |
| P10 | **Coinbase Exchange public API** | BTC-USD, ETH-USD daily candles; PAXG-USD (tokenised gold) | `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=…&end=…` | None | 10 req/s public; max 300 candles per request | BTC 2015-; PAXG ~2021- | Continuous; we store daily UTC candles | Coinbase market-data terms permit display. **Redistribution of bulk history is not explicitly licensed. We show derived charts, not bulk downloads, for this source.** | FRED CBBTCUSD / CBETHUSD (Coinbase via FRED, daily) | **Verified** (BTC candles: 350 daily rows; PAXG ticker 4,183.84 at 2026-10-09 23:42 UTC). Licence detail: **partial**. |
| P11 | **Frankfurter** (ECB euro reference rates) | Cross-check of major FX | `https://api.frankfurter.dev/v1/latest?from=USD&to=EUR,GBP,JPY,CHF,CAD` | None | Fair-use | 1999- | ECB publishes ~16:00 CET daily | ECB reference rates: free reuse; Frankfurter is a community service (no SLA) | FRED H.10 | **Verified** (2026-10-09: EUR 0.89238, GBP 0.75641, JPY 158.25). Used only as a secondary FX source. |
| P12 | **Medium RSS** | Ishrit's articles (title, link, date, tags) | `https://medium.com/feed/@ishritt` | None | n/a | **Last 10 posts only** | On publish | Metadata + link only; no article text is republished | `content/articles.yaml` (manual) | **Verified**. 9 posts returned, May 2021 – Sep 2026. |
| P13 | **Official RSS feeds** | Fed monetary-policy press releases; BoE news; ECB press; BoJ what's new | `https://www.federalreserve.gov/feeds/press_monetary.xml`; `https://www.bankofengland.co.uk/rss/news`; `https://www.ecb.europa.eu/rss/press.html`; `https://www.boj.or.jp/en/rss/whatsnew.xml` | None | n/a | Recent items only | On publish | Headlines + links only | — | **Verified** (all four returned items dated 5–9 Oct 2026; Fed: FOMC minutes 7 Oct 2026). |
| P14 | **Central-bank meeting calendars** (official web pages, curated) | FOMC, MPC, ECB GC, BoJ MPM, BoC FAD dates | federalreserve.gov/monetarypolicy/fomccalendars.htm; bankofengland.co.uk/monetary-policy/upcoming-mpc-dates; ecb.europa.eu/press/calendars/mgcgc; boj.or.jp/en/mopo/mpmsche_minu; bankofcanada.ca/press/upcoming-events | n/a (no API) | n/a | As published | Annually | Facts (dates) with links | — | **Verified on 10 Oct 2026** and transcribed into `content/calendar.yaml`. The ECB page lists only upcoming meetings (Oct 2026 onward). BoC lists only Oct and Dec 2026. 2027 Fed dates are tentative per the Fed. |
| P15 | **FRED release calendar** | Scheduled release dates (CPI, Employment Situation, PCE, GDP, H.4.1, FOMC press release …), historical release dates for event studies | `https://api.stlouisfed.org/fred/releases/dates?include_release_dates_with_no_data=true&realtime_start=…`; `/fred/release/dates?release_id=10` | FRED key | as P1 | Release dates back to the 1990s+ | Daily | As P1 | — | **Verified** (1,347 scheduled entries 10 Oct–30 Nov 2026 including FOMC Press Release, H.15, IORB, MTS). |

\*Coverage is taken from provider documentation and the test responses. The pipeline records each series' actual first and last
observation in `data/catalog.json`, and the terminal's *Sources & status* panel displays those values.

## 3. Sources investigated and **not used**

| Source | What was tested | Result | Decision / alternative |
|---|---|---|---|
| **ECB Data Portal API** (`data-api.ecb.europa.eu`) | YC (AAA curve), EXR | Fetch blocked by the host's robots policy in this environment; not verified | Not used. The Bund curve comes from the **Bundesbank** (P5), the deposit rate from **BIS/FRED**, euro HICP from **FRED CP0000EZCCM086NEST**, and EUR/USD from **FRED/Frankfurter**. Re-test with the probe workflow if the AAA curve is wanted. |
| **Eurostat** `prc_hicp_manr` | geo=EA20 and EA | Responded, but the latest observation is **Dec 2025** (dataset last updated Feb 2026). It appears frozen after Eurostat's 2026 COICOP change. | Not used (stale). FRED's changing-composition HICP (observation_end 2026-08) is used. |
| **ONS API** (UK CPI) | `api.beta.ons.gov.uk`, CSV generator | Client error and non-text payload | **UK CPI is not shown.** FRED's OECD UK CPI series end in **Mar 2025** (stale), so they are not used either. |
| **Yahoo Finance** (unofficial) | chart API | Robots-blocked. The API is undocumented and Yahoo's terms prohibit redistribution. | Not used. |
| **Stooq** CSV | ^SPX daily | Robots-blocked; terms unclear | Not used. This was the only candidate found for European/Asian indices, silver and spot gold, so **those instruments are not shown** (see §5). |
| **CoinGecko** | simple/price | Robots-blocked. The public API now requires a demo key and attribution. | Not used. Coinbase (P10) and FRED cover BTC/ETH. |
| **LinkedIn** (company page / articles) | company page | Robots-blocked; no free public API for personal articles | Articles are maintained in `content/articles.yaml` (one entry per article). |
| **OECD SDMX** | CLI | Non-text payload, not inspected | Not used (not needed for the priority modules). |
| **World Bank API** | GDP growth | Server error | Not used (not needed). |
| **CFTC COT (Socrata)** | 10Y note legacy report | The query returned only 2022 rows; the dataset ID or filter needs work | Deferred (Priority 6). |
| **BLS / BEA / EIA direct APIs** | — | Not tested (keys required). FRED mirrors the needed series and was verified. | Not used. FRED is the single macro gateway, which reduces key management to one secret. |
| **CME futures (SR3, ZQ), MOVE index, ICE DXY, ISM PMIs, S&P Global PMIs, LBMA gold/silver** | — | Proprietary or licensed. No free redistributable API exists. FRED's ISM (NAPMPI) and LBMA gold series are discontinued (null in the production `raw.json`). | Not shown. See §5 for the substitutes used. |

## 4. Findings from the existing pipeline (audit evidence)

The current `data/raw.json` was produced by the existing GitHub Actions job (last run 9 Oct 2026). It shows:

* **The FRED API key is hard-coded in four public Python files.** It must be **rotated** at fredaccount.stlouisfed.org and stored as a GitHub Actions secret. The new pipeline reads it from the `FRED_API_KEY` environment variable only.
* 15 of 74 configured series return nothing: `NAPMPI`, `GOLDAMGBD228NLBM`, `DAX`, `FTSE100`, `FRANCE40`, `STOXX50E`, `HANGSENG`, `SHCOMP`, `RUT`, `WILL5000PR`, `SP500REAL`, `JPNASSETSW`, `CHNASETS`, `IRLTLT01CNM156N`, `IRSTCB01GBM156N`. These series are discontinued or not on FRED.
* **Stale values are displayed as current.** `RESBALNS` (bank reserves) ends **Aug 2020**, yet the dashboard shows it. `IRSTCB01JPM156N` (labelled "BOJ Policy Rate") ends **Dec 2023 at 0.30%**, while BIS shows the BoJ at **1.25%** since 24 Sep 2026.
* `DTWEXBGS` is labelled **"DXY"**. It is the Fed's *Nominal Broad U.S. Dollar Index*, not ICE's DXY.
* No timestamps, units or sources are shown, and "MOVE", "Fed Funds Futures" and "MSCI World" tiles are permanently blank.

## 5. Feature verification classification

**Verified**: built on Verified sources. **Partially verified**: built, but one component carries the gap stated. **Not verified / not available**: not built as a live widget; the alternative is given.

| Module / feature | Sources | Classification | Notes / limitation |
|---|---|---|---|
| **US Treasury curve** (1M–30Y), curve snapshots vs 1W/1M/1Y ago, tenor changes, 2s10s, 5s30s, 3M10Y | P3, P1 | **Verified** | Par yields, end-of-day. |
| **Real yields & breakevens** (5Y/10Y/30Y TIPS, 5Y/10Y BE, 5y5y) | P1 | **Verified** | |
| **Front-end: target range, IORB, ON RRP rate, EFFR, SOFR, TGCR, BGCR + percentiles/volumes** | P1, P2 | **Verified** | Labelled by type: *administered*, *overnight market*, *Treasury yield*. |
| **Front-end pricing proxy** (T-bill forward rates vs EFFR; 2Y–EFFR spread) | P3, P2 | **Verified (derived)** | **Not OIS/futures-implied and not a probability.** T-bill forwards include bill supply and term-premium effects. The formula is shown in the terminal. |
| **Fed funds / SOFR futures strip, meeting-by-meeting probabilities** | — | **Not available** | CME data is licensed. Shown instead: the T-bill forward proxy above and FOMC SEP medians (FEDTARMD, verified). |
| **German Bund curve** (1–30Y Svensson) | P5 | **Verified** | |
| **JGB curve** | P8 | **Partially verified** | Current month verified; history file unverified. |
| **Canada curve** (2/5/10/long benchmarks) | P7 | **Verified** | |
| **UK gilt curve** (5/10/20Y par) + Bank Rate | P6 (BIS fallback for Bank Rate) | **Partially verified** | Data observed via the HTML view. CSV parse is confirmed on the first Actions run. If it fails, the module shows "unavailable" with the timestamp of the last good data. |
| **Cross-country 10Y differentials** (US–DE, US–UK, US–JP, US–CA) | P1/P3, P5, P6, P7, P8 | **Partially verified** | Inherits the UK/JP gaps. |
| **Central-bank policy rates & history** (Fed, ECB, BoE, BoJ, BoC, SNB, RBA) | P9, P1 | **Verified** | BIS can lag announcements by days. The Fed and ECB also come from FRED daily. |
| **Meeting calendars** | P14 | **Verified (curated)** | Updated manually from the official pages; each entry links to its source. |
| **Official statements / minutes / speeches feed** | P13 | **Verified** | Headlines and links only. |
| **FOMC SEP median path vs EFFR** | P1 | **Verified** | |
| **US liquidity: WALCL, Treasuries/MBS held, reserves (WRESBAL), TGA (weekly + daily DTS), ON RRP, repo spreads (SOFR−IORB, SOFR 99th pct − IORB, TGCR−RRP)** | P1, P2, P4 | **Verified** | |
| **Net-liquidity proxy** (WALCL − TGA − ON RRP) | P1 | **Verified (derived)** | Components, units (USD bn) and Wednesday alignment are shown. It is labelled as a proxy, not an official measure. |
| **Treasury auctions** (recent results, upcoming) | P4 | **Verified** | |
| **Inflation: CPI, core CPI, PCE, core PCE, PPI; YoY / MoM / 3m annualised** | P1 | **Verified** | Shows observation month and release date separately. |
| **Labour: payrolls, unemployment, AHE, claims, participation, JOLTS** | P1 | **Verified** | |
| **Activity: IP, retail sales, housing starts/permits, UMich sentiment, Philly Fed, NFCI, STLFSI4, GDPNow** | P1 | **Verified** | GDPNow is labelled *model estimate*. |
| **ISM manufacturing/services, S&P Global PMIs, Conference Board confidence** | — | **Not available** | Proprietary. Substitutes: Philadelphia Fed manufacturing survey (verified), UMich sentiment. |
| **Euro-area HICP** | P1 | **Verified** | UK CPI not available (see §3). |
| **Markets overview: S&P 500, Nasdaq, Dow, Nikkei 225, VIX, GVZ, broad USD index, EUR/GBP/JPY/CHF/CAD/CNY vs USD, WTI, Brent, Henry Hub, BTC, ETH** | P1, P10 | **Verified** | All **end-of-day / latest published**; nothing is real-time. S&P/Dow history is limited to 10 years by licence. |
| **European & other Asian equity indices (DAX, FTSE, STOXX 50, Hang Seng, Shanghai)** | — | **Not available** | No verified free, redistributable source. They are listed in the terminal as "not covered" rather than shown blank. |
| **Gold** | P10 (PAXG-USD) | **Partially verified** | **Proxy only**: PAX Gold is a token redeemable for LBMA gold, priced on Coinbase, and can deviate from spot. It is labelled as such. FRED's LBMA series is discontinued. |
| **Silver, industrial metals (daily)** | — | **Not available** | Copper is shown **monthly** (IMF via FRED, PCOPPUSDM). |
| **Bond volatility (MOVE)** | — | **Not available** | Substitute: **realised volatility of daily 10Y yield changes** (bp, annualised), labelled as derived. |
| **HY credit spreads** | P1 | **Partially verified** | Rolling ~3-year history only (ICE licence on FRED). |
| **Cross-asset: performance table, correlation matrix, rolling correlation, normalised performance, rolling vol, drawdowns** | derived from verified series | **Verified (derived)** | Calculations are tested (`pipeline/tests`, `site/assets/js/tests`). |
| **Event studies** (FOMC, CPI, payrolls) | P15 + daily series | **Verified (derived)** | Close-to-close windows using daily data; intraday timing is not resolvable. |
| **Regime analysis** (growth × inflation) | P1 | **Verified (derived)** | Publication-lagged to avoid look-ahead (see METHODOLOGY.md). |
| **Portfolio risk, rates risk/DV01, stress tests, position sizing** | User inputs + verified series | **Verified (derived)** | Hypothetical/user-supplied positions only. Bond returns are a duration-based proxy from par yields. |
| **Economic calendar (dates)** | P15, P14 | **Verified** | **No consensus or actual-vs-consensus values.** No free licensed source exists. |
| **Research library** | P12 + `content/articles.yaml` | **Verified** (Medium). LinkedIn entries: manual. | |
| **Real-time / intraday quotes** | — | **Not available** | The architecture is scheduled static builds. The terminal never labels data "live". |

## 6. FRED library (added 10 October 2026)

The terminal's **FRED library** module and `fred_library` in `pipeline/config/series.yaml` add about 170 FRED series across 12 themes: fed funds and policy rates (daily since 1954), Treasury yields and bills, real yields and inflation expectations, the Fed balance sheet and liquidity, credit and financial conditions, inflation, labour, growth and housing, fiscal, FOMC SEP projections, markets, and international data. IDs already configured elsewhere are referenced rather than fetched twice.

| Evidence | Series |
|---|---|
| **Tested 10 Oct 2026** (current data returned) | DFEDTAR (ends 2008-12-15, as expected), DPCREDIT, SOFR30DAYAVG, T10YFF, WLRRAL, MEDCPIM158SFRBCLE, FEDTARMDLR, PCECTPIMD (dated by target year to 2029), DTWEXAFEGS, plus every ID tested in §2 |
| **Confirmed by the old production pipeline** | CUSR0000SEHA, TCU, HSN1F, EXHOSLUSM495S, ECBASSETSW and the other series in §4 |
| **Not yet verified** (same FRED API; checked on the first pipeline run) | All other library IDs. **WEI** could not be tested because the verification fetch was rate-limited. |

A library ID that FRED does not return is reported as `failed` in *Sources & status* and greyed out in the library. It never breaks a build. SEP projection series are dated by target year, so they are allowed future dates (`allow_future_days`).

## 7. First production run (10 October 2026, GitHub Actions, full mode)

Run `38045736794` on `wickresearch/wickresearch.github.io`, 10:52–11:06 UTC, with `FRED_API_KEY` set: **269 of 270 series OK, 1 failed**. Per provider: FRED 171 OK / 1 failed, NY Fed 7, Coinbase 3, FiscalData 1, Treasury curve 1, Bundesbank 1, **Bank of England 1**, **MoF Japan 1**, Bank of Canada 1, BIS 7. Calendar, news, research, auctions and events all built without errors.

* **Bank of England CSV export** and **MoF JGB history file** are now **verified**. Both parsed successfully from GitHub's runners.
* The one failure was `GACDINA066MSFRBNY` (my guessed ID for the Empire State survey). FRED returned HTTP 400, so it was removed from the library rather than replaced with another guess.
* Staleness thresholds were tuned to actual publication lags seen in this run: H.10 FX and broad-dollar indices (weekly release, 12 days), Kim–Wright term premium (12), IMF metals and Case-Shiller (130), weekly M2 (45) and the ECB balance sheet (21). DFEDTAR and IOER are marked historical. The OECD 3-month interbank series (ending January 2026) were removed.
* Each run's report is published to the `pipeline-status` branch (`status.json`, `SERIES.md`).
* **Run time.** The incremental run took about 14 minutes. Timings showed the Treasury XML feed took 493 s and FRED 287 s, with every other provider under 15 s. The US curve is now assembled from FRED's DGS1MO…DGS30 series, which are fetched anyway, so it needs no extra calls. The Treasury XML feed is the automatic fallback. The trade-off: the 6-week, 2-month and 4-month bill points (Treasury only) are no longer on the curve.
