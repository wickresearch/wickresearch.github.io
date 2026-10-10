// Shared building blocks for terminal modules.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, typeBadge, statusBadge, chg, table, sourceLine } from "../ui.js";
import { timeChart } from "../chart.js";

export const seriesHref = (id) => `#series/${id}`;

/** Compact KPI tile linked to the series view. */
export function tile(cat, id, label, { horizon = "1obs" } = {}) {
  const m = cat.series[id];
  if (!m || !m.latest) {
    return el("div", { class: "kpi", title: m ? `${m.name}: ${m.status}` : id },
      el("div", { class: "k", text: label || id }), el("div", { class: "v dim", text: "n/a" }), el("div", { class: "s", text: m ? m.status : "not configured" }));
  }
  const L = m.latest;
  return el("a", { class: "kpi", href: seriesHref(id), title: `${m.name} · ${m.type_label || ""} · ${m.provider_name}` },
    el("div", { class: "k" }, label || m.name, statusBadge(m)),
    el("div", { class: "v num", text: F.value(L.value, m.units) }),
    el("div", { class: "s", title: horizon === "1obs" ? "Change vs the previous observation" : horizon }, chg(L.chg[horizon], m.change, m.units), " · ", F.obsDate(L.date, m.freq)));
}
export function tiles(cat, list) { return el("div", { class: "kpis" }, list.map(([id, label]) => tile(cat, id, label))); }

/** Position of the latest value within its 52-week range. */
export function rangeBar(L) {
  if (!L || L.hi52 == null || L.hi52 === L.lo52) return el("span", { class: "dim", text: "—" });
  const p = ((L.value - L.lo52) / (L.hi52 - L.lo52)) * 100;
  return el("span", { class: "rangebar", title: `52w low ${L.lo52} · high ${L.hi52}` }, el("i", { style: `left:calc(${p}% - 1px)` }));
}

/** Standard market table for a list of catalogue ids (with optional group rows). */
export function seriesTable(cat, groups, { go, cols = ["1obs", "1w", "1m", "ytd", "1y"] } = {}) {
  const labels = { "1obs": "1D / prior", "1w": "1W", "1m": "1M", "3m": "3M", ytd: "YTD", "1y": "1Y" };
  const tbody = el("tbody");
  for (const [gname, ids] of groups) {
    if (gname) tbody.append(el("tr", { class: "group" }, el("td", { colspan: 6 + cols.length, text: gname })));
    for (const id of ids) {
      const m = cat.series[id];
      if (!m) continue;
      const L = m.latest;
      const tr = el("tr", { class: L ? "click" : "", tabindex: L ? "0" : null },
        el("td", { class: "nm", title: m.name }, typeBadge(m), " ", m.name, " ", statusBadge(m)),
        el("td", { class: "r num", text: L ? F.value(L.value, m.units) : "—" }),
        cols.map((h) => el("td", { class: "r" }, L ? chg(L.chg[h], m.change, m.units) : "—")),
        el("td", { class: "r num", text: L && L.pct5y != null ? L.pct5y.toFixed(0) : "—", title: "Percentile of the latest value within the last 5 years" }),
        el("td", {}, rangeBar(L)),
        el("td", { class: "dim", text: L ? F.obsDate(L.date, m.freq) : m.status }),
        el("td", { class: "dim", text: m.provider_name?.replace(/,.*$/, "") || "" }));
      if (L && go) { tr.addEventListener("click", () => go(seriesHref(id))); tr.addEventListener("keydown", (e) => e.key === "Enter" && go(seriesHref(id))); }
      tbody.append(tr);
    }
  }
  return el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" },
    el("thead", {}, el("tr", {}, el("th", { text: "Instrument / series" }), el("th", { class: "r", text: "Last" }),
      cols.map((h) => el("th", { class: "r", text: labels[h] })), el("th", { class: "r", text: "5y pct", title: "5-year percentile" }),
      el("th", { text: "52w range" }), el("th", { text: "As of" }), el("th", { text: "Source" }))), tbody));
}

/** Panel with a multi-series time chart loaded by ids. Failed series are listed, not hidden. */
export async function chartPanel(title, ids, { sub, span = 1, units, range = "1Y", height = 240, labels = {}, steps = [], band, recessions, note, filename } = {}) {
  const p = panel(title, { sub, span });
  const { ok, failed } = await D.many(ids);
  const avail = ids.filter((id) => ok[id]);
  if (!avail.length) { p.body.append(errorBox(Object.values(failed).join("; ") || "No data.")); return p.root; }
  const u = units || ok[avail[0]].meta.units;
  const ch = timeChart(avail.map((id) => ({ id, label: labels[id] || ok[id].meta.name, d: ok[id].d, v: ok[id].v, step: steps.includes(id) || ok[id].meta.step })),
    { units: u, range, height, band, recessions, filename: filename || title });
  p.body.append(ch.el);
  if (Object.keys(failed).length) p.body.append(el("p", { class: "note", text: `Not shown (unavailable): ${Object.keys(failed).join(", ")}` }));
  if (note) p.body.append(el("p", { class: "note", text: note }));
  p.foot.append(sourceLine(avail.map((id) => ok[id].meta)));
  return p.root;
}

export function formula(text) { return el("div", { class: "formula", text }); }

export function header(title, sub, ctrls) {
  return el("div", { class: "page-head" }, el("div", {}, el("h1", { text: title }), sub ? el("div", { class: "sub", text: sub }) : null),
    ctrls ? el("div", { class: "ctrls" }, ctrls) : null);
}
