// Rates & curves: curve snapshots and their evolution, tenor changes, spreads, real yields, cross-country differentials.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, segmented, sourceLine, link, downloadCSV } from "../ui.js";
import { curveChart, timeChart, bars } from "../chart.js";
import { TENOR_YEARS } from "../stats.js";
import { header, seriesTable, chartPanel, formula } from "./common.js";

const CURVES = [["US", "US"], ["DE", "Germany"], ["UK", "UK"], ["JP", "Japan"], ["CA", "Canada"]];
const COMPARE = [["1W", 7], ["1M", 30], ["3M", 91], ["1Y", 365]];

export async function render(root, { params, setParams, go }) {
  const cat = await D.catalog();
  const cid = params.curve || "US";
  root.append(header("Rates & curves", "Government curves are end-of-day. US: Treasury par yields. Germany: Bundesbank Svensson zero-coupon. UK: BoE nominal par. Japan: MoF. Canada: BoC benchmarks.",
    segmented(CURVES, cid, (v) => go(`#rates?curve=${v}`), "Curve")));

  const grid = el("div", { class: "grid3" });
  root.append(grid);
  const snap = panel(`${CURVES.find((c) => c[0] === cid)[1]} curve`, { sub: "Latest vs earlier dates. Pick a historical date to compare.", span: 2 });
  const chgP = panel("Change by tenor", { sub: "bp, latest vs selected horizon", span: 1 });
  grid.append(snap.root, chgP.root);

  let c;
  try { c = await D.curve(cid); } catch (e) { snap.body.append(errorBox(e.message, "This curve's provider may have failed. Other curves are unaffected.")); }
  if (c) {
    const meta = c.meta || {};
    const n = c.d.length - 1, last = c.d[n];
    const idxAt = (target) => { let i = n; while (i > 0 && c.d[i] > target) i--; return i; };
    const back = (days) => idxAt(new Date(Date.parse(last) - days * 864e5).toISOString().slice(0, 10));
    const pts = (i) => c.tenors.map((t, j) => [TENOR_YEARS[t] ?? TENOR_YEARS[t.toUpperCase()], c.y[i][j]]).filter(([x, y]) => x != null && y != null);
    const tl = c.tenors.map((t) => [TENOR_YEARS[t] ?? TENOR_YEARS[t.toUpperCase()], t]);
    const cmpDate = el("input", { type: "date", value: params.cmp || "", min: c.d[0], max: last, "aria-label": "Compare with date" });
    const host = el("div");
    const drawSnap = () => {
      const picks = [[n, "Latest"], [back(30), "1M ago"], [back(365), "1Y ago"]];
      if (cmpDate.value) picks.push([idxAt(cmpDate.value), "Selected"]);
      host.replaceChildren(curveChart(picks.map(([i, lab], k) => ({ label: `${lab} · ${F.date(c.d[i])}`, pts: pts(i), dash: k === 2 ? [5, 4] : undefined })),
        { tenorLabels: tl, height: 280 }).el);
    };
    cmpDate.addEventListener("change", () => { setParams({ cmp: cmpDate.value }); drawSnap(); });
    snap.actions.append(el("label", { class: "fld" }, "Compare date", cmpDate),
      el("button", { class: "lnk", type: "button", text: "CSV", onclick: () => downloadCSV(`curve_${cid}.csv`, ["date", ...c.tenors], c.d.map((d, i) => [d, ...c.y[i]])) }));
    snap.body.append(host); drawSnap();
    snap.foot.append(sourceLine([meta]), meta.status === "fallback" ? " · showing last good data (latest fetch failed)" : "", meta.notes?.length ? ` · ${meta.notes.join("; ")}` : "");

    // Change by tenor for a chosen horizon
    const barsHost = el("div");
    const drawBars = (h) => {
      const i0 = back(COMPARE.find((x) => x[0] === h)[1]);
      barsHost.replaceChildren(bars(c.tenors.map((t, j) => {
        const a = c.y[n][j], b = c.y[i0][j];
        const v = a != null && b != null ? (a - b) * 100 : null;
        return { label: t, value: v, text: v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}` };
      })), el("p", { class: "note", text: `${F.date(c.d[i0], "long")} → ${F.date(last, "long")}. A bigger change at the long end than the front end means steepening.` }));
      setParams({ h });
    };
    chgP.actions.append(segmented(COMPARE.map(([k]) => [k, k]), params.h || "1M", drawBars, "Horizon"));
    chgP.body.append(barsHost); drawBars(params.h || "1M");

    // Tenor history
    const pick = c.tenors.filter((t) => ["2Y", "5Y", "10Y", "30Y", "20Y", "Long"].includes(t)).slice(0, 4);
    const hist = panel(`${cid} yields by tenor`, { sub: "History of key tenors. Drag to zoom.", span: 3 });
    hist.body.append(timeChart(pick.map((t) => { const j = c.tenors.indexOf(t); const dd = [], vv = []; c.d.forEach((d, i) => { if (c.y[i][j] != null) { dd.push(d); vv.push(c.y[i][j]); } }); return { label: `${cid} ${t}`, d: dd, v: vv }; }),
      { units: "%", range: params.range || "3Y", height: 260, filename: `${cid}_tenors`, onRange: (r) => setParams({ range: r }) }).el);
    grid.append(hist.root);
  }

  // Spreads
  const sp = panel("Curve and cross-market spreads", { sub: "bp. Click for history.", span: 3 });
  sp.body.append(seriesTable(cat, [["US curve", ["US2S10S", "US5S30S", "US3M10Y", "US2Y_EFFR"]], ["Germany", ["DE2S10S"]],
    ["10Y differentials vs US", ["US_DE_10Y", "US_UK_10Y", "US_JP_10Y", "US_CA_10Y"]]], { go }));
  sp.foot.append("Cross-country spreads mix curve conventions (par vs zero-coupon), so read their changes rather than the level. Formulas are under each series.");
  grid.append(sp.root);

  grid.append(await chartPanel("US curve slopes", ["US2S10S", "US5S30S", "US3M10Y"], { units: "bp", range: "5Y", span: 2, sub: "bp. Below zero = inverted." }));
  const decomp = panel("Reading curve moves", { span: 1 });
  decomp.body.append(el("div", { class: "small" },
    el("p", {}, el("strong", { text: "Bull steepener: " }), "front-end yields fall more than long-end yields. Usually easing being priced in."),
    el("p", {}, el("strong", { text: "Bear steepener: " }), "long-end yields rise more. Usually term premium, supply or inflation compensation; check the 10Y term premium and breakevens below."),
    el("p", {}, el("strong", { text: "Bear flattener: " }), "front-end yields rise more. Usually hikes being priced in, or cuts priced out."),
    el("p", {}, el("strong", { text: "Bull flattener: " }), "long-end yields fall more. Usually growth worries or a flight to duration."),
    formula("Δ(10Y) = Δ(expected short rates) + Δ(term premium)   [Kim–Wright model estimate shown below]")));
  grid.append(decomp.root);
  grid.append(await chartPanel("Real yields and breakevens", ["TIPS5Y", "TIPS10Y", "BE5Y", "BE10Y", "BE5Y5Y"], { units: "%", range: "5Y", span: 2,
    sub: "TIPS real yields (H.15) and market-implied inflation compensation", note: "Breakeven = nominal − TIPS yield. It includes inflation risk and liquidity premia, so it is not a pure inflation expectation." }));
  grid.append(await chartPanel("10Y term premium", ["TP10Y"], { units: "%", range: "10Y", span: 1, sub: "Kim–Wright model estimate (Federal Reserve Board)", note: "A model estimate, not an observed price." }));
  grid.append(await chartPanel("10Y realised volatility", ["UST10Y_RVOL"], { units: "bp/yr", range: "5Y", span: 1, sub: "Substitute for MOVE (not available)", note: "stdev of daily 10Y yield changes over 21 days × √252, in bp." }));
  grid.append(await chartPanel("Global 10Y yields (daily)", ["US_10Y", "DE_10Y", "UK_10Y", "JP_10Y", "CA_10Y"], { units: "%", range: "3Y", span: 2,
    labels: { US_10Y: "US", DE_10Y: "Germany", UK_10Y: "UK", JP_10Y: "Japan", CA_10Y: "Canada" } }));
  root.append(el("p", { class: "note" }, "Methodology and sources: ", link("#sources", "Sources & status"), "."));
}
