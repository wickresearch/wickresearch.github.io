# Wick Macro Terminal: user guide

What you can do on the dashboard at **https://wickresearch.github.io/terminal/**, and when each kind of data refreshes.

---

## 1. How fresh the data is

The data pipeline checks for new data **every 15 minutes on weekdays** and **hourly at weekends**. When something new has been published, the site is rebuilt and redeployed within a few minutes. An open terminal tab checks for a new build **every minute** and redraws itself, so you do not need to reload.

| Data | Published by the source | On the terminal |
|---|---|---|
| US macro releases (CPI, payrolls, PCE, GDP, retail sales, claims, JOLTS, ISM-type surveys…) | 08:30 or 10:00 ET on release day, then mirrored by FRED | Usually 15–45 min after FRED posts it |
| NY Fed rates (EFFR, SOFR, OBFR, TGCR, SOFR percentiles and volume) | About 08:00 ET for the previous business day | Next 15-minute run after publication |
| Fed administered rates (target range, IORB, ON RRP rate) | When the Fed changes them, via FRED | Next run after FRED updates |
| US Treasury yields, TIPS, breakevens, curve | End of day (H.15 via FRED; Treasury par curve as fallback) | Same evening or next morning, UK time |
| Fed balance sheet (H.4.1), reserves, weekly TGA | Thursdays, 16:30 ET | Next run after publication |
| Daily TGA (Daily Treasury Statement) | About 16:00 ET for the previous day | Next run |
| Equities, VIX, FX (H.10), oil, credit spreads | End of day, via FRED | When FRED posts the close |
| Germany, UK, Japan and Canada curves | End of day from the Bundesbank, BoE, MoF and BoC | Next run after each publishes |
| Policy rates of other central banks (BIS) | BIS can lag a decision by a few days | Next run after BIS updates |
| Bitcoin, Ether (Coinbase) | Completed UTC days | Shortly after 00:00 UTC |
| Central-bank headlines (RSS) | Continuous | Every run |
| Full history refresh (picks up revisions) | — | Sundays 04:10 UTC |

**Status bar (top right).** A green **Live** dot means the data are healthy. It also shows when the data last changed. "N series flagged" links to *Sources & status*, which lists anything stale or served from the last good copy.

**New-data notice.** When a new build arrives, the view redraws in place (you keep your scroll position) and a notice in the bottom-right corner lists the new releases, for example "New releases: CPI (Oct 2026)". On *Risk & sizing*, or while you are typing in a field, the view does not redraw by itself. A **New data available – update view** button appears instead, so your inputs are not lost.

> GitHub can start scheduled runs late when its servers are busy, occasionally by 10–30 minutes. Market prices are end-of-day: no free licensed intraday feed exists.

> **CPI, October 2026.** BLS never published an October 2025 CPI, because of the 2025 government shutdown. Its y/y change for October 2026 is therefore not official. The terminal shows an estimate, with the missing October 2025 level set to the geometric mean of September and November 2025 (the approximation BLS itself used for seasonal adjustment). The value is marked **(est.)**, and the series page carries a note.

---

## 2. Things that work everywhere

| Action | How |
|---|---|
| Open any series in detail | Click a tile, a table row or a series name |
| Change the chart period | 1M · 3M · 6M · YTD · 1Y · 3Y · 5Y · 10Y · MAX buttons above each chart |
| Zoom | Drag across the chart. Double-click to reset |
| Read exact values | Hover over the chart |
| Download chart data | **CSV** above the chart |
| Download the chart as an image | **PNG** above the chart |
| Share or bookmark a view | Copy the URL. Every module, selection and setting is saved in it (for example `#cross?ids=SPX,UST10Y&win=1Y`) |
| Go back | Browser back button, or **← Back** on a series page |

### Series page (`#series/ID`)
Opens from any series. It shows:
- **KPI strip:** latest value and observation date; change vs the prior observation, over 1 month, year-to-date and over 1 year; 52-week range; 5-year percentile; 1-year z-score.
- **History chart** with all the controls above.
- **Current vs history:** the value 1, 2, 5 and 10 years ago, plus the 5-year median, minimum and maximum.
- **Source & metadata:** provider and code (linked to the source), frequency, units, first and latest observation, when the provider last updated it, when the pipeline last fetched it, verification level and copyright owner.
- **Download all observations (CSV).**

### Badges
`ADM` administered rate · `O/N` overnight market rate · `EOD` end-of-day close or yield · `PUB` official published data · `EST` model estimate · `SVY` survey · `PROXY` substitute instrument · `CALC` derived by Wick. `STALE` means the latest observation is older than expected. `LAST GOOD` means the latest fetch failed and the previous data are shown.

---

## 3. Modules

### Monitor

**Overview** (`#overview`)
- Tiles for the key levels: policy rates, front end, Treasuries, curve, liquidity, inflation, labour and markets.
- US Treasury curve today vs 1 month and 1 year ago.
- Policy rates of the main central banks, with the last change.
- One-month moves across assets.
- The next items on the release calendar, and the latest central-bank headlines.

**Markets** (`#markets`)
- One cross-asset table: Treasuries and curve, global 10Y yields, equities, volatility, dollar and FX, commodities, digital assets, credit.
- Columns: last value, 1D/prior, 1W, 1M, YTD and 1Y change, 5-year percentile, a 52-week range bar, as-of date and source.
- Click any row for its history.

**Calendar & news** (`#calendar`)
- Upcoming US data releases and central-bank decisions (Fed, ECB, BoE, BoJ, BoC), with SEP meetings marked.
- Filter: All · Key only · Central banks.
- Meeting schedules for each bank, linked to the official calendar.
- Official headlines from the Fed, ECB, BoE and BoJ feeds, filterable by bank.

### Rates

**Rates & curves** (`#rates`)
- Curve switcher: US · Germany · UK · Japan · Canada.
- Curve snapshot vs earlier dates. You can pick any historical date to compare.
- Change by tenor over 1W, 1M, 3M or 1Y, in bp.
- History of key tenors.
- Curve and cross-market spreads table.
- US 2s10s, 5s30s and 3m10y slopes; real yields and breakevens; 10Y term premium (Kim–Wright); 10Y realised volatility; global 10Y yields.

**Front end & Fed** (`#frontend`)
- Tiles for the target range, IORB, ON RRP rate, EFFR, SOFR and others.
- Policy corridor and overnight rates on one chart.
- T-bill forward rates vs EFFR: a table by segment, with the latest minus EFFR in bp.
- FOMC dot-plot medians by year-end, and the next FOMC decision dates.
- Fed funds since 1954.
- 2Y Treasury minus EFFR.
- SOFR distribution (1st percentile, median, 99th percentile).
- Front-end series table.

**Central banks** (`#cb`)
- Table of policy rates: current rate, last move, its effective date, 12-month change, next decision, and links to official policy and decisions pages.
- Policy-rate paths.
- Real policy rates (policy rate minus inflation).
- Latest official communications.

**Liquidity & funding** (`#liquidity`)
- Net liquidity proxy.
- Fed balance-sheet components: total assets, reserves, weekly TGA, ON RRP.
- Daily TGA.
- Money-market spreads: SOFR, SOFR p99 and EFFR vs IORB; TGCR vs the ON RRP rate.
- SOFR volume, Chicago Fed NFCI, St. Louis Fed stress index, HY and IG credit spreads.
- Recent and upcoming Treasury auctions.
- Table of all liquidity series.

### Macro

**Inflation & labour** (`#macro`)
- **Latest releases** table covering inflation (CPI, core CPI, services, shelter, PCE, core PCE, PPI), labour (payrolls, unemployment, earnings, participation, claims, JOLTS) and activity (industrial production, retail sales, housing, sentiment, real GDP, GDPNow).
- Columns: period, level, y/y or change, m/m with the prior month, 3-month annualised or average, and the date the source published it.
- **Chart a release:** pick any series and a transform (Level · y/y · m/m · 3m annualised · Δ), with NBER recessions shaded.

**Global macro** (`#global`)
- Daily 10Y yields for the US, Germany, UK, Japan and Canada.
- 10Y spreads vs the US; Italy and France vs Germany.
- US CPI vs euro-area HICP.
- Bund 2s10s.
- Global rates and FX table.

**FRED library** (`#library`)
- The full FRED watchlist, grouped by theme.
- Tick up to 8 series to chart them together. Series with different units get separate charts.
- Transforms: Level · Change · 1-year change · Rebased = 100.
- Windows: 1Y · 3Y · 5Y · 10Y · 20Y · MAX.
- Your selection is remembered in this browser and kept in the URL.

### Analysis

**Cross-asset** (`#cross`)
- Choose any instruments. The selection is saved in your browser.
- Window: 3M, 6M, 1Y, 3Y or 5Y. Frequency: daily or weekly.
- Outputs:
  - Performance table: return or bp change, annualised volatility, max drawdown.
  - Relative performance (rebased to 100) and yield/spread changes.
  - Correlation heat-map.
  - Rolling 63-day correlation for any pair you pick.
  - Rolling volatility and drawdowns.

**Event studies** (`#events`)
- Pick an event type: FOMC decisions, CPI releases, payrolls, or BoE, ECB, BoJ and BoC rate changes.
- Choose instruments, a start date and the window (days before and after).
- **Run study:** average path with an interquartile band for each instrument, plus day-0 statistics.
- Per-event table, and a CSV of every event for every instrument.

**Regimes** (`#regimes`)
- Choose a growth measure (industrial production or retail sales y/y) and an inflation measure (CPI, core CPI or core PCE y/y).
- Choose how far back to measure the direction (3 or 6 months) and the publication lag (1–3 months).
- Outputs:
  - Today's regime: growth up or down × inflation up or down.
  - The average monthly move of each asset in each regime, with the share of months up and the number of months.
  - Recent regime spells.

**Risk & sizing** (`#risk`). Three tools, chosen with the switch at the top.
- **Portfolio risk.**
  - Inputs: a hypothetical portfolio (weights in % of NAV, negative = short), NAV, risk-free rate and history window (1Y, 3Y or 5Y).
  - Statistics: volatility, VaR and expected shortfall, Sharpe and Sortino ratios, concentration.
  - Risk contribution by instrument and by asset class, and a correlation matrix.
  - Hypothetical NAV and drawdown.
  - Historical replays: Covid crash, 2022 inflation shock, SVB, the 2023 long-end sell-off, the yen carry unwind, and the April 2025 tariff shock.
  - Factor-shock scenarios on the UST 10Y, S&P 500, USD and WTI, with editable presets.
- **Rates DV01 & curve shocks.**
  - Add positions: UST par bonds by tenor, SOFR 3M futures, fed funds futures, or a custom DV01.
  - Shows DV01 per position and by bucket, using the latest US curve.
  - Curve shocks: parallel ±25bp, bear and bull steepeners and flatteners, +1 hike, or your own shock at each knot.
  - **Apply historical move** replays the actual curve change between any two dates.
- **Position sizing.**
  - Enter a risk budget, entry, stop, multiplier, volatility (pre-filled from the data), DV01 and margin.
  - Returns the maximum size under each constraint and highlights the binding one.
  - Also shows notional, position volatility, and book volatility after adding the trade.

### Reference

**Sources & status** (`#sources`)
- **Latest pipeline run:** mode, start and finish times, series counts, and a link to the run history.
- Providers this run: OK, last-good and failed counts for each.
- Every series in one table: provider and code (linked), frequency, first and latest observation, when it was retrieved, verification level and owner.
- Sortable; click a row for the series page; downloadable as CSV.

---

## 4. Elsewhere on the site

- **Research** (`/research/`): every article, searchable by title, topic or tag and filterable by platform and category. New Medium posts appear automatically.
- **Framework**, **Projects**, **About**: static pages.

## 5. If something looks wrong

1. Check the status bar and **Sources & status** for flagged series. A failed source never deletes data: the last good copy is shown and labelled.
2. Check the series page. *Latest observation* is the period the data describe. *Provider last updated* is when the source published it.
3. Run history: https://github.com/wickresearch/wickresearch.github.io/actions. To force a refresh, open *Build data & deploy site*, choose **Run workflow** and pick `quick`, `incremental` or `full`.
