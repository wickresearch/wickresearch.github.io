// Chart helpers on top of uPlot (vendored, MIT). Conventions follow the data-viz rules used across
// the site: one y-axis per chart, a fixed validated categorical order, thin 2px lines, recessive grid,
// legend always present for ≥ 2 series, hover readout via uPlot's live legend.
import uPlot from "../../vendor/uplot/uPlot.esm.js";
import { el, downloadCSV } from "./ui.js";
import * as F from "./fmt.js";

// Categorical palette validated for the navy surface (#0F2330) with the data-viz validator:
// lightness band, chroma floor, adjacent CVD ΔE ≥ 8.4, normal-vision ΔE ≥ 19.3, contrast ≥ 3:1. Fixed order.
export const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];
export const SINGLE = "#F2EECF"; // brand cream for single-series charts
const GRID = "rgba(232,232,232,0.07)", AXIS = "#8A9AAD", FONT = "11px Inter, system-ui, sans-serif";

const toTs = (d) => Date.parse(d + "T00:00:00Z") / 1000;
export const RANGES = [["1M", 31], ["3M", 92], ["6M", 183], ["YTD", "ytd"], ["1Y", 366], ["3Y", 1096], ["5Y", 1827], ["10Y", 3653], ["MAX", null]];

function axisFmt(units) {
  return (u, vals) => vals.map((v) => (v == null ? "" : units === "%" ? v.toFixed(Math.abs(v) < 10 ? 2 : 1) : units === "bp" ? v.toFixed(0)
    : units === "USD bn" ? (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "tn" : v.toFixed(0)) : Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + "k" : +v.toFixed(2)));
}

function recessionPlugin(periods) {
  return {
    hooks: {
      drawClear: (u) => {
        if (!periods || !periods.length) return;
        const { ctx, bbox } = u;
        ctx.save();
        ctx.fillStyle = "rgba(232,232,232,0.06)";
        for (const [a, b] of periods) {
          const x0 = u.valToPos(toTs(a), "x", true), x1 = u.valToPos(toTs(b), "x", true);
          const L = Math.max(bbox.left, x0), R = Math.min(bbox.left + bbox.width, x1);
          if (R > L) ctx.fillRect(L, bbox.top, R - L, bbox.height);
        }
        ctx.restore();
      },
    },
  };
}

function zeroLinePlugin() {
  return { hooks: { draw: (u) => {
    const sc = u.scales.y; if (!(sc.min < 0 && sc.max > 0)) return;
    const y = u.valToPos(0, "y", true), { ctx, bbox } = u;
    ctx.save(); ctx.strokeStyle = "rgba(232,232,232,0.28)"; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(bbox.left, y); ctx.lineTo(bbox.left + bbox.width, y); ctx.stroke(); ctx.restore();
  } } };
}

/** When the cursor leaves the plot, show the latest values in the legend instead of dashes. */
function lastValueLegend() {
  return { hooks: { setLegend: (u) => { if (u.legend.idx == null && u.data[0].length) u.setLegend({ idx: u.data[0].length - 1 }); } } };
}

/** Recession periods from the NBER indicator series {d, v}. */
export function recessionPeriods(s) {
  const out = []; let start = null;
  s.d.forEach((d, i) => {
    if (s.v[i] === 1 && start == null) start = d;
    if (s.v[i] !== 1 && start != null) { out.push([start, d]); start = null; }
  });
  if (start) out.push([start, s.d[s.d.length - 1]]);
  return out;
}

/**
 * Time-series line chart.
 * series: [{label, d, v, color?, step?, dash?, width?}], opts: {units, height, range, ranges, recessions, band:[iLow,iHigh], title}
 * Returns a controller {u, setRange, el}.
 */
export function timeChart(series, opts = {}) {
  const host = el("div", { class: "chart" });
  const tools = el("div", { class: "chart-tools" });
  const plotEl = el("div", { class: "plot" });
  host.append(tools, plotEl);
  if (!series.length) { plotEl.append(el("div", { class: "err", text: "No data to chart." })); return { el: host }; }

  const all = new Set(); series.forEach((s) => s.d.forEach((d) => all.add(d)));
  const dates = [...all].sort();
  const xs = dates.map(toTs);
  const cols = series.map((s) => { const m = new Map(s.d.map((d, i) => [d, s.v[i]])); return dates.map((d) => (m.has(d) ? m.get(d) : null)); });
  const units = opts.units || "";
  const single = series.length === 1;
  const fmtV = (v) => (v == null ? "—" : F.value(v, units));

  const uSeries = [{ label: "Date", value: (u, ts) => (ts == null ? "—" : F.date(new Date(ts * 1000).toISOString().slice(0, 10), "long")) }].concat(series.map((s, i) => ({
    label: s.label, stroke: s.color || (single ? SINGLE : PALETTE[i % PALETTE.length]), width: s.width || 2,
    dash: s.dash, spanGaps: true, points: { show: false },
    paths: s.step ? uPlot.paths.stepped({ align: 1 }) : undefined, value: (u, v) => fmtV(v),
  })));
  const bands = opts.band ? [{ series: [opts.band[1] + 1, opts.band[0] + 1], fill: "rgba(57,135,229,0.12)" }] : undefined;

  const width = () => Math.max(260, plotEl.clientWidth || host.clientWidth || 600);
  const u = new uPlot({
    width: width(), height: opts.height || 260, series: uSeries, bands,
    scales: { x: { time: true }, y: { auto: true, range: opts.yRange } },
    axes: [
      { stroke: AXIS, font: FONT, grid: { stroke: GRID, width: 1 }, ticks: { stroke: GRID } },
      { stroke: AXIS, font: FONT, grid: { stroke: GRID, width: 1 }, ticks: { show: false }, values: axisFmt(units), size: 52,
        label: opts.yLabel, labelFont: FONT, labelSize: opts.yLabel ? 18 : 0 },
    ],
    legend: { show: true, live: true },
    cursor: { drag: { x: true, y: false, setScale: true }, points: { size: 6 } },
    plugins: [recessionPlugin(opts.recessions), zeroLinePlugin(), lastValueLegend()],
  }, [xs, ...cols], plotEl);

  const last = dates[dates.length - 1];
  function setRange(r) {
    const days = (RANGES.find((x) => x[0] === r) || [])[1];
    let min = xs[0];
    if (days === "ytd") min = toTs(`${last.slice(0, 4)}-01-01`);
    else if (days) min = Math.max(xs[0], toTs(last) - days * 86400);
    u.setScale("x", { min, max: xs[xs.length - 1] });
    tools.querySelectorAll(".rng button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.r === r)));
    opts.onRange && opts.onRange(r);
  }
  if (opts.ranges !== false) {
    const rng = el("div", { class: "rng seg", role: "group", "aria-label": "Date range" });
    RANGES.forEach(([r]) => rng.append(el("button", { type: "button", "data-r": r, text: r, onclick: () => setRange(r) })));
    tools.append(rng);
  }
  tools.append(el("div", { class: "chart-actions" },
    el("button", { type: "button", class: "lnk", title: "Download the plotted observations", text: "CSV", onclick: () =>
      downloadCSV(`${(opts.filename || series.map((s) => s.id || s.label).join("_")).replace(/[^\w-]+/g, "_")}.csv`, ["date", ...series.map((s) => s.label)],
        dates.map((d, i) => [d, ...cols.map((c) => c[i])])) }),
    el("button", { type: "button", class: "lnk", title: "Download chart image", text: "PNG", onclick: () => {
      const a = el("a", { href: u.ctx.canvas.toDataURL("image/png"), download: `${opts.filename || "chart"}.png` }); document.body.append(a); a.click(); a.remove();
    } }),
    el("span", { class: "hint", text: "drag to zoom · double-click to reset" })));
  const ro = new ResizeObserver(() => u.setSize({ width: width(), height: opts.height || 260 }));
  ro.observe(plotEl);
  requestAnimationFrame(() => { u.setSize({ width: width(), height: opts.height || 260 }); setRange(opts.range || "1Y"); });
  return { el: host, u, setRange, dates };
}

/** Yield-curve snapshot chart: x = maturity in years on a log axis. curves: [{label, pts:[[years, yield]], color?, dash?}] */
export function curveChart(curves, { height = 260, tenorLabels = [] } = {}) {
  const host = el("div", { class: "chart" }); const plotEl = el("div", { class: "plot" }); host.append(plotEl);
  const xsSet = new Set(); curves.forEach((c) => c.pts.forEach(([x]) => xsSet.add(x)));
  const xs = [...xsSet].sort((a, b) => a - b);
  const cols = curves.map((c) => { const m = new Map(c.pts); return xs.map((x) => (m.has(x) ? m.get(x) : null)); });
  const lab = new Map(tenorLabels);
  const width = () => Math.max(260, plotEl.clientWidth || 600);
  const u = new uPlot({
    width: width(), height,
    series: [{ label: "Tenor", value: (u, v) => (v == null ? "—" : lab.get(v) || `${v}y`) }].concat(curves.map((c, i) => ({
      label: c.label, stroke: c.color || (curves.length === 1 ? SINGLE : PALETTE[i % PALETTE.length]), width: 2, dash: c.dash,
      spanGaps: true, points: { show: true, size: 5 }, value: (u, v) => (v == null ? "—" : v.toFixed(3) + "%") }))),
    scales: { x: { time: false, distr: 3 } },
    axes: [
      { stroke: AXIS, font: FONT, grid: { stroke: GRID }, ticks: { stroke: GRID }, splits: () => xs, values: (u, vals) => vals.map((v) => lab.get(v) || "") ,
        label: "Maturity (log scale)", labelFont: FONT, labelSize: 18 },
      { stroke: AXIS, font: FONT, grid: { stroke: GRID }, ticks: { show: false }, values: axisFmt("%"), size: 50, label: "Yield, %", labelFont: FONT, labelSize: 18 },
    ],
    legend: { live: true }, cursor: { drag: { x: false, y: false } }, plugins: [lastValueLegend()],
  }, [xs, ...cols], plotEl);
  new ResizeObserver(() => u.setSize({ width: width(), height })).observe(plotEl);
  requestAnimationFrame(() => u.setSize({ width: width(), height }));
  return { el: host, u };
}

/** Line chart on a numeric (non-time) x axis, e.g. event-study offsets. */
export function xyChart(xs, series, { height = 240, xLabel = "", yUnits = "", band } = {}) {
  const host = el("div", { class: "chart" }); const plotEl = el("div", { class: "plot" }); host.append(plotEl);
  const width = () => Math.max(260, plotEl.clientWidth || 600);
  const u = new uPlot({
    width: width(), height,
    series: [{ label: "Day", value: (u, v) => (v == null ? "—" : String(v)) }].concat(series.map((s, i) => ({
      label: s.label, stroke: s.color || PALETTE[i % PALETTE.length], width: s.width || 2, dash: s.dash, spanGaps: true,
      points: { show: false }, value: (u, v) => (v == null ? "—" : v.toFixed(yUnits === "bp" ? 1 : 2) + (yUnits === "bp" ? "bp" : yUnits === "pct" ? "%" : "")) }))),
    bands: band ? [{ series: [band[1] + 1, band[0] + 1], fill: "rgba(242,238,207,0.10)" }] : undefined,
    scales: { x: { time: false } },
    axes: [{ stroke: AXIS, font: FONT, grid: { stroke: GRID }, label: xLabel, labelFont: FONT, labelSize: 18 },
      { stroke: AXIS, font: FONT, grid: { stroke: GRID }, size: 50, values: (u, vals) => vals.map((v) => +v.toFixed(2)), label: yUnits === "bp" ? "bp" : yUnits === "pct" ? "%" : "", labelFont: FONT, labelSize: 18 }],
    plugins: [zeroLinePlugin(), lastValueLegend()], legend: { live: true },
  }, [xs, ...series.map((s) => s.v)], plotEl);
  new ResizeObserver(() => u.setSize({ width: width(), height })).observe(plotEl);
  requestAnimationFrame(() => u.setSize({ width: width(), height }));
  return { el: host, u };
}

/** Simple labelled bar list (SVG-free HTML bars). items: [{label, value, text}] – diverging around 0. */
export function bars(items, { units = "" } = {}) {
  const max = Math.max(1e-9, ...items.map((i) => Math.abs(i.value ?? 0)));
  return el("div", { class: "bars" }, items.map((i) => {
    const w = i.value == null ? 0 : (Math.abs(i.value) / max) * 50;
    const pos = (i.value ?? 0) >= 0;
    return el("div", { class: "bar-row" },
      el("span", { class: "bl", text: i.label }),
      el("span", { class: "bt" }, el("span", { class: `bf ${pos ? "pos" : "neg"}`, style: `${pos ? "left:50%" : `left:${50 - w}%`};width:${w}%` })),
      el("span", { class: `bv num ${i.value > 0 ? "up" : i.value < 0 ? "down" : "flat"}`, text: i.text ?? F.change(i.value, "abs", units)[0] }));
  }));
}

/** Correlation heatmap as an accessible table; diverging blue (−) ↔ orange (+) with neutral midpoint. */
export function heatmap(labels, M, { dp = 2 } = {}) {
  const color = (v) => {
    if (v == null || !Number.isFinite(v)) return "transparent";
    const a = Math.min(1, Math.abs(v));
    return v >= 0 ? `rgba(217,89,38,${0.08 + 0.72 * a})` : `rgba(57,135,229,${0.08 + 0.72 * a})`;
  };
  return el("div", { class: "tbl-wrap" }, el("table", { class: "heat" },
    el("thead", {}, el("tr", {}, el("th", {}), labels.map((l) => el("th", { scope: "col", text: l })))),
    el("tbody", {}, M.map((row, i) => el("tr", {}, el("th", { scope: "row", text: labels[i] }),
      row.map((v, j) => el("td", { class: "num", style: `background:${i === j ? "transparent" : color(v)}`, title: `${labels[i]} vs ${labels[j]}: ${v?.toFixed(3)}`,
        text: i === j ? "1" : v == null || !Number.isFinite(v) ? "—" : v.toFixed(dp).replace("-", "−") })))))));
}
