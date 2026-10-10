// Cross-asset: performance, correlation matrix, rolling correlation/volatility and drawdowns over a chosen window.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, segmented, multiSelect, select, sourceLine, prefs } from "../ui.js";
import { timeChart, heatmap } from "../chart.js";
import * as S from "../stats.js";
import { header, formula } from "./common.js";

export const UNIVERSE = [["SPX", "S&P 500"], ["NASDAQ", "Nasdaq"], ["NIKKEI", "Nikkei 225"], ["UST2Y", "UST 2Y"], ["UST10Y", "UST 10Y"], ["UST30Y", "UST 30Y"],
  ["BE10Y", "10Y breakeven"], ["TIPS10Y", "10Y real"], ["DE_10Y", "Bund 10Y"], ["USD_BROAD", "USD broad"], ["EURUSD", "EUR/USD"], ["USDJPY", "USD/JPY"],
  ["WTI", "WTI"], ["BRENT", "Brent"], ["GOLD_PROXY", "Gold (PAXG)"], ["BTC", "Bitcoin"], ["ETH", "Ether"], ["VIX", "VIX"], ["HY_OAS", "HY OAS"]];
const WINDOWS = [["3M", 92], ["6M", 183], ["1Y", 366], ["3Y", 1096], ["5Y", 1827]];
const DEFAULT = ["SPX", "UST10Y", "USD_BROAD", "BRENT", "GOLD_PROXY", "BTC"];

/** Last observation per ISO week (Friday-ish) – used for the weekly frequency option. */
function weekly(d, cols) {
  const keep = [];
  d.forEach((x, i) => {
    const dt = new Date(x + "T00:00:00Z"); const wk = Math.floor((dt - Date.UTC(1970, 0, 5)) / (7 * 864e5));
    if (keep.length && keep[keep.length - 1].wk === wk) keep[keep.length - 1].i = i; else keep.push({ wk, i });
  });
  return { d: keep.map((k) => d[k.i]), cols: cols.map((c) => keep.map((k) => c[k.i])) };
}

export async function render(root, { params, setParams }) {
  const label = Object.fromEntries(UNIVERSE);
  let ids = (params.ids ? params.ids.split(",") : prefs.get("cross.ids", DEFAULT)).filter((i) => label[i]);
  let win = params.win || "1Y", freq = params.freq || "D";
  root.append(header("Cross-asset", "Changes are returns (%) for prices and basis-point changes for yields and spreads. All instruments are aligned on common dates; crypto trades every day, so weekends are folded into Monday."));
  const ctrl = el("div", { class: "panel", style: "padding:10px 12px;margin-bottom:12px" },
    el("div", { class: "p-sub", style: "margin-bottom:6px", text: "Instruments (saved in this browser):" }),
    multiSelect(UNIVERSE, ids, (v) => { ids = v; prefs.set("cross.ids", v); }, "Instruments"),
    el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;align-items:center" },
      segmented(WINDOWS.map(([k]) => [k, k]), win, (v) => (win = v), "Window"), segmented([["D", "Daily"], ["W", "Weekly"]], freq, (v) => (freq = v), "Frequency"),
      el("button", { class: "btn-sm", style: "margin:0", type: "button", text: "Update", onclick: () => draw() })));
  const out = el("div");
  root.append(ctrl, out);
  await draw();

  async function draw() {
    setParams({ ids: ids.join(","), win, freq });
    out.replaceChildren(el("div", { class: "loading", text: "Calculating…" }));
    const { ok, failed } = await D.many(ids);
    const use = ids.filter((i) => ok[i]);
    if (use.length < 2) { out.replaceChildren(errorBox("Select at least two available instruments.")); return; }
    const days = WINDOWS.find((w) => w[0] === win)[1];
    const full = S.alignInner(use.map((i) => ok[i]));
    if (full.d.length < 30) { out.replaceChildren(errorBox("Too few common observations for these instruments.")); return; }
    const last = full.d[full.d.length - 1];
    const start = new Date(Date.parse(last) - days * 864e5).toISOString().slice(0, 10);
    const i0 = full.d.findIndex((x) => x >= start);
    let A = { d: full.d.slice(i0), cols: full.cols.map((c) => c.slice(i0)) };
    if (freq === "W") A = weekly(A.d, A.cols);
    const kinds = use.map((i) => ok[i].meta.change === "pct" ? "pct" : (ok[i].meta.units === "%" ? "bp" : "abs"));
    const ch = A.cols.map((c, k) => S.changes(c, kinds[k]).map((x) => (kinds[k] === "pct" ? x * 100 : x)));
    const per = freq === "W" ? 52 : 252;
    const grid = el("div", { class: "grid3" });
    const note = el("p", { class: "note", text: `${A.d.length} common ${freq === "W" ? "weekly" : "daily"} observations, ${F.date(A.d[0], "long")} → ${F.date(last, "long")}. ` +
      (Object.keys(failed).length ? `Unavailable: ${Object.keys(failed).join(", ")}.` : "") });

    // Performance table
    const pt = panel("Performance over the window", { span: 3 });
    pt.body.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ["Instrument", "Start", "Last", "Change", "Ann. vol of changes", "Max drawdown", "Worst period", "Best period"].map((h, k) => el("th", { class: k ? "r" : "", text: h })))),
      el("tbody", {}, use.map((id, k) => {
        const c = A.cols[k], x = ch[k], kind = kinds[k], u = ok[id].meta.units;
        const tot = kind === "pct" ? (c[c.length - 1] / c[0] - 1) * 100 : kind === "bp" ? (c[c.length - 1] - c[0]) * 100 : c[c.length - 1] - c[0];
        const unit = kind === "pct" ? "%" : kind === "bp" ? "bp" : "";
        const vol = S.std(x) * Math.sqrt(per);
        return el("tr", {}, el("td", { text: label[id] }), el("td", { class: "r num", text: F.value(c[0], u) }), el("td", { class: "r num", text: F.value(c[c.length - 1], u) }),
          el("td", { class: `r num ${tot > 0 ? "up" : tot < 0 ? "down" : ""}`, text: `${tot > 0 ? "+" : tot < 0 ? "−" : ""}${Math.abs(tot).toFixed(kind === "pct" ? 2 : 1)}${unit}` }),
          el("td", { class: "r num", text: `${vol.toFixed(1)}${kind === "pct" ? "%" : kind === "bp" ? "bp" : ""}` }),
          el("td", { class: "r num", text: kind === "pct" ? `${(S.maxDrawdown(c) * 100).toFixed(1)}%` : "—" }),
          el("td", { class: "r num", text: `${Math.min(...x).toFixed(kind === "pct" ? 2 : 1)}${unit}` }), el("td", { class: "r num", text: `${Math.max(...x).toFixed(kind === "pct" ? 2 : 1)}${unit}` }));
      })))));
    pt.foot.append(note);
    grid.append(pt.root);

    // Normalised prices and yield changes (one axis each – never dual-axis)
    const priceIdx = use.map((id, k) => [id, k]).filter(([, k]) => kinds[k] === "pct");
    const yldIdx = use.map((id, k) => [id, k]).filter(([, k]) => kinds[k] !== "pct");
    if (priceIdx.length) {
      const p = panel("Relative performance", { sub: "Prices rebased to 100 at the window start", span: yldIdx.length ? 2 : 3 });
      p.body.append(timeChart(priceIdx.map(([id, k]) => ({ label: label[id], d: A.d, v: S.normalise(A.cols[k]) })), { units: "", range: "MAX", ranges: false, height: 260, filename: "relative_performance" }).el);
      grid.append(p.root);
    }
    if (yldIdx.length) {
      const p = panel("Yield and spread changes", { sub: "Change since window start, bp", span: priceIdx.length ? 1 : 3 });
      p.body.append(timeChart(yldIdx.map(([id, k]) => ({ label: label[id], d: A.d, v: A.cols[k].map((x) => (kinds[k] === "bp" ? (x - A.cols[k][0]) * 100 : x - A.cols[k][0])) })),
        { units: "bp", range: "MAX", ranges: false, height: 260, filename: "yield_changes" }).el);
      grid.append(p.root);
    }

    // Correlation matrix
    const pc = panel("Correlation of changes", { sub: `${freq === "W" ? "Weekly" : "Daily"} changes over the window (Pearson)`, span: 2 });
    pc.body.append(heatmap(use.map((i) => label[i]), S.corrMatrix(ch)));
    pc.body.append(el("p", { class: "note", text: "Orange = positive, blue = negative. Correlation measures co-movement, not causation, and it shifts between regimes (for example, the stock–bond sign flips between inflation-led and growth-led periods). Compare windows before relying on a number." }));
    grid.append(pc.root);
    const pf = panel("How changes are measured", { span: 1 });
    pf.body.append(formula("price instruments: r_t = P_t / P_{t−1} − 1"), formula("yields, spreads: Δ_t = (y_t − y_{t−1}) × 100 bp"),
      formula("ann. vol = stdev(changes) × √252 (daily) or √52 (weekly)"), formula("max drawdown = min_t (P_t / max_{s≤t} P_s − 1)"));
    grid.append(pf.root);

    // Rolling correlation – full common history of the pair
    const pr = panel("Rolling correlation", { sub: "Pair over its full common history, 63-day window of daily changes", span: 2 });
    let a = params.a && use.includes(params.a) ? params.a : use[0], b = params.b && use.includes(params.b) ? params.b : use[1];
    const host = el("div");
    const drawRoll = () => {
      setParams({ a, b });
      const P = S.alignInner([ok[a], ok[b]]);
      const ka = ok[a].meta.change === "pct" ? "pct" : "bp", kb = ok[b].meta.change === "pct" ? "pct" : "bp";
      const ra = S.changes(P.cols[0], ka), rb = S.changes(P.cols[1], kb);
      const rc = S.rollingCorr(ra, rb, 63);
      host.replaceChildren(timeChart([{ label: `${label[a]} vs ${label[b]}`, d: P.d.slice(1), v: rc }], { units: "", range: "5Y", height: 240, yRange: [-1, 1], filename: `rollcorr_${a}_${b}` }).el);
    };
    pr.actions.append(select(use.map((i) => [i, label[i]]), a, (v) => { a = v; drawRoll(); }, "First"), select(use.map((i) => [i, label[i]]), b, (v) => { b = v; drawRoll(); }, "Second"));
    pr.body.append(host); drawRoll();
    grid.append(pr.root);

    // Rolling volatility (prices) and drawdowns
    if (priceIdx.length) {
      const pv = panel("Rolling volatility", { sub: "21-day, annualised %, price instruments", span: 1 });
      const rv = priceIdx.map(([id]) => { const s = ok[id]; const r = S.changes(s.v, "pct"); return { label: label[id], d: s.d.slice(1), v: S.rolling(r, 21, (w) => S.std(w) * Math.sqrt(252) * 100) }; });
      pv.body.append(timeChart(rv, { units: "%", range: "3Y", height: 240, filename: "rolling_vol" }).el);
      grid.append(pv.root);
      const pd = panel("Drawdowns", { sub: "% below running peak within the window", span: 3 });
      pd.body.append(timeChart(priceIdx.map(([id, k]) => ({ label: label[id], d: A.d, v: S.drawdowns(A.cols[k]).map((x) => x * 100) })), { units: "%", range: "MAX", ranges: false, height: 220, filename: "drawdowns" }).el);
      grid.append(pd.root);
    }
    grid.append(el("div", { class: "span-3", style: "grid-column:1/-1" }, sourceLine(use.map((i) => ok[i].meta))));
    out.replaceChildren(grid);
  }
}
