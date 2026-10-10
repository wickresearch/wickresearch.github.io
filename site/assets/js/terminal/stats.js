// Wick terminal – pure calculation library (no DOM). Unit-tested in assets/js/tests/stats.test.mjs.
//
// Conventions
//  * A series is {d: string[] (ISO dates, ascending), v: number[]}.
//  * Yields/rates are in percent; their "changes" are expressed in basis points (×100).
//  * Returns are simple (not log) unless stated. Annualisation uses 252 trading days.
//  * Nothing here fetches data or fills gaps with invented values: missing points stay missing.

export const TRADING_DAYS = 252;

// ------------------------------------------------------------------ basic statistics
export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);
export function std(a) { // sample standard deviation (n − 1)
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}
export function quantile(a, p) { // linear interpolation between order statistics (type 7)
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
}
export const median = (a) => quantile(a, 0.5);
export function percentileRank(a, x) { // share of observations ≤ x, in %
  if (!a.length) return NaN;
  return (a.filter((y) => y <= x).length / a.length) * 100;
}
export function zscore(a, x) { const s = std(a); return s > 0 ? (x - mean(a)) / s : NaN; }

// ------------------------------------------------------------------ alignment
export function toMap(s) { const m = new Map(); s.d.forEach((d, i) => { if (s.v[i] != null) m.set(d, s.v[i]); }); return m; }

/** Inner-join several series on common dates. Returns {d, cols}. */
export function alignInner(list) {
  if (!list.length) return { d: [], cols: [] };
  const maps = list.map(toMap);
  const d = list[0].d.filter((x) => maps.every((m) => m.has(x)));
  return { d, cols: maps.map((m) => d.map((x) => m.get(x))) };
}

/** Union of dates (for charting several series on one time axis); missing → null. */
export function alignUnion(list) {
  const all = new Set();
  list.forEach((s) => s.d.forEach((x) => all.add(x)));
  const d = [...all].sort();
  const maps = list.map(toMap);
  return { d, cols: maps.map((m) => d.map((x) => (m.has(x) ? m.get(x) : null))) };
}

export function sliceFrom(s, start) {
  const i = s.d.findIndex((x) => x >= start);
  return i < 0 ? { d: [], v: [] } : { d: s.d.slice(i), v: s.v.slice(i) };
}

/** Last observation of each calendar month (for monthly analysis of daily data). */
export function monthEnd(s) {
  const out = { d: [], v: [] };
  s.d.forEach((d, i) => {
    const m = d.slice(0, 7);
    if (out.d.length && out.d[out.d.length - 1].slice(0, 7) === m) { out.d[out.d.length - 1] = d; out.v[out.v.length - 1] = s.v[i]; }
    else { out.d.push(d); out.v.push(s.v[i]); }
  });
  return out;
}

// ------------------------------------------------------------------ returns & changes
/** Period changes: kind 'pct' → simple returns (decimal); 'bp' → level change ×100 (for % series); 'abs' → difference. */
export function changes(values, kind) {
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1], b = values[i];
    if (a == null || b == null) { out.push(null); continue; }
    out.push(kind === "pct" ? b / a - 1 : kind === "bp" ? (b - a) * 100 : b - a);
  }
  return out;
}
export const annVol = (rets, periods = TRADING_DAYS) => std(rets) * Math.sqrt(periods);
export function normalise(values, base = 100) { const v0 = values.find((x) => x != null); return values.map((x) => (x == null ? null : (x / v0) * base)); }

export function drawdowns(levels) { // fraction below running peak (≤ 0)
  let peak = -Infinity;
  return levels.map((x) => { if (x == null) return null; peak = Math.max(peak, x); return x / peak - 1; });
}
export const maxDrawdown = (levels) => Math.min(...drawdowns(levels).filter((x) => x != null));
export function cumulative(rets, start = 1) { const out = [start]; rets.forEach((r) => out.push(out[out.length - 1] * (1 + r))); return out; }

export function sharpe(rets, rfAnnualPct = 0, periods = TRADING_DAYS) {
  const rf = rfAnnualPct / 100 / periods;
  const ex = rets.map((r) => r - rf);
  return (mean(ex) / std(ex)) * Math.sqrt(periods);
}
export function sortino(rets, rfAnnualPct = 0, periods = TRADING_DAYS) {
  const rf = rfAnnualPct / 100 / periods;
  const ex = rets.map((r) => r - rf);
  const dd = Math.sqrt(sum(ex.map((x) => Math.min(0, x) ** 2)) / ex.length); // downside deviation, target = rf
  return (mean(ex) / dd) * Math.sqrt(periods);
}
/** Historical VaR at confidence c (e.g. 0.95): positive number = loss as a fraction. */
export const histVaR = (rets, c = 0.95) => -quantile(rets, 1 - c);
/** Expected shortfall: mean loss in the tail at or beyond the VaR quantile. */
export function expectedShortfall(rets, c = 0.95) {
  const q = quantile(rets, 1 - c);
  const tail = rets.filter((r) => r <= q);
  return -mean(tail);
}

// ------------------------------------------------------------------ covariance & risk decomposition
export function covMatrix(cols) {
  const n = cols.length, T = cols[0].length, mu = cols.map(mean);
  const C = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    let s = 0;
    for (let t = 0; t < T; t++) s += (cols[i][t] - mu[i]) * (cols[j][t] - mu[j]);
    C[i][j] = C[j][i] = s / (T - 1);
  }
  return C;
}
export function corrMatrix(cols) {
  const C = covMatrix(cols);
  return C.map((row, i) => row.map((c, j) => c / Math.sqrt(C[i][i] * C[j][j])));
}
export function corr(a, b) { return corrMatrix([a, b])[0][1]; }

/** Portfolio volatility and Euler risk contributions. weights sum need not be 1 (gross/net allowed). */
export function riskContributions(weights, cov, periods = TRADING_DAYS) {
  const n = weights.length;
  const Sw = cov.map((row) => row.reduce((s, c, j) => s + c * weights[j], 0));
  const varP = weights.reduce((s, w, i) => s + w * Sw[i], 0);
  const vol = Math.sqrt(varP);
  const mrc = Sw.map((x) => x / vol);                // marginal contribution (per unit weight)
  const crc = weights.map((w, i) => w * mrc[i]);     // component contribution; sums to vol
  return { vol: vol * Math.sqrt(periods), mrc: mrc.map((x) => x * Math.sqrt(periods)),
    crc: crc.map((x) => x * Math.sqrt(periods)), pct: crc.map((x) => (x / vol) * 100), n };
}
export function concentration(weights) {
  const g = sum(weights.map(Math.abs));
  const w = weights.map((x) => Math.abs(x) / g);
  const hhi = sum(w.map((x) => x * x));
  return { hhi, effectiveN: 1 / hhi };
}

export function rolling(values, window, fn) {
  const out = new Array(values.length).fill(null);
  for (let i = window - 1; i < values.length; i++) {
    const w = values.slice(i - window + 1, i + 1);
    if (w.every((x) => x != null)) out[i] = fn(w);
  }
  return out;
}
export function rollingCorr(a, b, window) {
  const out = new Array(a.length).fill(null);
  for (let i = window - 1; i < a.length; i++) {
    const x = a.slice(i - window + 1, i + 1), y = b.slice(i - window + 1, i + 1);
    if (x.every((v) => v != null) && y.every((v) => v != null)) out[i] = corr(x, y);
  }
  return out;
}

// ------------------------------------------------------------------ OLS (multi-factor betas)
/** Solve A x = b by Gaussian elimination with partial pivoting. */
export function solve(A, b) {
  const n = A.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) throw new Error("singular matrix");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
/** OLS of y on X (columns) with intercept. Returns {alpha, betas, r2}. */
export function ols(y, Xcols) {
  const T = y.length, k = Xcols.length + 1;
  const X = Array.from({ length: T }, (_, t) => [1, ...Xcols.map((c) => c[t])]);
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
  const Xty = Array.from({ length: k }, (_, i) => X.reduce((s, r, t) => s + r[i] * y[t], 0));
  const b = solve(XtX, Xty);
  const fit = X.map((r) => r.reduce((s, x, i) => s + x * b[i], 0));
  const my = mean(y);
  const r2 = 1 - sum(y.map((v, t) => (v - fit[t]) ** 2)) / sum(y.map((v) => (v - my) ** 2));
  return { alpha: b[0], betas: b.slice(1), r2 };
}

// ------------------------------------------------------------------ rates maths
/** Modified duration of a par bond (coupon = yield), semi-annual, yield in %. */
export function parModDuration(yPct, years, freq = 2) {
  const y = yPct / 100;
  if (Math.abs(y) < 1e-9) return years; // limit as y → 0
  return (1 / y) * (1 - Math.pow(1 + y / freq, -freq * years));
}
/** DV01 (currency per 1bp) of a par bond position. */
export const parDV01 = (notional, yPct, years) => notional * parModDuration(yPct, years) * 1e-4;

/**
 * Daily total-return proxy for a constant-maturity par bond from its yield series:
 *   r_t ≈ carry − D_mod(y_{t−1}) × Δy,  carry = y_{t−1} × Δdays / 365.
 * First-order (no convexity / roll-down) – documented as a proxy in the UI.
 */
export function bondReturnProxy(s, years) {
  const out = { d: [], r: [] };
  for (let i = 1; i < s.d.length; i++) {
    const y0 = s.v[i - 1], y1 = s.v[i];
    if (y0 == null || y1 == null) continue;
    const days = (Date.parse(s.d[i]) - Date.parse(s.d[i - 1])) / 864e5;
    out.d.push(s.d[i]);
    out.r.push((y0 / 100) * (days / 365) - parModDuration(y0, years) * ((y1 - y0) / 100));
  }
  return out;
}
/** Price-level index built from a return series (for alignment with price instruments). */
export function levelsFromReturns(d, r, base = 100) {
  const out = { d: [], v: [] };
  let x = base;
  r.forEach((ri, i) => { x *= 1 + ri; out.d.push(d[i]); out.v.push(x); });
  return out;
}

export const TENOR_YEARS = { "1M": 1 / 12, "6W": 1.5 / 12, "2M": 2 / 12, "3M": 0.25, "4M": 4 / 12, "6M": 0.5, "1Y": 1, "2Y": 2,
  "3Y": 3, "4Y": 4, "5Y": 5, "6Y": 6, "7Y": 7, "8Y": 8, "9Y": 9, "10Y": 10, "15Y": 15, "20Y": 20, "25Y": 25, "30Y": 30, "40Y": 40, "LONG": 30, "Long": 30 };

/**
 * Forward rates implied by the T-bill segment of the par curve (simple money-market approximation):
 *   f(t1,t2) = [(1 + y2·t2)/(1 + y1·t1) − 1] / (t2 − t1)
 * Bill yields embed supply and term-premium effects, so this is a PROXY for the expected policy
 * path, not an OIS- or futures-implied path. Inputs: {tenor: yield%}. Returns [{from,to,fwd}].
 */
export function billForwards(row, tenors = ["1M", "2M", "3M", "4M", "6M", "1Y"]) {
  const pts = tenors.filter((t) => row[t] != null).map((t) => [TENOR_YEARS[t], row[t] / 100, t]);
  const out = [];
  let prev = [0, null, "0"];
  for (const [t, y, lab] of pts) {
    if (prev[1] == null) { out.push({ from: "0", to: lab, mid: t / 2, fwd: y * 100, t0: 0, t1: t }); }
    else {
      const [t0, y0] = prev;
      out.push({ from: prev[2], to: lab, mid: (t0 + t) / 2, fwd: (((1 + y * t) / (1 + y0 * t0) - 1) / (t - t0)) * 100, t0, t1: t });
    }
    prev = [t, y, lab];
  }
  return out;
}

/** Linear interpolation of a shock vector defined on tenor knots (years → bp). Flat beyond ends. */
export function interpShock(knots, t) {
  const k = [...knots].sort((a, b) => a[0] - b[0]);
  if (t <= k[0][0]) return k[0][1];
  if (t >= k[k.length - 1][0]) return k[k.length - 1][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) {
    const [x0, y0] = k[i - 1], [x1, y1] = k[i];
    return y0 + ((y1 - y0) * (t - x0)) / (x1 - x0);
  }
}
/** P&L of DV01 positions (currency per bp, long-duration positive) under a shock (bp) by tenor. */
export function curveShockPnL(positions, knots) {
  return positions.map((p) => ({ ...p, shock: interpShock(knots, p.years), pnl: -p.dv01 * interpShock(knots, p.years) }));
}

// ------------------------------------------------------------------ position sizing
/**
 * Units by three independent constraints; the binding one is the minimum.
 *  stop:   riskCapital / (|entry − stop| × multiplier)
 *  vol:    riskCapital / (σ_daily × price × multiplier × z)   (σ_daily as a fraction)
 *  dv01:   dv01Budget / dv01PerUnit
 *  margin: marginCapital / marginPerUnit
 */
export function positionSize({ riskCapital, entry, stop, multiplier = 1, dailyVol, price, z = 1.645,
  dv01Budget, dv01PerUnit, marginCapital, marginPerUnit }) {
  const r = {};
  if (entry != null && stop != null && entry !== stop) r.stop = riskCapital / (Math.abs(entry - stop) * multiplier);
  if (dailyVol && price) r.vol = riskCapital / (dailyVol * price * multiplier * z);
  if (dv01Budget && dv01PerUnit) r.dv01 = dv01Budget / dv01PerUnit;
  if (marginCapital && marginPerUnit) r.margin = marginCapital / marginPerUnit;
  const vals = Object.entries(r).filter(([, v]) => Number.isFinite(v) && v > 0);
  const binding = vals.length ? vals.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;
  return { ...r, units: binding ? Math.floor(binding[1]) : null, binding: binding ? binding[0] : null };
}
/** Book volatility after adding a position with correlation rho (two-asset formula). */
export const combinedVol = (s1, s2, rho) => Math.sqrt(s1 * s1 + s2 * s2 + 2 * rho * s1 * s2);

// ------------------------------------------------------------------ event studies
/**
 * Paths around events using trading-day offsets in the series' own calendar.
 * Base = last observation strictly BEFORE the event date (so the event day's move is included at offset 0).
 * kind: 'pct' → % change from base; 'bp' → bp change (×100); 'abs' → level change.
 */
export function eventPaths(s, eventDates, pre = 5, post = 10, kind = "pct") {
  const events = [];
  for (const e of eventDates) {
    let i0 = s.d.findIndex((x) => x >= e);      // first trading day on/after the event
    if (i0 < 1) continue;
    const ib = i0 - 1;                           // base: prior close
    if (ib - pre < 0 || i0 + post >= s.d.length) continue;
    const base = s.v[ib];
    const path = [];
    for (let k = -pre; k <= post; k++) {
      const x = s.v[i0 + k];
      path.push(x == null || base == null ? null : kind === "pct" ? (x / base - 1) * 100 : kind === "bp" ? (x - base) * 100 : x - base);
    }
    events.push({ date: e, tradeDate: s.d[i0], path });
  }
  const offsets = Array.from({ length: pre + post + 1 }, (_, i) => i - pre);
  const col = (k) => events.map((ev) => ev.path[k]).filter((x) => x != null);
  return {
    offsets, events,
    mean: offsets.map((_, k) => mean(col(k))), median: offsets.map((_, k) => median(col(k))),
    q25: offsets.map((_, k) => quantile(col(k), 0.25)), q75: offsets.map((_, k) => quantile(col(k), 0.75)),
  };
}

// ------------------------------------------------------------------ regimes
/**
 * Growth × inflation regime per month, using only information published by then.
 *  growth up    ⇔ growth y/y rose over the last `look` months
 *  inflation up ⇔ inflation y/y rose over the last `look` months
 * Signals for observation month m are applied from month m + lag (publication lag), so the
 * classification of month M uses data that was public during M.
 */
export function regimes(growthYoY, inflYoY, { look = 3, lag = 2 } = {}) {
  const dir = (s) => {
    const m = new Map();
    s.d.forEach((d, i) => { if (i >= look) m.set(d.slice(0, 7), s.v[i] - s.v[i - look]); });
    return m;
  };
  const g = dir(growthYoY), p = dir(inflYoY);
  const shift = (ym, n) => { let [y, mo] = ym.split("-").map(Number); mo += n; y += Math.floor((mo - 1) / 12); mo = ((mo - 1) % 12) + 1; return `${y}-${String(mo).padStart(2, "0")}`; };
  const out = new Map();
  for (const [ym, dg] of g) {
    if (!p.has(ym)) continue;
    const dp = p.get(ym);
    const label = dg >= 0 ? (dp >= 0 ? "Reflation" : "Goldilocks") : (dp >= 0 ? "Stagflation" : "Slowdown");
    out.set(shift(ym, lag), { label, dg, dp, basedOn: ym });
  }
  return out;
}
