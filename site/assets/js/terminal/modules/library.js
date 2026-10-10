// FRED library: browse every FRED series in the watchlist (pipeline/config/series.yaml → fred_library),
// pick any combination and chart it with a transform. One chart per unit, so there is never a dual axis.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, segmented, typeBadge, statusBadge, chg, prefs, link } from "../ui.js";
import { timeChart } from "../chart.js";
import { header, seriesHref } from "./common.js";

const WINDOWS = [["1Y", 366], ["3Y", 1096], ["5Y", 1827], ["10Y", 3653], ["20Y", 7305], ["MAX", null]];
const TF = [["level", "Level"], ["chg", "Change"], ["yoy", "1-year change"], ["idx", "Rebased = 100"]];
const MAX_SEL = 8;

/** Value at or before a date (binary search). */
function asof(d, v, date) {
  let lo = 0, hi = d.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (d[mid] <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans < 0 ? null : v[ans];
}

function transform(s, tf, start) {
  const m = s.meta, pctUnits = m.units === "%";
  let d = s.d, v = s.v;
  if (tf === "chg") {
    const dd = [], vv = [];
    for (let i = 1; i < d.length; i++) { dd.push(d[i]); vv.push(m.change === "pct" ? (v[i] / v[i - 1] - 1) * 100 : (v[i] - v[i - 1]) * (pctUnits ? 100 : 1)); }
    d = dd; v = vv;
  } else if (tf === "yoy") {
    const dd = [], vv = [];
    d.forEach((x, i) => {
      const prev = asof(d, v, `${+x.slice(0, 4) - 1}${x.slice(4)}`);
      if (prev == null || (Date.parse(x) - Date.parse(d[0])) < 360 * 864e5) return;
      dd.push(x); vv.push(m.change === "pct" ? (prev ? (v[i] / prev - 1) * 100 : null) : (v[i] - prev) * (pctUnits ? 100 : 1));
    });
    d = dd; v = vv;
  }
  if (start) { const i = d.findIndex((x) => x >= start); d = i < 0 ? [] : d.slice(i); v = i < 0 ? [] : v.slice(i); }
  if (tf === "idx") { const b = v.find((x) => x != null && x !== 0); v = v.map((x) => (x == null ? null : (x / b) * 100)); }
  const units = tf === "idx" ? "index" : tf === "level" ? m.units : m.change === "pct" ? "% chg" : pctUnits ? "bp" : m.units;
  return { d, v, units };
}

export async function render(root, { params, setParams, go }) {
  const cat = await D.catalog();
  const groups = (cat.library || []).filter((g) => g.ids.length);
  root.append(header("FRED library", "The full FRED watchlist from the St. Louis Fed, grouped by theme. Select up to 8 series to chart them together. Series with different units get separate charts."));
  if (!groups.length) { root.append(errorBox("The FRED library is not in this build's catalogue.")); return; }
  let sel = (params.ids ? params.ids.split(",") : prefs.get("lib.ids", ["DFF", "SOFR", "IORB", "UST2Y"])).filter((i) => cat.series[i]);
  let tf = params.tf || "level", win = params.win || "5Y";

  const builder = panel("Chart builder", { span: 3 });
  const chartsHost = el("div");
  const selHost = el("div", { class: "chips", style: "margin-bottom:8px" });
  builder.actions.append(segmented(TF, tf, (v) => { tf = v; draw(); }, "Transform"), segmented(WINDOWS.map(([k]) => [k, k]), win, (v) => { win = v; draw(); }, "Window"));
  builder.body.append(selHost, chartsHost);
  builder.foot.append("Change = period-on-period (bp for rates, % for prices and indices). 1-year change compares with the value on or before the same date a year earlier. Rebased = 100 at the window start. Source: FRED, Federal Reserve Bank of St. Louis, unless the series says otherwise.");

  const q = el("input", { type: "text", placeholder: "Search by name or FRED ID (e.g. SOFR, payrolls, DGS10)", "aria-label": "Search series", style: "width:min(420px,100%)" });
  const listHost = el("div");
  const browse = panel("Series", { span: 3 });
  browse.actions.append(q);
  browse.body.append(listHost);
  const grid = el("div", { class: "grid3" }, builder.root, browse.root);
  root.append(grid);

  function drawSel() {
    selHost.replaceChildren(...(sel.length ? sel.map((id) => el("button", { type: "button", class: "chip", "aria-pressed": "true", title: "Remove",
      text: `${cat.series[id].name} ×`, onclick: () => toggle(id) })) : [el("span", { class: "dim", text: "Nothing selected: tick series below." })]));
  }
  function toggle(id) {
    if (sel.includes(id)) sel = sel.filter((x) => x !== id);
    else if (sel.length < MAX_SEL) sel = [...sel, id];
    prefs.set("lib.ids", sel);
    drawList(); draw();
  }
  async function draw() {
    setParams({ ids: sel.join(","), tf, win });
    drawSel();
    if (!sel.length) { chartsHost.replaceChildren(); return; }
    chartsHost.replaceChildren(el("div", { class: "loading", text: "Loading…" }));
    const { ok, failed } = await D.many(sel);
    const lastDate = Object.values(ok).map((s) => s.d[s.d.length - 1]).sort().pop();
    const days = WINDOWS.find((w) => w[0] === win)[1];
    const start = days && lastDate ? new Date(Date.parse(lastDate) - days * 864e5).toISOString().slice(0, 10) : null;
    const byUnits = new Map();
    sel.filter((id) => ok[id]).forEach((id) => {
      const t = transform(ok[id], tf, start);
      if (!byUnits.has(t.units)) byUnits.set(t.units, []);
      byUnits.get(t.units).push({ id, label: ok[id].meta.name, d: t.d, v: t.v, step: ok[id].meta.type === "administered" });
    });
    const nodes = [...byUnits.entries()].map(([u, ser]) => el("div", { style: "margin-bottom:14px" },
      el("div", { class: "p-sub", text: `Units: ${u || "—"}` }),
      timeChart(ser, { units: u === "% chg" ? "%" : u, range: "MAX", ranges: false, height: byUnits.size > 1 ? 220 : 300, filename: ser.map((s) => s.id).join("_") }).el));
    if (Object.keys(failed).length) nodes.push(el("p", { class: "note", text: `Unavailable: ${Object.entries(failed).map(([k, m]) => `${k} (${m})`).join("; ")}` }));
    chartsHost.replaceChildren(...nodes);
  }
  function drawList() {
    const term = q.value.trim().toLowerCase();
    const rows = [];
    for (const g of groups) {
      const ids = g.ids.filter((id) => { const m = cat.series[id]; return m && (!term || `${m.name} ${m.provider_key} ${id}`.toLowerCase().includes(term)); });
      if (!ids.length) continue;
      rows.push(el("tr", { class: "group" }, el("td", { colspan: 8, text: `${g.group} (${ids.length})` })));
      for (const id of ids) {
        const m = cat.series[id], L = m.latest;
        const box = el("input", { type: "checkbox", "aria-label": `Select ${m.name}`, onchange: () => toggle(id) });
        box.checked = sel.includes(id);
        if (!L) box.disabled = true;
        rows.push(el("tr", {}, el("td", {}, box), el("td", { class: "nm", title: m.name }, typeBadge(m), " ", m.name, " ", statusBadge(m)),
          el("td", { class: "dim" }, m.source_url ? link(m.source_url, m.provider_key, true) : m.provider_key),
          el("td", { class: "r num", text: L ? F.value(L.value, m.units) : "—" }),
          el("td", { class: "r" }, L ? chg(L.chg["1obs"], m.change, m.units) : "—"),
          el("td", { class: "dim", text: L ? F.obsDate(L.date, m.freq) : m.status }),
          el("td", { class: "dim", text: F.FREQ[m.freq] || m.freq || "" }),
          el("td", {}, L ? el("a", { href: seriesHref(id), text: "detail →" }) : "")));
      }
    }
    listHost.replaceChildren(el("div", { class: "tbl-wrap", style: "max-height:70vh;overflow:auto" }, el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ["", "Series", "FRED ID", "Last", "Δ prior", "As of", "Freq", ""].map((h, k) => el("th", { class: k === 3 || k === 4 ? "r" : "", text: h })))),
      el("tbody", {}, rows))));
  }
  let t = null;
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(drawList, 150); });
  drawList();
  await draw();
}
