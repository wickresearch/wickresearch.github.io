# Methodology

This file covers every calculated number on the site: how it is computed, where the code lives and how it is tested. Pipeline formulas are in `pipeline/calc.py` (tests in `pipeline/tests/test_calc.py`). Browser-side analytics are in `site/assets/js/terminal/stats.js` (tests in `site/assets/js/tests/stats.test.mjs`).

## Data conventions

* **Dates.** Every observation has an ISO date. For monthly and quarterly data the date is the first day of the period the data describe (FRED convention). It is *not* the publication date. The terminal shows the observation period ("Aug 2026") and, separately, the provider's `last_updated` timestamp and the pipeline's retrieval time (UTC).
* **Data types.** Each series carries a type that the UI shows as a badge: administered rate (ADM), overnight market rate (O/N), end-of-day close or yield (EOD), official published data (PUB), model estimate (EST), survey (SVY), proxy (PROXY) and derived (CALC). Nothing is labelled real-time.
* **Units and changes.** Yields and rates are in %, and their changes are shown in **bp** (Δ × 100). Prices and indices show **% changes**. Levels such as balances or claims show absolute changes in their own units. Spreads are stored in bp.
* **Missing data.** Missing values are skipped and never interpolated. Duplicate dates are resolved by keeping the latest value. Non-finite values are dropped.
* **Revisions.** Monthly and quarterly series are re-fetched in full on every run, and daily and weekly series over a trailing window (45 / 120 days). New values overwrite old ones on overlapping dates, so revisions flow through. A full refetch runs weekly.
* **Staleness.** A series is flagged STALE when its latest observation is older than its frequency allows: daily 6 days, weekly 14, monthly 100, quarterly 200, annual 550. Policy rates stored as steps are exempt.
* **Fallback.** If a provider fails, the series keeps its previous good data and is flagged LAST GOOD with the original retrieval time.

## Summary statistics (`calc.summarise`)

* Horizon changes (1W, 1M, 3M, 1Y) compare the latest value with the last observation on or before *latest date − horizon*. YTD compares with the last observation on or before 31 December of the prior year.
* 52-week range: min and max over the last 365 days. 5-year percentile: share of observations in the last 5 years that are ≤ the latest value (requires ≥ 20 observations). 1-year z-score: (latest − mean) / sample stdev over the last year.

## Derived series (config: `derived:` in `pipeline/config/series.yaml`)

| Operation | Formula | Notes |
|---|---|---|
| `spread` | (a − b) × scale, with b taken **as-of** a's date (no look-ahead), tolerance 5 days for daily inputs and 40 for monthly | Cross-country spreads mix curve conventions (UST par vs Bund Svensson zero-coupon) and are labelled to that effect |
| `yoy`, `mom` | x_t / x_{t−12} − 1, x_t / x_{t−1} − 1, matched by **calendar month** | Never bridges a gap |
| `ann3m` | (x_t / x_{t−3})⁴ − 1 | |
| `ann1q` | (GDP_t / GDP_{t−1q})⁴ − 1 | |
| `diff`, `diff_avg3`, `avg4` | x_t − x_{t−1}; mean of the last 3 changes; mean of the last 4 prints | Payrolls, claims |
| `realised_vol_bp` | sample stdev of daily Δ10Y (bp) over 21 observations × √252 | Substitute for MOVE, which is not available |
| `net_liquidity` | WALCL − WTREGEN − RRPONTSYD on WALCL's (Wednesday) dates; TGA and RRP as-of within 7 days; USD bn | A **proxy**, not an official measure; components are shown alongside |

## Rates analytics

* **T-bill forward proxy** (Front end & Fed): from the par yields of the 1M, 2M, 3M, 4M, 6M and 1Y bills, `f(t₁,t₂) = [(1 + y₂t₂)/(1 + y₁t₁) − 1]/(t₂ − t₁)`. This is a simple-rate approximation. **It is not an OIS- or futures-implied path, and no meeting probabilities are derived from it**, because bill yields carry supply and term-premium effects. It is compared with today's EFFR and with the curve on the day before the last FOMC decision.
* **2Y − EFFR**: a directional gauge of net easing or tightening priced over two years, including term premium.
* **Par-bond duration and DV01**: `D_mod = (1/y)[1 − (1 + y/2)^(−2T)]` for a semi-annual par bond; `DV01 = notional × D_mod × 0.0001`.
* **STIR futures DV01**: SR3 $25/bp per contract; ZQ $5m × 30/360 × 0.0001 = $41.67/bp. A long futures position is treated as long duration.
* **Curve shocks**: shocks defined at 3m/1y/2y/5y/10y/30y knots are interpolated linearly and held flat beyond the end knots. P&L = −DV01 × shock (first order, no convexity, carry or roll). Historical shocks use the actual change in the US par curve between two dates.
* **Treasury return proxy** (portfolio risk): `r_t ≈ y_{t−1}·Δdays/365 − D_mod(y_{t−1}, T)·Δy` for a constant-maturity par bond. This is a first-order proxy, not an index return.
* **Real policy rate (ex-post)**: policy rate at month-end − inflation y/y for that month.

## Cross-asset and portfolio analytics

* **Alignment**: instruments are inner-joined on common dates before returns are computed, so crypto weekend moves are folded into the next common date.
* **Returns**: simple returns for prices; bp changes for yields and spreads.
* **Volatility**: sample stdev × √252 (daily) or √52 (weekly). **Drawdown**: P_t / max_{s≤t} P_s − 1.
* **Correlation**: Pearson on changes over the selected window. Rolling correlation uses 63 daily changes.
* **Portfolio**: constant weights, rebalanced daily. Cash earns 0%. Weights are % of NAV and may be negative.
* **Sharpe** = mean(r − r_f)/σ × √252. **Sortino** uses the downside deviation below r_f. The default r_f is the latest EFFR.
* **Historical VaR(c)** = −quantile(r, 1 − c), using type-7 linear interpolation. **ES(c)** = −mean(r | r ≤ quantile(r, 1 − c)). Both are 1-day.
* **Risk contributions** (Euler): σ_p = √(wᵀΣw), MRC_i = (Σw)_i/σ_p, CRC_i = w_i·MRC_i, and Σ CRC_i = σ_p. **Concentration**: HHI of |w| shares, effective N = 1/HHI.
* **Historical scenario replay**: each instrument's return between the episode's start and end closes (as-of), applied to current weights. Instruments without data contribute zero and are flagged.
* **Factor scenarios**: OLS with intercept of each instrument's daily return (%) on the daily ΔUST10Y (bp) and the S&P 500, broad USD and WTI returns (%) over the window. Scenario P&L = Σ β × shock. The preset shock sizes are labelled assumptions.
* **Position sizing**: the minimum across the stop-distance, 1-day-VaR, DV01-budget and margin constraints. Book volatility after the trade is √(σ_b² + σ_p² + 2ρσ_bσ_p).

## Event studies

* Event dates: FOMC decisions (transcribed from federalreserve.gov, 2021–2026); CPI and Employment Situation release dates (FRED release calendar); and policy-rate changes from BIS (these are *effective* dates, which for the ECB fall the week after the decision).
* Day 0 is the first trading day on or after the event date in the instrument's own calendar. The base is the close of the trading day before. path_k = X_{t0+k} − X_{t0−1} (bp for yields) or X_{t0+k}/X_{t0−1} − 1 (%).
* Output: mean, median and interquartile band across events, plus a per-event table. Events without a complete window are dropped. Close-to-close data includes all other news on the same day.

## Regimes

* Growth (industrial production or retail sales, y/y) and inflation (core CPI, CPI or core PCE, y/y) are each classified as rising or falling by their change over 3 or 6 months.
* Quadrants: Reflation (↑↑), Goldilocks (growth ↑, inflation ↓), Stagflation (growth ↓, inflation ↑), Slowdown (↓↓).
* **No look-ahead**: the classification for observation month *m* applies to month *m + lag*, with a default lag of 2 months. The asset move attributed to month M is end(M) vs end(M−1). The current, unfinished month is excluded.
* The page reports the mean, median, share of positive months and *n* for each regime. It is descriptive and not used as a signal.
