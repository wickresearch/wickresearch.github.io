// Inflation, labour and activity: release table (observation period vs publication), transforms, cycle charts with recessions.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, segmented, select, typeBadge, statusBadge, sourceLine } from "../ui.js";
import { timeChart, recessionPeriods } from "../chart.js";
import { header, seriesHref } from "./common.js";

// [id, label, transform shown in table]
const ROWS = [
  ["Inflation", [["CPI", "CPI (headline)", "index"], ["CORE_CPI", "Core CPI", "index"], ["CPI_SERVICES", "CPI services", "index"], ["CPI_SHELTER", "CPI shelter", "index"],
    ["PCE", "PCE prices", "index"], ["CORE_PCE", "Core PCE prices", "index"], ["PPI", "PPI final demand", "index"]]],
  ["Labour", [["PAYROLLS", "Nonfarm payrolls", "level_k"], ["UNRATE", "Unemployment rate", "rate"], ["AHE", "Avg hourly earnings", "index"], ["PARTICIPATION", "Participation rate", "rate"],
    ["CLAIMS", "Initial claims (weekly)", "weekly"], ["CONT_CLAIMS", "Continuing claims", "weekly"], ["JOLTS_OPENINGS", "JOLTS openings", "level_k"], ["JOLTS_QUITS", "JOLTS quits rate", "rate"]]],
  ["Activity & sentiment", [["INDPRO", "Industrial production", "index"], ["RETAIL", "Retail sales ex food services", "index"], ["HOUSING_STARTS", "Housing starts", "index"],
    ["PERMITS", "Building permits", "index"], ["UMICH", "UMich sentiment", "rate"], ["PHILLY_FED", "Philly Fed mfg activity", "rate"], ["REAL_GDP", "Real GDP", "gdp"], ["GDPNOW", "GDPNow (estimate)", "rate"]]],
];

// % change vs the observation exactly `lag` calendar months earlier (looked up by month key, so it works
// for monthly and quarterly series and never bridges a gap).
const _mk = new WeakMap();
function pctChange(s, i, lag) {
  if (i < 0) return null;
  if (!_mk.has(s)) _mk.set(s, new Map(s.d.map((d, k) => [d.slice(0, 7), s.v[k]])));
  const prev = _mk.get(s).get(shiftM(s.d[i], -lag));
  return prev == null || prev === 0 ? null : (s.v[i] / prev - 1) * 100;
}
function shiftM(d, n) { const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n; const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; return `${yy}-${String(mm + 1).padStart(2, "0")}`; }

function transformed(s, t) {
  const d = [], v = [];
  s.d.forEach((dt, i) => {
    let x = null;
    if (t === "level") x = s.v[i];
    else if (t === "yoy") x = pctChange(s, i, 12);
    else if (t === "mom") x = pctChange(s, i, 1);
    else if (t === "ann3m") { const r = pctChange(s, i, 3); x = r == null ? null : (Math.pow(1 + r / 100, 4) - 1) * 100; }
    else if (t === "diff") x = i ? s.v[i] - s.v[i - 1] : null;
    if (x != null) { d.push(dt); v.push(x); }
  });
  return { d, v };
}

export async function render(root, { params, setParams, go }) {
  const cat = await D.catalog();
  root.append(header("Inflation & labour", "Official US releases. 'Period' is the month the data describe; 'Published' is when the provider last updated the series."));
  const ids = ROWS.flatMap(([, r]) => r.map((x) => x[0]));
  const { ok } = await D.many([...ids, "USREC"]);
  const rec = ok.USREC ? recessionPeriods(ok.USREC) : [];

  const pt = panel("Latest releases", { span: 3 });
  const tbody = el("tbody");
  for (const [g, rows] of ROWS) {
    tbody.append(el("tr", { class: "group" }, el("td", { colspan: 8, text: g })));
    for (const [id, label, kind] of rows) {
      const s = ok[id], m = cat.series[id];
      if (!s) { tbody.append(el("tr", {}, el("td", { text: label }), el("td", { colspan: 7, class: "dim", text: m ? m.status : "n/a" }))); continue; }
      const n = s.v.length - 1, M = s.meta;
      let a = "—", b = "—", c = "—", lev = F.value(s.v[n], M.units);
      if (kind === "index" || kind === "gdp") {
        const lag = kind === "gdp" ? 3 : 1; // GDP is quarterly: q/q = 3 calendar months
        const y = pctChange(s, n, 12), mm = pctChange(s, n, lag), mp = pctChange(s, n - 1, lag), a3 = pctChange(s, n, 3);
        a = y == null ? "—" : F.num(y, 1) + "%"; b = mm == null ? "—" : `${F.num(mm, kind === "gdp" ? 1 : 2)}%${kind === "gdp" ? " q/q" : ""}`;
        c = kind === "gdp" ? (mm == null ? "—" : F.num((Math.pow(1 + mm / 100, 4) - 1) * 100, 1) + "% saar") : a3 == null ? "—" : F.num((Math.pow(1 + a3 / 100, 4) - 1) * 100, 1) + "%";
        if (mp != null && kind !== "gdp") b += ` (prior ${F.num(mp, 2)}%)`;
      } else if (kind === "level_k") {
        const d1 = s.v[n] - s.v[n - 1], d0 = s.v[n - 1] - s.v[n - 2];
        a = `${d1 >= 0 ? "+" : "−"}${Math.abs(d1).toFixed(0)}k`; b = `prior ${d0 >= 0 ? "+" : "−"}${Math.abs(d0).toFixed(0)}k`;
        const a3 = (s.v[n] - s.v[n - 3]) / 3; c = `3m avg ${a3 >= 0 ? "+" : "−"}${Math.abs(a3).toFixed(0)}k`;
      } else if ((kind === "rate" || kind === "weekly") && n >= 1) {
        const d1 = s.v[n] - s.v[n - 1];
        a = `${d1 >= 0 ? "+" : "−"}${Math.abs(d1).toFixed(kind === "weekly" ? 0 : 1)}${kind === "weekly" ? "k" : ""}`; b = `prior ${F.value(s.v[n - 1], M.units)}`;
        if (kind === "weekly" && n >= 3) c = `4wk avg ${F.num((s.v[n] + s.v[n - 1] + s.v[n - 2] + s.v[n - 3]) / 4, 0)}k`;
      }
      const tr = el("tr", { class: "click", tabindex: "0", onclick: () => go(seriesHref(id)) },
        el("td", { class: "nm" }, typeBadge(M), " ", label, " ", statusBadge(M)), el("td", { class: "num", text: F.obsDate(s.d[n], M.freq) }),
        el("td", { class: "r num", text: lev }), el("td", { class: "r num", text: kind === "index" || kind === "gdp" ? a : a }),
        el("td", { class: "r num", text: b }), el("td", { class: "r num", text: c }),
        el("td", { class: "dim", text: M.provider_meta?.last_updated ? M.provider_meta.last_updated.slice(0, 10) : "—" }), el("td", { class: "dim", text: M.units }));
      tbody.append(tr);
    }
  }
  pt.body.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" }, el("thead", {}, el("tr", {},
    ["Series", "Period", "Level", "y/y · change", "m/m · prior", "3m ann. · avg", "Published", "Units"].map((h, k) => el("th", { class: k >= 2 && k <= 5 ? "r" : "", text: h })))), tbody)));
  pt.foot.append("y/y and 3m annualised use exact calendar-month matches; gaps are left blank, never interpolated. SA = seasonally adjusted where the source is. GDPNow is a model nowcast (Atlanta Fed), not an official release.");
  root.append(pt.root);

  // Configurable chart
  const grid = el("div", { class: "grid3" });
  root.append(grid);
  const opts = ids.filter((i) => ok[i]).map((i) => [i, ok[i].meta.name]);
  const pc = panel("Chart a release", { sub: "Choose a series and transform. Shaded areas are NBER recessions.", span: 3 });
  grid.append(pc.root);
  const host = el("div");
  let sel = params.s || "CORE_PCE", tf = params.t || "yoy";
  const draw = () => {
    const s = ok[sel];
    if (!s) { host.replaceChildren(errorBox(`${sel} unavailable`)); return; }
    const t = transformed(s, tf);
    const units = tf === "level" ? s.meta.units : tf === "diff" ? s.meta.units : "%";
    host.replaceChildren(timeChart([{ id: sel, label: `${s.meta.name} – ${{ level: "level", yoy: "y/y %", mom: "m/m %", ann3m: "3m annualised %", diff: "change" }[tf]}`, ...t }],
      { units, range: params.range || "10Y", height: 300, recessions: rec, filename: `${sel}_${tf}`, onRange: (r) => setParams({ range: r }) }).el);
    pc.foot.replaceChildren(sourceLine([s.meta]));
    setParams({ s: sel, t: tf });
  };
  pc.actions.append(select(opts, sel, (v) => { sel = v; draw(); }, "Series"),
    segmented([["level", "Level"], ["yoy", "y/y"], ["mom", "m/m"], ["ann3m", "3m ann."], ["diff", "Δ"]], tf, (v) => { tf = v; draw(); }, "Transform"));
  pc.body.append(host); draw();

  // Fixed comparison charts
  const mk = (title, list, sub, units = "%") => {
    const p = panel(title, { sub, span: 1 });
    const ser = list.filter(([id]) => ok[id] || cat.series[id]).map(([id, tf2, lab]) => ({ id, tf2, lab }));
    Promise.all(ser.map(async (x) => ({ ...x, s: ok[x.id] || (await D.series(x.id).catch(() => null)) }))).then((rs) => {
      const avail = rs.filter((r) => r.s);
      if (!avail.length) { p.body.append(errorBox("Unavailable")); return; }
      p.body.append(timeChart(avail.map((r) => ({ label: r.lab, ...(r.tf2 ? transformed(r.s, r.tf2) : { d: r.s.d, v: r.s.v }) })), { units, range: "10Y", height: 230, recessions: rec, filename: title }).el);
      p.foot.append(sourceLine(avail.map((r) => r.s.meta)));
    });
    return p.root;
  };
  grid.append(mk("Inflation: headline vs core", [["CPI", "yoy", "CPI y/y"], ["CORE_CPI", "yoy", "Core CPI y/y"], ["CORE_PCE", "yoy", "Core PCE y/y"]], "y/y %"));
  grid.append(mk("Core momentum", [["CORE_CPI", "ann3m", "Core CPI 3m ann."], ["CORE_PCE", "ann3m", "Core PCE 3m ann."]], "3-month annualised %"));
  grid.append(mk("Wages vs services inflation", [["AHE", "yoy", "AHE y/y"], ["CPI_SERVICES", "yoy", "CPI services y/y"]], "y/y %"));
  grid.append(mk("Unemployment rate", [["UNRATE", null, "Unemployment rate"]], "%"));
  grid.append(mk("Payroll growth", [["PAYROLLS", "diff", "Monthly change"]], "thousands", "thousands"));
  grid.append(mk("Initial jobless claims", [["CLAIMS", null, "Initial claims"]], "thousands, weekly", "thousands"));
}
