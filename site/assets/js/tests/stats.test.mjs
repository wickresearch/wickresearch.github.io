// Run: node --test site/assets/js/tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../terminal/stats.js";

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test("mean / std / quantile", () => {
  close(S.mean([1, 2, 3, 4]), 2.5);
  close(S.std([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7));
  close(S.quantile([1, 2, 3, 4, 5], 0.25), 2);
  close(S.quantile([10, 20], 0.5), 15);
  close(S.percentileRank([1, 2, 3, 4], 3), 75);
});

test("alignInner keeps only common dates", () => {
  const a = { d: ["2026-01-01", "2026-01-02", "2026-01-03"], v: [1, 2, 3] };
  const b = { d: ["2026-01-02", "2026-01-03", "2026-01-04"], v: [20, 30, 40] };
  const r = S.alignInner([a, b]);
  assert.deepEqual(r.d, ["2026-01-02", "2026-01-03"]);
  assert.deepEqual(r.cols, [[2, 3], [20, 30]]);
});

test("changes by kind", () => {
  assert.deepEqual(S.changes([100, 110, 99], "pct").map((x) => +x.toFixed(6)), [0.1, -0.1]);
  assert.deepEqual(S.changes([4.0, 4.25], "bp").map((x) => +x.toFixed(6)), [25]);
});

test("drawdown and max drawdown", () => {
  const dd = S.drawdowns([100, 120, 90, 130, 117]);
  close(dd[2], 90 / 120 - 1);
  close(S.maxDrawdown([100, 120, 90, 130, 117]), -0.25);
});

test("VaR and expected shortfall on a known sample", () => {
  const r = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000); // −5.0% … +4.9%
  close(S.histVaR(r, 0.95), -S.quantile(r, 0.05));
  const q = S.quantile(r, 0.05);
  close(S.expectedShortfall(r, 0.95), -S.mean(r.filter((x) => x <= q)));
  assert.ok(S.expectedShortfall(r, 0.95) >= S.histVaR(r, 0.95));
});

test("risk contributions sum to portfolio volatility", () => {
  const cov = [[0.0004, 0.0001], [0.0001, 0.0009]];
  const w = [0.6, 0.4];
  const rc = S.riskContributions(w, cov, 1);
  const vol = Math.sqrt(0.6 * 0.6 * 0.0004 + 0.4 * 0.4 * 0.0009 + 2 * 0.6 * 0.4 * 0.0001);
  close(rc.vol, vol);
  close(rc.crc[0] + rc.crc[1], vol);
  close(rc.pct[0] + rc.pct[1], 100);
});

test("correlation matrix diagonal is 1 and symmetric", () => {
  const a = [1, 2, 3, 4, 5], b = [2, 4, 5, 4, 5], c = [5, 4, 3, 2, 1];
  const C = S.corrMatrix([a, b, c]);
  close(C[0][0], 1); close(C[0][2], -1); close(C[1][0], C[0][1]);
});

test("OLS recovers known betas", () => {
  const x1 = [1, 2, 3, 4, 5, 6, 7, 8], x2 = [2, 1, 4, 3, 6, 5, 8, 7];
  const y = x1.map((v, i) => 0.5 + 2 * v - 3 * x2[i]);
  const r = S.ols(y, [x1, x2]);
  close(r.alpha, 0.5, 1e-9); close(r.betas[0], 2, 1e-9); close(r.betas[1], -3, 1e-9); close(r.r2, 1, 1e-12);
});

test("par bond modified duration and DV01", () => {
  // 10Y par bond at 5%: D_mod = (1/0.05)(1 − 1.025^−20) = 7.7946
  close(S.parModDuration(5, 10), (1 / 0.05) * (1 - Math.pow(1.025, -20)), 1e-12);
  close(S.parDV01(1e6, 5, 10), 1e6 * S.parModDuration(5, 10) * 1e-4);
  close(S.parModDuration(0, 7), 7);
});

test("bond return proxy sign: yields up → negative return beyond carry", () => {
  const s = { d: ["2026-01-05", "2026-01-06"], v: [4.0, 4.10] };
  const r = S.bondReturnProxy(s, 10).r[0];
  close(r, 0.04 / 365 - S.parModDuration(4.0, 10) * 0.001);
  assert.ok(r < 0);
});

test("bill forwards", () => {
  const f = S.billForwards({ "3M": 4.0, "6M": 4.2 }, ["3M", "6M"]);
  close(f[0].fwd, 4.0);
  close(f[1].fwd, (((1 + 0.042 * 0.5) / (1 + 0.04 * 0.25) - 1) / 0.25) * 100);
});

test("curve shock interpolation and P&L sign", () => {
  const knots = [[2, 10], [10, 30]];
  close(S.interpShock(knots, 6), 20);
  close(S.interpShock(knots, 30), 30);
  const [p] = S.curveShockPnL([{ years: 10, dv01: 1000 }], knots);
  close(p.pnl, -30000); // long duration loses when yields rise
});

test("position sizing picks the binding constraint", () => {
  const r = S.positionSize({ riskCapital: 10000, entry: 100, stop: 98, multiplier: 50, dailyVol: 0.01, price: 100, z: 2,
    marginCapital: 50000, marginPerUnit: 12000 });
  close(r.stop, 100); close(r.vol, 100); close(r.margin, 50000 / 12000);
  assert.equal(r.binding, "margin"); assert.equal(r.units, 4);
  close(S.combinedVol(3, 4, 0), 5);
});

test("event paths use the prior close as base and skip incomplete windows", () => {
  const d = ["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"];
  const s = { d, v: [100, 100, 102, 101, 103, 104] };
  const r = S.eventPaths(s, ["2026-01-03", "2026-01-08"], 1, 1, "pct"); // Saturday event → next trading day
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].tradeDate, "2026-01-05");
  close(r.events[0].path[1], 2); // event-day move vs prior close
  close(r.events[0].path[0], 0);
});

test("regimes are publication-lagged", () => {
  const months = Array.from({ length: 8 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-01`);
  const g = { d: months, v: [1, 1, 1, 2, 2, 2, 2, 2] };
  const p = { d: months, v: [3, 3, 3, 2, 2, 2, 2, 2] };
  const r = S.regimes(g, p, { look: 3, lag: 2 });
  assert.equal(r.get("2026-06").label, "Goldilocks"); // April data (growth↑ inflation↓) applies from June
  assert.equal(r.get("2026-06").basedOn, "2026-04");
  assert.ok(!r.has("2026-04"));
});

test("monthEnd keeps the last observation per month", () => {
  const r = S.monthEnd({ d: ["2026-01-02", "2026-01-30", "2026-02-02"], v: [1, 2, 3] });
  assert.deepEqual(r, { d: ["2026-01-30", "2026-02-02"], v: [2, 3] });
});

test("sharpe/sortino finite on simple series", () => {
  const r = [0.01, -0.005, 0.007, -0.002, 0.004];
  assert.ok(Number.isFinite(S.sharpe(r, 0)) && Number.isFinite(S.sortino(r, 0)));
});
