// Risk & sizing: portfolio risk on user-supplied hypothetical weights, rates DV01 / curve-shock analysis, position sizing.
// Nothing here is connected to any real account; every input is entered by the viewer and every assumption is shown.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, segmented, select, numberInput, prefs, downloadCSV } from "../ui.js";
import { timeChart, heatmap } from "../chart.js";
import * as S from "../stats.js";
import { header, formula } from "./common.js";

const INSTR = [
  { id: "SPX", label: "S&P 500", cls: "Equity" }, { id: "NASDAQ", label: "Nasdaq Composite", cls: "Equity" }, { id: "NIKKEI", label: "Nikkei 225 (JPY)", cls: "Equity" },
  { id: "UST2Y", label: "UST 2Y (return proxy)", cls: "Rates", bond: 2 }, { id: "UST5Y", label: "UST 5Y (return proxy)", cls: "Rates", bond: 5 },
  { id: "UST10Y", label: "UST 10Y (return proxy)", cls: "Rates", bond: 10 }, { id: "UST30Y", label: "UST 30Y (return proxy)", cls: "Rates", bond: 30 },
  { id: "USD_BROAD", label: "Long USD (broad index)", cls: "FX" }, { id: "EURUSD", label: "Long EUR/USD", cls: "FX" }, { id: "USDJPY", label: "Long USD/JPY", cls: "FX" },
  { id: "WTI", label: "WTI crude", cls: "Commodities" }, { id: "BRENT", label: "Brent crude", cls: "Commodities" }, { id: "GOLD_PROXY", label: "Gold (PAXG proxy)", cls: "Commodities" },
  { id: "BTC", label: "Bitcoin", cls: "Digital assets" }, { id: "ETH", label: "Ether", cls: "Digital assets" },
];
const DEFAULT_PF = [["SPX", 40], ["UST10Y", 30], ["UST2Y", 15], ["BRENT", 5], ["USD_BROAD", 5], ["BTC", 5]];
// Historical episodes: windows are calendar facts; all results are computed from the data.
const EPISODES = [["Covid crash", "2020-02-19", "2020-03-23"], ["2022 inflation shock, H1", "2022-01-03", "2022-06-16"], ["SVB / regional banks", "2023-03-08", "2023-03-17"],
  ["2023 long-end sell-off", "2023-07-31", "2023-10-19"], ["Yen carry unwind", "2024-07-31", "2024-08-05"], ["April 2025 tariff shock", "2025-04-02", "2025-04-08"]];
const FACTORS = [["UST10Y", "UST 10Y", "bp"], ["SPX", "S&P 500", "%"], ["USD_BROAD", "USD broad", "%"], ["WTI", "WTI", "%"]];
const PRESETS = {
  "Hawkish repricing": [25, -3, 1.5, 0], "Growth scare": [-30, -6, 1, -8], "Inflation / oil shock": [20, -2, 0.5, 15],
  "Dollar sell-off": [0, 1, -3, 3], "Equity crash, vol spike": [-20, -10, 2, -10],
};

export async function render(root, { params, setParams }) {
  const tab = params.tab || "portfolio";
  root.append(header("Risk & sizing", "Analytical tools for hypothetical or user-supplied positions. They describe exposures and potential losses. They are not recommendations or forecasts.",
    segmented([["portfolio", "Portfolio risk"], ["rates", "Rates DV01 & curve shocks"], ["sizing", "Position sizing"]], tab, (v) => { setParams({ tab: v }); show(v); }, "Tool")));
  const out = el("div");
  root.append(out);
  const show = (v) => (v === "rates" ? ratesTool(out) : v === "sizing" ? sizingTool(out) : portfolioTool(out, params, setParams));
  await show(tab);
}

// =============================================================== portfolio risk
async function portfolioTool(out, params, setParams) {
  let rows = prefs.get("risk.pf", DEFAULT_PF);
  let nav = prefs.get("risk.nav", 1_000_000), win = params.win || "3Y", rf = null;
  const cat = await D.catalog();
  rf = cat.series.EFFR?.latest?.value ?? 0;
  const tbl = el("tbody");
  const drawRows = () => tbl.replaceChildren(...rows.map((r, i) => el("tr", {},
    el("td", {}, select(INSTR.map((x) => [x.id, x.label]), r[0], (v) => (rows[i][0] = v), "Instrument")),
    el("td", {}, numberInput(r[1], (v) => (rows[i][1] = v), { label: "Weight %", width: 80 })),
    el("td", {}, el("button", { class: "lnk", type: "button", text: "remove", onclick: () => { rows.splice(i, 1); drawRows(); } })))));
  drawRows();
  const sumW = () => rows.reduce((s, r) => s + (+r[1] || 0), 0);
  const inputs = panel("Hypothetical portfolio", { sub: "Weights are % of NAV. Negative = short. Any remainder is cash earning 0%.", span: 3 });
  inputs.body.append(el("table", { class: "tbl", style: "max-width:560px" }, el("thead", {}, el("tr", {}, el("th", { text: "Instrument" }), el("th", { text: "Weight %" }), el("th"))), tbl),
    el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;align-items:end" },
      el("button", { class: "btn-sm", style: "margin:0", type: "button", text: "+ Add", onclick: () => { rows.push(["NASDAQ", 0]); drawRows(); } }),
      el("label", { class: "fld" }, "NAV (USD)", numberInput(nav, (v) => (nav = v), { width: 120 })),
      el("label", { class: "fld" }, "Risk-free % p.a.", numberInput(+rf.toFixed(2), (v) => (rf = v), { width: 80 })),
      el("label", { class: "fld" }, "History", segmented([["1Y", "1Y"], ["3Y", "3Y"], ["5Y", "5Y"]], win, (v) => (win = v)))),
    el("button", { class: "btn-sm", type: "button", text: "Calculate", onclick: () => calc() }),
    el("p", { class: "note", text: "Treasury returns are a first-order proxy from constant-maturity par yields (carry − duration × Δyield). FX positions are long the quoted pair. Daily rebalancing to constant weights is assumed. Default risk-free rate = latest EFFR." }));
  const res = el("div", { style: "margin-top:12px" });
  out.replaceChildren(el("div", { class: "grid3" }, inputs.root), res);
  await calc();

  async function calc() {
    prefs.set("risk.pf", rows); prefs.set("risk.nav", nav); setParams({ win });
    res.replaceChildren(el("div", { class: "loading", text: "Calculating…" }));
    const pos = rows.filter((r) => r[1]).map(([id, w]) => ({ ...INSTR.find((x) => x.id === id), w: w / 100 }));
    const uniq = [...new Set(pos.map((p) => p.id))];
    const { ok, failed } = await D.many(uniq);
    const missing = uniq.filter((i) => !ok[i]);
    if (missing.length) { res.replaceChildren(errorBox(`Unavailable: ${missing.map((m) => `${m} (${failed[m]})`).join("; ")}`)); return; }
    // Price levels: bonds via the return proxy, others as published
    const levels = Object.fromEntries(uniq.map((id) => {
      const it = INSTR.find((x) => x.id === id);
      if (it.bond) { const r = S.bondReturnProxy(ok[id], it.bond); return [id, S.levelsFromReturns(r.d, r.r)]; }
      return [id, { d: ok[id].d, v: ok[id].v }];
    }));
    const A = S.alignInner(uniq.map((id) => levels[id]));
    const days = { "1Y": 366, "3Y": 1096, "5Y": 1827 }[win];
    const last = A.d[A.d.length - 1];
    const start = new Date(Date.parse(last) - days * 864e5).toISOString().slice(0, 10);
    const i0 = Math.max(0, A.d.findIndex((x) => x >= start));
    const d = A.d.slice(i0), cols = A.cols.map((c) => c.slice(i0));
    if (d.length < 60) { res.replaceChildren(errorBox("Fewer than 60 common observations: shorten the window or remove short-history instruments (e.g. PAXG from 2021).")); return; }
    const rets = cols.map((c) => S.changes(c, "pct"));
    const wById = Object.fromEntries(uniq.map((id) => [id, pos.filter((p) => p.id === id).reduce((s, p) => s + p.w, 0)]));
    const w = uniq.map((id) => wById[id]);
    const pr = rets[0].map((_, t) => w.reduce((s, wi, k) => s + wi * rets[k][t], 0));
    const navSeries = S.cumulative(pr, 100);
    const cov = S.covMatrix(rets);
    const rc = S.riskContributions(w, cov);
    const conc = S.concentration(w);
    const annRet = S.mean(pr) * 252, vol = S.annVol(pr);
    const k = (x, dp = 2) => `${(x * 100).toFixed(dp)}%`;
    const usd = (x) => money(x * nav);
    const grid = el("div", { class: "grid3" });

    const ks = panel("Portfolio statistics", { sub: `${F.date(d[0], "long")} → ${F.date(last, "long")} · ${pr.length} daily returns`, span: 3 });
    ks.body.append(el("div", { class: "kpis", style: "margin:0" }, [
      ["Ann. return (mean)", k(annRet)], ["Ann. volatility", k(vol)], ["Sharpe", S.sharpe(pr, rf).toFixed(2)], ["Sortino", S.sortino(pr, rf).toFixed(2)],
      ["Max drawdown", k(S.maxDrawdown(navSeries))], ["1-day VaR 95%", `${k(S.histVaR(pr, 0.95))} · ${usd(S.histVaR(pr, 0.95))}`],
      ["1-day ES 95%", `${k(S.expectedShortfall(pr, 0.95))} · ${usd(S.expectedShortfall(pr, 0.95))}`], ["1-day VaR 99%", `${k(S.histVaR(pr, 0.99))} · ${usd(S.histVaR(pr, 0.99))}`],
      ["1-day ES 99%", `${k(S.expectedShortfall(pr, 0.99))} · ${usd(S.expectedShortfall(pr, 0.99))}`], ["Gross / net exposure", `${k(w.reduce((s, x) => s + Math.abs(x), 0), 0)} / ${k(w.reduce((s, x) => s + x, 0), 0)}`],
      ["Effective N (1/HHI)", conc.effectiveN.toFixed(1)],
    ].map(([a, b]) => el("div", { class: "kpi" }, el("div", { class: "k", text: a }), el("div", { class: "v num", style: "font-size:15px", text: b })))));
    ks.foot.append(formula("VaR_c = −quantile(r, 1−c) (historical, 1-day);  ES_c = −mean(r | r ≤ quantile);  Sharpe = mean(r − r_f)/σ × √252;  Sortino uses downside deviation below r_f"));
    grid.append(ks.root);

    const pc = panel("Risk contributions", { sub: "Euler decomposition of ex-post volatility", span: 2 });
    const byCls = {};
    uniq.forEach((id, i) => { const c = INSTR.find((x) => x.id === id).cls; byCls[c] = (byCls[c] || 0) + rc.pct[i]; });
    pc.body.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ["Instrument", "Class", "Weight", "Ann. vol", "Marginal contrib.", "Contribution to vol", "% of risk"].map((h, j) => el("th", { class: j > 1 ? "r" : "", text: h })))),
      el("tbody", {}, uniq.map((id, i) => el("tr", {}, el("td", { text: INSTR.find((x) => x.id === id).label }), el("td", { class: "dim", text: INSTR.find((x) => x.id === id).cls }),
        el("td", { class: "r num", text: k(w[i], 1) }), el("td", { class: "r num", text: k(Math.sqrt(cov[i][i] * 252), 1) }), el("td", { class: "r num", text: k(rc.mrc[i], 1) }),
        el("td", { class: "r num", text: k(rc.crc[i], 2) }), el("td", { class: "r num", text: `${rc.pct[i].toFixed(1)}%` })))))),
    el("p", { class: "note", text: `By class: ${Object.entries(byCls).map(([c, v]) => `${c} ${v.toFixed(0)}%`).join(" · ")}. Contributions sum to portfolio volatility; negative values are diversifiers.` }),
    formula("σ_p = √(wᵀΣw);  MRC_i = (Σw)_i / σ_p;  CRC_i = w_i · MRC_i;  Σ CRC_i = σ_p"));
    grid.append(pc.root);
    const ph = panel("Correlation of daily returns", { span: 1 });
    ph.body.append(heatmap(uniq.map((id) => id), S.corrMatrix(rets)));
    grid.append(ph.root);

    const pn = panel("Hypothetical NAV and drawdown", { sub: "Rebased to 100, constant weights", span: 3 });
    pn.body.append(timeChart([{ label: "Portfolio NAV", d, v: navSeries }], { units: "", ranges: false, range: "MAX", height: 220, filename: "portfolio_nav" }).el,
      timeChart([{ label: "Drawdown %", d, v: S.drawdowns(navSeries).map((x) => x * 100), color: "#3987e5" }], { units: "%", ranges: false, range: "MAX", height: 140, filename: "portfolio_drawdown" }).el);
    grid.append(pn.root);

    // Historical episodes (using full available history, not just the window)
    const pe = panel("Historical scenario replay", { sub: "Portfolio P&L if today's weights had been held through each episode", span: 2 });
    const full = Object.fromEntries(uniq.map((id) => [id, levels[id]]));
    const epRows = EPISODES.map(([lab, a, b]) => {
      const legs = uniq.map((id) => { const s = full[id]; const va = asofV(s, a), vb = asofV(s, b); return va && vb ? vb / va - 1 : null; });
      const miss = uniq.filter((_, i) => legs[i] == null);
      const pnl = legs.reduce((s, r, i) => s + (r == null ? 0 : w[i] * r), 0);
      return { lab, a, b, pnl, miss, legs };
    });
    pe.body.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ["Episode", "Window", "Portfolio P&L", "USD", "Coverage"].map((h, j) => el("th", { class: j === 2 || j === 3 ? "r" : "", text: h })))),
      el("tbody", {}, epRows.map((r) => el("tr", {}, el("td", { text: r.lab }), el("td", { class: "num dim", text: `${F.date(r.a)} → ${F.date(r.b)}` }),
        el("td", { class: `r num ${r.pnl > 0 ? "up" : r.pnl < 0 ? "down" : ""}`, text: k(r.pnl) }), el("td", { class: "r num", text: usd(r.pnl) }),
        el("td", { class: "dim", text: r.miss.length ? `partial – no data: ${r.miss.join(", ")}` : "full" })))))));
    pe.foot.append("Close-to-close returns between the window dates (last observation on or before each date). Instruments without data for an episode contribute zero, flagged as partial.");
    grid.append(pe.root);

    // Factor shock scenarios
    const pf = panel("Factor shock scenarios", { sub: "Linear betas to four market factors, estimated on daily data over the window", span: 1 });
    const fx = await D.many(FACTORS.map((f) => f[0]));
    const fl = FACTORS.filter((f) => fx.ok[f[0]]);
    if (fl.length === FACTORS.length) {
      const all = S.alignInner([...uniq.map((id) => levels[id]), ...fl.map((f) => fx.ok[f[0]])]);
      const j0 = Math.max(0, all.d.findIndex((x) => x >= start));
      const ac = all.cols.map((c) => c.slice(j0));
      const assetR = ac.slice(0, uniq.length).map((c) => S.changes(c, "pct").map((x) => x * 100));
      const facR = ac.slice(uniq.length).map((c, i) => S.changes(c, fl[i][2] === "bp" ? "bp" : "pct").map((x) => (fl[i][2] === "bp" ? x : x * 100)));
      const fits = assetR.map((y) => { try { return S.ols(y, facR); } catch { return null; } });
      const shocks = el("div", { class: "form-grid" });
      const vals = [...PRESETS["Hawkish repricing"]];
      const inputs = fl.map((f, i) => numberInput(vals[i], (v) => { vals[i] = v; drawSc(); }, { width: 80, label: f[1] }));
      fl.forEach((f, i) => shocks.append(el("label", { class: "fld" }, `${f[1]} (${f[2]})`, inputs[i])));
      const scOut = el("div");
      const drawSc = () => {
        const legPnl = fits.map((fit) => (fit ? fit.betas.reduce((s, b, i) => s + b * vals[i], 0) : null));
        const tot = legPnl.reduce((s, x, i) => s + (x == null ? 0 : (w[i] * x) / 100), 0);
        scOut.replaceChildren(el("div", { style: "font-size:20px;font-weight:600;margin:8px 0", class: tot > 0 ? "up" : "down", text: `${k(tot)} · ${usd(tot)}` }),
          el("table", { class: "tbl" }, el("thead", {}, el("tr", {}, ["Leg", "Est. move", "R²"].map((h, j) => el("th", { class: j ? "r" : "", text: h })))),
            el("tbody", {}, uniq.map((id, i) => el("tr", {}, el("td", { text: id }), el("td", { class: "r num", text: legPnl[i] == null ? "—" : `${legPnl[i].toFixed(2)}%` }),
              el("td", { class: "r num", text: fits[i] ? fits[i].r2.toFixed(2) : "—" }))))));
      };
      pf.body.append(el("div", { class: "p-sub", text: "Preset (illustrative, editable):" }),
        select(Object.keys(PRESETS).map((p) => [p, p]), "Hawkish repricing", (v) => { PRESETS[v].forEach((x, i) => { vals[i] = x; inputs[i].value = x; }); drawSc(); }, "Preset"),
        shocks, scOut);
      drawSc();
      pf.foot.append("Shock sizes are assumptions, not forecasts. Betas are linear and estimated from daily moves, so they understate non-linear and crisis behaviour (correlations rise in stress). A factor that is also a holding has a beta of about 1 to itself.");
    } else pf.body.append(errorBox("Factor series unavailable."));
    grid.append(pf.root);
    res.replaceChildren(grid);
  }
}
/** Currency with a proper minus sign before the symbol: −$1,234 */
function money(x) { if (x == null || !Number.isFinite(x)) return "—"; const a = Math.round(Math.abs(x)).toLocaleString("en-GB"); return `${x < 0 ? "−" : ""}$${a}`; }
function asofV(s, date) { let i = s.d.length - 1; if (s.d[0] > date) return null; while (i > 0 && s.d[i] > date) i--; return s.v[i]; }

// =============================================================== rates DV01 & curve shocks
const KNOT_T = [0.25, 1, 2, 5, 10, 30];
const CURVE_SCEN = {
  "Parallel +25bp": [25, 25, 25, 25, 25, 25], "Parallel −25bp": [-25, -25, -25, -25, -25, -25],
  "Bear steepener": [0, 5, 10, 20, 30, 35], "Bull steepener": [-25, -30, -30, -20, -10, -5],
  "Bear flattener": [25, 30, 30, 20, 10, 5], "Bull flattener": [0, -5, -10, -20, -25, -30],
  "Policy repricing (+1 hike)": [10, 20, 18, 10, 5, 3],
};
const POS_TYPES = [["bond", "UST par bond (notional USD)"], ["sr3", "SOFR 3M future (contracts)"], ["zq", "Fed funds future (contracts)"], ["custom", "Custom DV01 (USD/bp)"]];

async function ratesTool(out) {
  let c = null;
  try { c = await D.curve("US"); } catch (e) { out.replaceChildren(errorBox(`US curve unavailable: ${e.message}`)); return; }
  const n = c.d.length - 1, latest = Object.fromEntries(c.tenors.map((t, j) => [t, c.y[n][j]]));
  let pos = prefs.get("risk.dv01", [["bond", "10Y", 10_000_000], ["bond", "2Y", -20_000_000], ["sr3", "6", 100], ["custom", "30", 5000]]);
  const tbody = el("tbody");
  const tenorOpts = ["2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"].filter((t) => latest[t] != null).map((t) => [t, t]);
  const dv = (p) => {
    const [type, arg, q] = p;
    if (type === "bond") { const y = latest[arg]; return { years: S.TENOR_YEARS[arg], dv01: y == null ? null : S.parDV01(q, y, S.TENOR_YEARS[arg]), note: `par yield ${y?.toFixed(3)}%, D_mod ${S.parModDuration(y, S.TENOR_YEARS[arg]).toFixed(2)}` }; }
    if (type === "sr3") return { years: (+arg + 1.5) / 12, dv01: 25 * q, note: `$25/bp per contract; contract starts in ${arg}m` };
    if (type === "zq") return { years: (+arg + 0.5) / 12, dv01: (5_000_000 * 30 / 360 * 1e-4) * q, note: "$41.67/bp per contract" };
    return { years: +arg, dv01: q, note: "user-entered DV01" };
  };
  const draw = () => {
    prefs.set("risk.dv01", pos);
    tbody.replaceChildren(...pos.map((p, i) => {
      const r = dv(p);
      const argInput = p[0] === "bond" ? select(tenorOpts, p[1], (v) => { pos[i][1] = v; draw(); }, "Tenor")
        : numberInput(+p[1], (v) => { pos[i][1] = String(v); draw(); }, { width: 70, label: p[0] === "custom" ? "Tenor (years)" : "Months to contract start" });
      return el("tr", {}, el("td", {}, select(POS_TYPES, p[0], (v) => { pos[i][0] = v; pos[i][1] = v === "bond" ? "10Y" : v === "custom" ? "10" : "3"; draw(); }, "Type")),
        el("td", {}, argInput), el("td", {}, numberInput(p[2], (v) => { pos[i][2] = v; draw(); }, { width: 120, label: "Quantity" })),
        el("td", { class: "r num", text: money(r.dv01) }), el("td", { class: "dim", style: "white-space:normal", text: r.note }),
        el("td", {}, el("button", { class: "lnk", type: "button", text: "remove", onclick: () => { pos.splice(i, 1); draw(); } })));
    }));
    scen();
  };
  const pp = panel("Positions", { sub: "Positive DV01 = gains when yields fall (long duration). Futures: long contracts = long duration.", span: 3 });
  pp.body.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" }, el("thead", {}, el("tr", {}, ["Type", "Tenor / months", "Quantity", "DV01", "Basis", ""].map((h, j) => el("th", { class: j === 3 ? "r" : "", text: h })))), tbody)),
    el("button", { class: "btn-sm", type: "button", text: "+ Add position", onclick: () => { pos.push(["bond", "5Y", 1_000_000]); draw(); } }),
    formula("Bond DV01 = notional × D_mod(par yield, T) × 0.0001;  D_mod = (1/y)[1 − (1 + y/2)^(−2T)];  SR3 = $25/bp;  ZQ = $5m × 30/360 × 0.0001 = $41.67/bp"));
  pp.foot.append(`Latest US par curve ${F.date(c.d[n], "long")} (U.S. Treasury). Futures DV01s are exchange contract specifications. Bucketing uses the rate period each contract references.`);
  const ps = panel("Curve shock P&L", { span: 3 });
  const scOut = el("div");
  let knots = [...CURVE_SCEN["Bear steepener"]];
  const knotInputs = KNOT_T.map((t, i) => numberInput(knots[i], (v) => { knots[i] = v; scen(); }, { width: 64, label: `${t}y shock` }));
  const d1 = el("input", { type: "date", value: c.d[Math.max(0, n - 22)], min: c.d[0], max: c.d[n] }), d2 = el("input", { type: "date", value: c.d[n], min: c.d[0], max: c.d[n] });
  const histBtn = el("button", { class: "btn-sm", style: "margin:0", type: "button", text: "Apply historical move", onclick: () => {
    const ia = idxAt(c, d1.value), ib = idxAt(c, d2.value);
    knots = KNOT_T.map((t) => { const near = nearestTenor(c.tenors, t); const j = c.tenors.indexOf(near); return +(((c.y[ib][j] ?? 0) - (c.y[ia][j] ?? 0)) * 100).toFixed(1); });
    knots.forEach((k, i) => (knotInputs[i].value = k));
    scen(`Historical US curve move ${F.date(c.d[ia])} → ${F.date(c.d[ib])}`);
  } });
  ps.actions.append(select(Object.keys(CURVE_SCEN).map((k) => [k, k]), "Bear steepener", (v) => { knots = [...CURVE_SCEN[v]]; knots.forEach((k, i) => (knotInputs[i].value = k)); scen(v); }, "Scenario"));
  ps.body.append(el("div", { class: "form-grid", style: "grid-template-columns:repeat(auto-fill,minmax(90px,1fr))" }, KNOT_T.map((t, i) => el("label", { class: "fld" }, `${t < 1 ? t * 12 + "m" : t + "y"} (bp)`, knotInputs[i]))),
    el("div", { style: "display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:8px 0" }, el("label", { class: "fld" }, "From", d1), el("label", { class: "fld" }, "To", d2), histBtn), scOut);
  ps.foot.append("Shocks are linearly interpolated between knots and flat beyond them. P&L is first-order (DV01 × shock): it ignores convexity, carry and roll-down, and basis between futures and Treasuries. Preset shapes are illustrative assumptions.");
  function scen(title) {
    const items = pos.map((p) => ({ ...dv(p), p })).filter((x) => x.dv01 != null);
    const res = S.curveShockPnL(items.map((x) => ({ years: x.years, dv01: x.dv01, label: x.p })), KNOT_T.map((t, i) => [t, knots[i]]));
    const total = res.reduce((s, r) => s + r.pnl, 0);
    const bucket = (y) => (y <= 2 ? "Front (≤2y)" : y <= 7 ? "Belly (2–7y)" : "Long (>7y)");
    const byB = {};
    res.forEach((r) => (byB[bucket(r.years)] = (byB[bucket(r.years)] || 0) + r.dv01));
    scOut.replaceChildren(el("div", { style: "display:flex;gap:20px;flex-wrap:wrap;align-items:baseline" },
      el("div", {}, el("div", { class: "p-sub", text: title || "Scenario P&L" }), el("div", { class: total >= 0 ? "up" : "down", style: "font-size:22px;font-weight:600", text: `${total >= 0 ? "+" : "−"}$${Math.abs(Math.round(total)).toLocaleString("en-GB")}` })),
      el("div", { class: "small" }, "Net DV01 by bucket: ", Object.entries(byB).map(([b, v]) => `${b} ${money(v)}`).join(" · "))),
    el("table", { class: "tbl" }, el("thead", {}, el("tr", {}, ["Position", "Bucket (yrs)", "DV01", "Shock", "P&L"].map((h, j) => el("th", { class: j ? "r" : "", text: h })))),
      el("tbody", {}, res.map((r) => el("tr", {}, el("td", { text: `${POS_TYPES.find((t) => t[0] === r.label[0])[1].split(" (")[0]} ${r.label[1]}` }), el("td", { class: "r num", text: r.years.toFixed(2) }),
        el("td", { class: "r num", text: money(r.dv01) }), el("td", { class: "r num", text: `${r.shock.toFixed(1)}bp` }),
        el("td", { class: `r num ${r.pnl >= 0 ? "up" : "down"}`, text: `${r.pnl >= 0 ? "+" : "−"}$${Math.abs(Math.round(r.pnl)).toLocaleString("en-GB")}` }))))));
  }
  out.replaceChildren(el("div", { class: "grid3" }, pp.root, ps.root));
  draw();
}
function idxAt(c, date) { let i = c.d.length - 1; while (i > 0 && c.d[i] > date) i--; return i; }
function nearestTenor(tenors, t) { return tenors.reduce((a, b) => (Math.abs(S.TENOR_YEARS[b] - t) < Math.abs(S.TENOR_YEARS[a] - t) ? b : a)); }

// =============================================================== position sizing
async function sizingTool(out) {
  const cat = await D.catalog();
  const choices = INSTR.filter((x) => !x.bond).map((x) => [x.id, x.label]);
  const st = prefs.get("risk.size", { id: "SPX", capital: 1_000_000, riskPct: 0.5, multiplier: 50, entry: null, stop: null, z: 1.645, dv01Budget: null, dv01PerUnit: null,
    marginCapital: 200_000, marginPerUnit: 20_000, bookVol: 8, rho: 0.3 });
  const res = el("div");
  const p = panel("Inputs", { sub: "Volatility and price are pre-filled from the latest data and can be edited", span: 1 });
  const fields = el("div", { class: "form-grid" });
  const num = (key, label, opts = {}) => el("label", { class: "fld" }, label, numberInput(st[key] ?? "", (v) => { st[key] = Number.isFinite(v) ? v : null; run(); }, { width: 130, ...opts }));
  let vol = null, price = null;
  async function load() {
    try {
      const s = await D.series(st.id);
      price = s.v[s.v.length - 1];
      const r = S.changes(s.v.slice(-64), "pct");
      vol = S.std(r);
      if (st.entry == null) st.entry = +price.toFixed(2);
    } catch { vol = price = null; }
    fields.replaceChildren(
      el("label", { class: "fld" }, "Instrument", select(choices, st.id, async (v) => { st.id = v; st.entry = null; await load(); }, "Instrument")),
      num("capital", "Capital (USD)"), num("riskPct", "Risk budget % of capital", { step: 0.1 }), num("multiplier", "Contract multiplier"),
      num("entry", "Entry price"), num("stop", "Stop / invalidation price"), num("z", "VaR z (1.645 = 95%)", { step: 0.001 }),
      num("dv01Budget", "DV01 budget (USD/bp, rates)"), num("dv01PerUnit", "DV01 per unit"), num("marginCapital", "Margin capital (USD)"), num("marginPerUnit", "Margin per unit (USD)"),
      num("bookVol", "Existing book vol (% ann.)", { step: 0.1 }), num("rho", "Correlation with book", { step: 0.05, min: -1, max: 1 }));
    run();
  }
  function run() {
    prefs.set("risk.size", st);
    const riskCapital = (st.capital * st.riskPct) / 100;
    const r = S.positionSize({ riskCapital, entry: st.entry, stop: st.stop, multiplier: st.multiplier, dailyVol: vol, price: st.entry ?? price, z: st.z,
      dv01Budget: st.dv01Budget, dv01PerUnit: st.dv01PerUnit, marginCapital: st.marginCapital, marginPerUnit: st.marginPerUnit });
    const notional = r.units != null ? r.units * (st.entry ?? price) * st.multiplier : null;
    const posVol = notional != null && vol ? (notional * vol * Math.sqrt(252)) / st.capital * 100 : null;
    const newBook = posVol != null ? S.combinedVol(st.bookVol, posVol, st.rho) : null;
    const line = (k, v, f) => el("tr", {}, el("td", { text: k }), el("td", { class: "r num", text: v == null || !Number.isFinite(v) ? "—" : v.toFixed(2) }), el("td", { class: "dim", style: "white-space:normal", text: f }));
    res.replaceChildren(
      el("div", { class: "kpis" }, el("div", { class: "kpi" }, el("div", { class: "k", text: "Size (binding constraint)" }), el("div", { class: "v num", text: r.units == null ? "—" : `${r.units.toLocaleString("en-GB")} units` }),
        el("div", { class: "s", text: r.binding ? `binding: ${r.binding}` : "enter inputs" })),
      el("div", { class: "kpi" }, el("div", { class: "k", text: "Risk budget" }), el("div", { class: "v num", text: `$${Math.round(riskCapital).toLocaleString("en-GB")}` })),
      el("div", { class: "kpi" }, el("div", { class: "k", text: "Notional" }), el("div", { class: "v num", text: notional == null ? "—" : `$${Math.round(notional).toLocaleString("en-GB")}` })),
      el("div", { class: "kpi" }, el("div", { class: "k", text: "Position vol (% capital, ann.)" }), el("div", { class: "v num", text: posVol == null ? "—" : `${posVol.toFixed(2)}%` })),
      el("div", { class: "kpi" }, el("div", { class: "k", text: "Book vol after (ann.)" }), el("div", { class: "v num", text: newBook == null ? "—" : `${st.bookVol.toFixed(1)}% → ${newBook.toFixed(2)}%` }))),
      el("table", { class: "tbl" }, el("thead", {}, el("tr", {}, el("th", { text: "Constraint" }), el("th", { class: "r", text: "Max units (exact)" }), el("th", { text: "Formula" }))),
        el("tbody", {}, line("Stop distance", r.stop, "risk budget / (|entry − stop| × multiplier)"),
          line("Volatility (1-day VaR)", r.vol, `risk budget / (σ_daily × price × multiplier × z); σ_daily = ${vol ? (vol * 100).toFixed(2) + "%" : "n/a"} from the last 63 daily returns`),
          line("DV01 budget", r.dv01, "DV01 budget / DV01 per unit"), line("Margin", r.margin, "margin capital / margin per unit"))),
      formula("book σ after = √(σ_book² + σ_pos² + 2ρ·σ_book·σ_pos)"),
      el("p", { class: "note", text: "A sizing calculation under stated assumptions, not a recommendation to trade. Margin and multipliers vary by venue and broker: check the contract specification." }));
  }
  p.body.append(fields);
  const pr = panel("Result", { span: 2 });
  pr.body.append(res);
  out.replaceChildren(el("div", { class: "grid3" }, p.root, pr.root));
  await load();
}
