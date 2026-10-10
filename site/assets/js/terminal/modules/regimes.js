// Growth × inflation regimes: deliberately simple, publication-lagged, and descriptive only.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, select, segmented, sourceLine } from "../ui.js";
import { timeChart } from "../chart.js";
import * as S from "../stats.js";
import { header, formula } from "./common.js";

const GROWTH = [["INDPRO_YOY", "Industrial production y/y"], ["RETAIL_YOY", "Retail sales y/y"]];
const INFL = [["CORE_CPI_YOY", "Core CPI y/y"], ["CPI_YOY", "CPI y/y"], ["CORE_PCE_YOY", "Core PCE y/y"]];
const ASSETS = [["UST2Y", "UST 2Y", "bp"], ["UST10Y", "UST 10Y", "bp"], ["US2S10S", "2s10s", "abs"], ["USD_BROAD", "USD broad", "pct"], ["NASDAQ", "Nasdaq", "pct"],
  ["SPX", "S&P 500", "pct"], ["WTI", "WTI", "pct"], ["BE10Y", "10Y breakeven", "bp"]];
const ORDER = ["Reflation", "Goldilocks", "Stagflation", "Slowdown"];
const DESC = { Reflation: "growth ↑ inflation ↑", Goldilocks: "growth ↑ inflation ↓", Stagflation: "growth ↓ inflation ↑", Slowdown: "growth ↓ inflation ↓" };

export async function render(root, { params, setParams }) {
  let g = params.g || "INDPRO_YOY", p = params.p || "CORE_CPI_YOY", look = +params.look || 3, lag = +params.lag || 2;
  root.append(header("Regimes", "Months are classified by the direction of growth and inflation, using only data published by then. The table shows how assets moved in each regime. It describes history and is not a forecast."));
  const ctrl = el("div", { class: "panel", style: "padding:10px 12px;margin-bottom:12px;display:flex;gap:12px;flex-wrap:wrap;align-items:end" },
    el("label", { class: "fld" }, "Growth measure", select(GROWTH, g, (v) => { g = v; run(); })),
    el("label", { class: "fld" }, "Inflation measure", select(INFL, p, (v) => { p = v; run(); })),
    el("label", { class: "fld" }, "Direction over", segmented([[3, "3 months"], [6, "6 months"]], look, (v) => { look = v; run(); })),
    el("label", { class: "fld" }, "Publication lag", segmented([[1, "1 month"], [2, "2 months"], [3, "3 months"]], lag, (v) => { lag = v; run(); })));
  const out = el("div");
  root.append(ctrl, out);
  await run();

  async function run() {
    setParams({ g, p, look, lag });
    const { ok, failed } = await D.many([g, p, ...ASSETS.map((a) => a[0])]);
    if (!ok[g] || !ok[p]) { out.replaceChildren(errorBox(`Inputs unavailable: ${[g, p].filter((x) => !ok[x]).join(", ")}`)); return; }
    const reg = S.regimes(ok[g], ok[p], { look, lag });
    const months = [...reg.keys()].sort();
    const cur = reg.get(months[months.length - 1]);
    const grid = el("div", { class: "grid3" });

    const pc = panel("Current classification", { span: 1 });
    pc.body.append(el("div", { style: "font-size:22px;color:#fff;font-weight:600", text: cur.label }), el("div", { class: "dim", text: DESC[cur.label] }),
      el("dl", { class: "kv", style: "margin-top:10px" }, el("dt", { text: "Applies to" }), el("dd", { text: F.date(months[months.length - 1] + "-01", "month") }),
        el("dt", { text: "Based on data for" }), el("dd", { text: F.date(cur.basedOn + "-01", "month") }),
        el("dt", { text: `Growth Δ${look}m` }), el("dd", { class: "num", text: `${cur.dg >= 0 ? "+" : "−"}${Math.abs(cur.dg).toFixed(2)}pp` }),
        el("dt", { text: `Inflation Δ${look}m` }), el("dd", { class: "num", text: `${cur.dp >= 0 ? "+" : "−"}${Math.abs(cur.dp).toFixed(2)}pp` })));
    grid.append(pc.root);
    const pm = panel("Method", { span: 2 });
    pm.body.append(formula(`growth↑ ⇔ ${GROWTH.find((x) => x[0] === g)[1]} today − ${look} months ago ≥ 0;  inflation↑ likewise for ${INFL.find((x) => x[0] === p)[1]}`),
      formula(`classification for observation month m is applied to month m + ${lag} (publication lag);  asset move in month M = end(M) vs end(M−1)`),
      el("p", { class: "note", text: "Using direction rather than levels avoids fitted thresholds. The lag keeps the study free of look-ahead: a month's regime uses only data that had been published before it began. Samples are small and regimes overlap with policy cycles, so treat differences as descriptive." }));
    grid.append(pm.root);

    // Stats per regime
    const rows = [];
    for (const [id, lab, kind] of ASSETS) {
      const s = ok[id];
      if (!s) { rows.push([lab, null]); continue; }
      const me = S.monthEnd(s);
      const by = Object.fromEntries(ORDER.map((r) => [r, []]));
      for (let i = 1; i < me.d.length; i++) {
        const ym = me.d[i].slice(0, 7);
        // month M must be fully observed: skip the current, still-open month
        if (i === me.d.length - 1 && ym === new Date().toISOString().slice(0, 7)) continue;
        const r = reg.get(ym); if (!r) continue;
        const a = me.v[i - 1], b = me.v[i];
        by[r.label].push(kind === "pct" ? (b / a - 1) * 100 : kind === "bp" ? (b - a) * 100 : b - a);
      }
      rows.push([lab, by, kind, s.d[0]]);
    }
    const pt = panel("Average monthly move by regime", { sub: "Mean (median) · share of months up · number of months", span: 3 });
    pt.body.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, el("th", { text: "Asset" }), ORDER.map((r) => el("th", { class: "r", text: `${r} (${DESC[r]})` })), el("th", { text: "Data from" }))),
      el("tbody", {}, rows.map(([lab, by, kind, first]) => el("tr", {}, el("td", { text: lab }),
        by ? ORDER.map((r) => { const x = by[r]; if (x.length < 3) return el("td", { class: "r dim", text: `n=${x.length}` });
          const m = S.mean(x), unit = kind === "pct" ? "%" : "bp";
          return el("td", { class: "r num" }, el("span", { class: m > 0 ? "up" : m < 0 ? "down" : "", text: `${m >= 0 ? "+" : "−"}${Math.abs(m).toFixed(kind === "pct" ? 2 : 1)}${unit}` }),
            el("span", { class: "dim", text: ` (${S.median(x).toFixed(kind === "pct" ? 2 : 1)}) · ${Math.round((x.filter((v) => v > 0).length / x.length) * 100)}% · n=${x.length}` })); })
          : el("td", { colspan: 4, class: "dim", text: "unavailable" }), el("td", { class: "dim", text: first ? F.date(first, "month") : "" })))))));
    pt.foot.append("Coverage differs by asset (for example, the S&P 500 has about 10 years on FRED), so compare within a row. ", Object.keys(failed).length ? `Unavailable: ${Object.keys(failed).join(", ")}` : "");
    grid.append(pt.root);

    // Regime spells
    const spells = [];
    months.forEach((m) => { const r = reg.get(m).label; if (spells.length && spells[spells.length - 1].r === r) spells[spells.length - 1].end = m; else spells.push({ r, start: m, end: m }); });
    const ps = panel("Recent regime spells", { span: 1 });
    ps.body.append(el("ul", { class: "list" }, spells.slice(-14).reverse().map((s) => el("li", {}, el("span", { class: "when", text: `${s.start} → ${s.end}` }), el("span", { text: s.r })))));
    grid.append(ps.root);
    const pg = panel("Inputs", { sub: "Growth and inflation measures (y/y %)", span: 2 });
    pg.body.append(timeChart([{ label: GROWTH.find((x) => x[0] === g)[1], d: ok[g].d, v: ok[g].v }, { label: INFL.find((x) => x[0] === p)[1], d: ok[p].d, v: ok[p].v }],
      { units: "%", range: "10Y", height: 240, filename: "regime_inputs" }).el);
    pg.foot.append(sourceLine([ok[g].meta, ok[p].meta]));
    grid.append(pg.root);
    out.replaceChildren(grid);
  }
}
