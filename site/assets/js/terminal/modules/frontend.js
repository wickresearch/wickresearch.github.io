// Front end & Fed: the policy corridor, overnight rates, T-bill forward proxy, SEP medians and FOMC dates.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, sourceLine, typeBadge, link } from "../ui.js";
import { timeChart, xyChart } from "../chart.js";
import { billForwards } from "../stats.js";
import { header, tiles, chartPanel, formula, seriesTable } from "./common.js";

export async function render(root, { go }) {
  const cat = await D.catalog();
  root.append(header("Front end & Fed", "Administered rates set the corridor; overnight market rates trade inside it; Treasury bills and coupons add expectations and term premia."));
  root.append(tiles(cat, [["FF_UPPER", "Target upper"], ["FF_LOWER", "Target lower"], ["IORB", "IORB"], ["ONRRP_RATE", "ON RRP rate"], ["EFFR", "EFFR"], ["SOFR", "SOFR"],
    ["TGCR", "TGCR"], ["UST3M", "3M bill (CMT)"], ["UST2Y", "2Y"], ["US2Y_EFFR", "2Y − EFFR"]]));
  const grid = el("div", { class: "grid3" });
  root.append(grid);

  // Corridor
  const pc = panel("Policy corridor and overnight rates", { sub: "Target range (shaded), IORB, ON RRP, EFFR and SOFR", span: 2 });
  grid.append(pc.root);
  const ids = ["FF_LOWER", "FF_UPPER", "IORB", "ONRRP_RATE", "EFFR", "SOFR"];
  const { ok, failed } = await D.many(ids);
  const avail = ids.filter((i) => ok[i]);
  if (avail.length) {
    const lab = { FF_LOWER: "Target lower", FF_UPPER: "Target upper", IORB: "IORB", ONRRP_RATE: "ON RRP rate", EFFR: "EFFR", SOFR: "SOFR" };
    const hasBand = ok.FF_LOWER && ok.FF_UPPER;
    pc.body.append(timeChart(avail.map((id) => ({ id, label: lab[id], d: ok[id].d, v: ok[id].v, step: ["FF_LOWER", "FF_UPPER", "IORB", "ONRRP_RATE"].includes(id),
      dash: ["FF_LOWER", "FF_UPPER"].includes(id) ? [3, 3] : undefined, width: ["FF_LOWER", "FF_UPPER"].includes(id) ? 1 : 2 })),
    { units: "%", range: "1Y", height: 280, band: hasBand ? [0, 1] : undefined, filename: "fed_corridor" }).el);
    if (Object.keys(failed).length) pc.body.append(el("p", { class: "note", text: `Unavailable: ${Object.keys(failed).join(", ")}` }));
    pc.foot.append(sourceLine(avail.map((i) => ok[i].meta)), " · IORB is published ahead of its effective date, so it can show a future date.");
  } else pc.body.append(errorBox("Front-end rates unavailable."));

  // Rate taxonomy table
  const pt = panel("What each rate is", { span: 1 });
  grid.append(pt.root);
  const rows = [["FF_UPPER", "Set by the FOMC. The policy target."], ["IORB", "Paid on bank reserves. Anchors the top of the corridor."],
    ["ONRRP_RATE", "Paid to money funds and others at the Fed's facility. Acts as a floor."], ["EFFR", "Volume-weighted median of overnight unsecured fed funds trades."],
    ["SOFR", "Overnight Treasury repo (broad). The reference rate for SOFR futures and swaps."], ["TGCR", "Tri-party general collateral repo."],
    ["UST3M", "3-month Treasury bill yield. Includes expected policy over 3 months plus bill supply and demand."]];
  pt.body.append(el("dl", { class: "defs" }, rows.flatMap(([id, d]) => {
    const m = cat.series[id];
    return [el("dt", {}, m ? typeBadge(m) : "", " ", m ? m.name.replace(/\s*\(.*\)/, "") : id), el("dd", { text: d })];
  })));
  pt.foot.append("ADM = administered · O/N = overnight market rate · EOD = end-of-day yield. Futures-implied rates are not available from free sources.");

  // T-bill forward proxy
  const pf = panel("Front-end pricing proxy: T-bill forward rates", { sub: "Forward rates implied by the bill curve, compared with EFFR", span: 2 });
  grid.append(pf.root);
  try {
    const c = await D.curve("US");
    const n = c.d.length - 1, last = c.d[n];
    const idxAt = (t) => { let i = n; while (i > 0 && c.d[i] > t) i--; return i; };
    const row = (i) => Object.fromEntries(c.tenors.map((t, j) => [t, c.y[i][j]]));
    const cal = await D.json("calendar.json").catch(() => null);
    const lastFomc = cal?.meetings?.Fed?.dates.filter((d) => d < last).pop();
    const picks = [[n, "Latest"], [idxAt(new Date(Date.parse(last) - 30 * 864e5).toISOString().slice(0, 10)), "1M ago"]];
    if (lastFomc) picks.push([idxAt(new Date(Date.parse(lastFomc) - 864e5).toISOString().slice(0, 10)), `Day before FOMC ${F.date(lastFomc)}`]);
    const fw = picks.map(([i, lab]) => ({ lab: `${lab} (${F.date(c.d[i])})`, f: billForwards(row(i)) }));
    const effr = ok.EFFR ? ok.EFFR.v[ok.EFFR.v.length - 1] : null;
    const xs = fw[0].f.map((x) => +(x.mid * 12).toFixed(2));
    const series = fw.map((x, k) => ({ label: x.lab, v: x.f.map((p) => p.fwd), dash: k ? [4, 4] : undefined }));
    if (effr != null) series.push({ label: `EFFR now (${F.value(effr, "%")})`, v: xs.map(() => effr), color: "#8A9AAD", width: 1, dash: [2, 3] });
    pf.body.append(xyChart(xs, series, { height: 240, xLabel: "Horizon, months (segment mid-point)", yUnits: "" }).el);
    pf.body.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, el("th", { text: "Segment" }), fw.map((x) => el("th", { class: "r", text: x.lab.split(" (")[0] })), el("th", { class: "r", text: "Latest − EFFR" }))),
      el("tbody", {}, fw[0].f.map((seg, k) => el("tr", {}, el("td", { text: `${seg.from} → ${seg.to}` }),
        fw.map((x) => el("td", { class: "r num", text: x.f[k] ? x.f[k].fwd.toFixed(2) + "%" : "—" })),
        el("td", { class: "r num", text: effr == null ? "—" : `${((seg.fwd - effr) * 100).toFixed(0)}bp` })))))));
    pf.body.append(formula("f(t₁,t₂) = [(1 + y₂·t₂)/(1 + y₁·t₁) − 1] / (t₂ − t₁)   with bill par yields y (simple-rate approximation)"));
    pf.foot.append("Proxy only. Bill yields include supply, demand and term-premium effects and are not OIS- or futures-implied rates. No meeting probabilities are derived. Source: U.S. Treasury par curve.");
  } catch (e) { pf.body.append(errorBox(e.message)); }

  // SEP medians + FOMC dates
  const ps = panel("FOMC: dot-plot median and meetings", { span: 1 });
  grid.append(ps.root);
  try {
    const sep = await D.series("SEP_FF_MEDIAN");
    ps.body.append(el("table", { class: "tbl" }, el("thead", {}, el("tr", {}, el("th", { text: "Year-end" }), el("th", { class: "r", text: "Median fed funds" }))),
      el("tbody", {}, sep.d.map((d, i) => el("tr", {}, el("td", { text: d.slice(0, 4) }), el("td", { class: "r num", text: F.value(sep.v[i], "%") }))))));
    ps.body.append(el("p", { class: "note", text: `Latest Summary of Economic Projections, published ${sep.meta.provider_meta?.last_updated?.slice(0, 10) || "—"}. These are participants' projections (midpoint of the target range), not market pricing.` }));
  } catch (e) { ps.body.append(errorBox(e.message)); }
  try {
    const cal = await D.json("calendar.json");
    const today = new Date().toISOString().slice(0, 10);
    const next = cal.meetings.Fed.dates.filter((d) => d >= today).slice(0, 5);
    ps.body.append(el("h3", { style: "font-size:13px;margin:12px 0 4px", text: "Next FOMC decisions" }), el("div", { class: "num", text: next.map((d) => F.date(d, "long")).join(" · ") }),
      el("div", { class: "note" }, link(cal.meetings.Fed.source, "federalreserve.gov calendar", true)));
  } catch { /* calendar optional here */ }

  grid.append(await chartPanel("Fed funds: the long view", ["DFF", "DFEDTAR", "FF_UPPER", "FF_LOWER"], { units: "%", range: "MAX", span: 3, height: 280,
    sub: "Effective fed funds rate since 1954, with the single target (1982–2008) and the target range (from Dec 2008)",
    labels: { DFF: "Effective fed funds (daily)", DFEDTAR: "Target (to 2008)", FF_UPPER: "Target range upper", FF_LOWER: "Target range lower" },
    steps: ["DFEDTAR", "FF_UPPER", "FF_LOWER"], note: "Source: FRED (DFF, DFEDTAR, DFEDTARU/L). Use the range buttons or drag to zoom into any cycle." }));
  grid.append(await chartPanel("2Y Treasury minus EFFR", ["US2Y_EFFR"], { units: "bp", range: "5Y", span: 2, sub: "A rough gauge of the net easing (<0) or tightening (>0) priced over two years",
    note: "Includes term premium. Use it for direction and changes, not as an implied number of cuts." }));
  grid.append(await chartPanel("SOFR distribution", ["SOFR_P1", "SOFR", "SOFR_P99"], { units: "%", range: "1Y", span: 1, sub: "1st, median and 99th percentile (NY Fed)",
    labels: { SOFR_P1: "1st pct", SOFR: "SOFR (median)", SOFR_P99: "99th pct" } }));
  const tbl = panel("Front-end series", { span: 3 });
  tbl.body.append(seriesTable(cat, [["", ["FF_UPPER", "FF_LOWER", "IORB", "ONRRP_RATE", "EFFR", "OBFR", "SOFR", "TGCR", "SOFR_P99", "SOFR_VOL", "UST3M", "UST2Y", "US2Y_EFFR"]]], { go }));
  grid.append(tbl.root);
}
