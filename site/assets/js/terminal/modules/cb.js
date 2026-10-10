// Central banks: policy-rate history, last moves, real policy rates, meeting schedule, official headlines and sources.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, link, sourceLine } from "../ui.js";
import { timeChart } from "../chart.js";
import { alignInner } from "../stats.js";
import { header, seriesHref, formula } from "./common.js";

const SOURCES = {
  Fed: ["https://www.federalreserve.gov/monetarypolicy.htm", "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"],
  ECB: ["https://www.ecb.europa.eu/mopo/html/index.en.html", "https://www.ecb.europa.eu/press/govcdec/mopo/html/index.en.html"],
  BoE: ["https://www.bankofengland.co.uk/monetary-policy", "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/monetary-policy-summary-and-minutes"],
  BoJ: ["https://www.boj.or.jp/en/mopo/index.htm", "https://www.boj.or.jp/en/mopo/mpmdeci/index.htm"],
  BoC: ["https://www.bankofcanada.ca/core-functions/monetary-policy/", "https://www.bankofcanada.ca/rates/interest-rates/key-interest-rate/"],
  SNB: ["https://www.snb.ch/en/the-snb/mandates-goals/monetary-policy", null],
  RBA: ["https://www.rba.gov.au/monetary-policy/", "https://www.rba.gov.au/monetary-policy/int-rate-decisions/"],
};

export async function render(root, { go }) {
  const cat = await D.catalog();
  root.append(header("Central banks", "Policy settings from the BIS central-bank policy-rate database, meeting dates from official calendars, and links to each bank's statements and minutes."));
  const ids = Object.keys(cat.series).filter((k) => k.startsWith("POL_"));
  const { ok, failed } = await D.many(ids);
  let cal = null; try { cal = await D.json("calendar.json"); } catch { /* optional */ }
  let news = null; try { news = await D.json("news.json"); } catch { /* optional */ }
  const today = new Date().toISOString().slice(0, 10);

  const grid = el("div", { class: "grid3" });
  root.append(grid);
  const pt = panel("Policy rates", { sub: "Current level, most recent decision that changed the rate, cumulative change over 12 months, next meeting", span: 3 });
  grid.append(pt.root);
  const rows = ids.map((id) => {
    const m = cat.series[id], s = ok[id];
    if (!s) return el("tr", {}, el("td", { text: m.bank }), el("td", { colspan: 7, class: "dim", text: failed[id] || "unavailable" }));
    const n = s.v.length - 1;
    let i = n; while (i > 0 && s.v[i - 1] === s.v[i]) i--;
    const mv = i > 0 ? (s.v[i] - s.v[i - 1]) * 100 : null;
    const yearAgo = new Date(Date.parse(s.d[n]) - 365 * 864e5).toISOString().slice(0, 10);
    let j = n; while (j > 0 && s.d[j] > yearAgo) j--;
    const c12 = (s.v[n] - s.v[j]) * 100;
    const bankKey = m.bank;
    const next = cal?.meetings?.[bankKey]?.dates.find((d) => d >= today);
    const [src, dec] = SOURCES[bankKey] || [];
    return el("tr", { class: "click", tabindex: "0", onclick: (e) => { if (e.target.tagName !== "A") go(seriesHref(id)); } },
      el("td", {}, el("strong", { text: bankKey }), el("span", { class: "dim", text: " " + m.name.replace(/^.*? (–|\()/, "").replace(/\)$/, "") })),
      el("td", { class: "r num", text: F.value(s.v[n], "%") }),
      el("td", { class: `r num ${mv > 0 ? "up" : mv < 0 ? "down" : ""}`, text: mv == null ? "—" : `${mv > 0 ? "+" : "−"}${Math.abs(mv).toFixed(0)}bp` }),
      el("td", { class: "dim", text: i > 0 ? F.date(s.d[i], "long") : "—" }),
      el("td", { class: `r num ${c12 > 0 ? "up" : c12 < 0 ? "down" : ""}`, text: `${c12 > 0 ? "+" : c12 < 0 ? "−" : "±"}${Math.abs(c12).toFixed(0)}bp` }),
      el("td", { class: "num", text: next ? F.date(next, "long") : "—" }),
      el("td", {}, src ? link(src, "Policy", true) : "", dec ? [" · ", link(dec, "Decisions", true)] : ""));
  });
  pt.body.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" }, el("thead", {}, el("tr", {}, ["Bank", "Rate", "Last move", "Move effective", "12m change", "Next decision", "Official sources"]
    .map((h, k) => el("th", { class: [1, 2, 4].includes(k) ? "r" : "", text: h })))), el("tbody", {}, rows))));
  pt.foot.append("BIS: Fed = midpoint of the target range; ECB = deposit facility rate. Dates are effective dates (the ECB's take effect the following week). BIS can lag announcements by several days. Meeting dates for the SNB and RBA are not tracked.");

  const avail = ids.filter((id) => ok[id]);
  const ph = panel("Policy-rate paths", { sub: "Step series; each step is a decision that changed the rate", span: 2 });
  ph.body.append(timeChart(avail.map((id) => ({ id, label: cat.series[id].bank, d: ok[id].d, v: ok[id].v, step: true })), { units: "%", range: "5Y", height: 300, filename: "policy_rates" }).el);
  ph.foot.append(sourceLine(avail.map((id) => ok[id].meta)));
  grid.append(ph.root);

  // Real policy rates (ex-post): policy rate minus latest core/headline inflation y/y
  const pr = panel("Real policy rate (ex-post)", { sub: "Policy rate minus trailing inflation y/y, monthly", span: 1 });
  grid.append(pr.root);
  try {
    const pairs = [["POL_US", "CORE_PCE_YOY", "Fed − core PCE"], ["POL_XM", "EA_HICP_YOY", "ECB DFR − euro HICP"]];
    const series = [];
    for (const [a, b, lab] of pairs) {
      const [sa, sb] = await Promise.all([D.series(a), D.series(b)]);
      // as-of policy rate on each inflation observation month-end (no look-ahead in the rate; inflation published with a lag)
      const d = [], v = [];
      sb.d.forEach((dt, k) => {
        const monthEnd = new Date(Date.UTC(+dt.slice(0, 4), +dt.slice(5, 7), 0)).toISOString().slice(0, 10);
        let i = sa.d.length - 1; while (i > 0 && sa.d[i] > monthEnd) i--;
        if (sa.d[i] <= monthEnd) { d.push(dt); v.push(sa.v[i] - sb.v[k]); }
      });
      series.push({ label: lab, d, v });
    }
    pr.body.append(timeChart(series, { units: "%", range: "10Y", height: 260, filename: "real_policy_rates" }).el);
    pr.body.append(formula("real rate(m) = policy rate at end of month m − inflation y/y for month m"));
    pr.foot.append("Ex-post (backward-looking) measure. Inflation for month m is published 2–6 weeks after month-end.");
  } catch (e) { pr.body.append(errorBox(e.message)); }

  const pn = panel("Latest official communications", { span: 3 });
  grid.append(pn.root);
  if (news) {
    const banks = ["Fed", "ECB", "BoE", "BoJ"];
    pn.body.append(el("div", { class: "grid3", style: "grid-template-columns:repeat(auto-fit,minmax(240px,1fr))" }, banks.map((b) => el("div", {},
      el("h3", { style: "font-size:13px;margin:0 0 6px", text: b }),
      el("ul", { class: "list" }, news.items.filter((n) => n.bank === b).slice(0, 6).map((n) => el("li", {}, el("span", { class: "when", text: F.date(n.date) }), link(n.url, n.title, true))))))));
    pn.foot.append("From official RSS feeds; headlines and links only. Statements, minutes and speeches are on each bank's site (links in the table above).");
  } else pn.body.append(errorBox("News feed unavailable."));
}
