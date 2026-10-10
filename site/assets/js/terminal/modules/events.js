// Event studies: how instruments behaved around FOMC decisions, CPI and payrolls releases and policy-rate changes.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, select, multiSelect, numberInput, downloadCSV } from "../ui.js";
import { xyChart } from "../chart.js";
import { eventPaths } from "../stats.js";
import { header, formula } from "./common.js";
import { UNIVERSE } from "./cross.js";

export async function render(root, { params, setParams }) {
  root.append(header("Event studies", "Average behaviour around scheduled events, using daily closes. Each window shows the move from the close before the event."));
  let ev;
  try { ev = await D.json("events.json"); } catch (e) { root.append(errorBox(e.message)); return; }
  const types = Object.entries(ev.types).filter(([, t]) => t.dates?.length);
  if (!types.length) { root.append(errorBox("No event dates available.")); return; }
  const label = Object.fromEntries(UNIVERSE);
  let type = params.type && ev.types[params.type] ? params.type : types[0][0];
  let ids = params.ids ? params.ids.split(",").filter((x) => label[x]) : ["UST2Y", "UST10Y", "USD_BROAD", "SPX"];
  let pre = +params.pre || 3, post = +params.post || 5, since = params.since || "2015-01-01";
  const sinceI = el("input", { type: "date", value: since, "aria-label": "Events since" });
  sinceI.addEventListener("change", () => (since = sinceI.value));
  const ctrl = el("div", { class: "panel", style: "padding:10px 12px;margin-bottom:12px" },
    el("div", { class: "form-grid", style: "grid-template-columns:repeat(auto-fill,minmax(170px,1fr));margin-bottom:8px" },
      el("label", { class: "fld" }, "Event type", select(types.map(([k, t]) => [k, `${t.label} (${t.dates.length})`]), type, (v) => (type = v), "Event type")),
      el("label", { class: "fld" }, "Days before", numberInput(pre, (v) => (pre = Math.max(0, Math.min(20, v | 0))), { min: 0, max: 20, step: 1 })),
      el("label", { class: "fld" }, "Days after", numberInput(post, (v) => (post = Math.max(1, Math.min(30, v | 0))), { min: 1, max: 30, step: 1 })),
      el("label", { class: "fld" }, "Events since", sinceI)),
    multiSelect(UNIVERSE, ids, (v) => (ids = v), "Instruments"),
    el("button", { class: "btn-sm", type: "button", text: "Run study", onclick: () => run() }));
  const out = el("div");
  root.append(ctrl, out);
  await run();

  async function run() {
    setParams({ type, ids: ids.join(","), pre, post, since });
    const t = ev.types[type];
    const dates = t.dates.filter((d) => d >= since);
    out.replaceChildren(el("div", { class: "loading", text: "Running…" }));
    const { ok, failed } = await D.many(ids);
    const grid = el("div", { class: "grid3" });
    const info = panel("Method", { span: 3 });
    info.body.append(el("dl", { class: "kv" },
      el("dt", { text: "Events" }), el("dd", { text: `${t.label}: ${dates.length} dates since ${F.date(since, "long")}` }),
      el("dt", { text: "Event dates" }), el("dd", { text: t.source }),
      el("dt", { text: "Timing" }), el("dd", { text: t.timing }),
      el("dt", { text: "Window" }), el("dd", { text: `${pre} trading days before to ${post} after; day 0 = first trading day on or after the event date` })),
      formula("path_k = X_{t0+k} − X_{t0−1}  (bp for yields)   or   X_{t0+k} / X_{t0−1} − 1  (% for prices)"),
      el("p", { class: "note", text: "Close-to-close daily data cannot isolate the minutes after a release: other news on the same day is included. The band is the interquartile range across events. Each instrument uses its own trading calendar; events without a complete window are dropped." }));
    grid.append(info.root);
    const rowsAll = [];
    for (const id of ids) {
      const p = panel(label[id], { span: 1 });
      const s = ok[id];
      if (!s) { p.body.append(errorBox(failed[id] || "unavailable")); grid.append(p.root); continue; }
      const kind = s.meta.change === "pct" ? "pct" : s.meta.units === "%" ? "bp" : "abs";
      const r = eventPaths(s, dates, pre, post, kind);
      if (!r.events.length) { p.body.append(errorBox("No events overlap this instrument's history.")); grid.append(p.root); continue; }
      p.body.append(xyChart(r.offsets, [{ label: "25th pct", v: r.q25, color: "rgba(242,238,207,0.0)", width: 0 }, { label: "75th pct", v: r.q75, color: "rgba(242,238,207,0.0)", width: 0 },
        { label: "Mean", v: r.mean, color: "#F2EECF" }, { label: "Median", v: r.median, color: "#3987e5", dash: [4, 3] }],
      { height: 220, xLabel: "Trading days from event", yUnits: kind === "pct" ? "pct" : "bp", band: [0, 1] }).el);
      const k0 = pre, kN = pre + post;
      const day0 = r.events.map((e) => e.path[k0]).filter((x) => x != null);
      const up = day0.filter((x) => x > 0).length;
      p.foot.append(`n = ${r.events.length}. Day-0 mean ${r.mean[k0].toFixed(kind === "pct" ? 2 : 1)}${kind === "pct" ? "%" : "bp"}, up on ${up}/${day0.length} events. Source: ${s.meta.provider_name}.`);
      r.events.forEach((e) => rowsAll.push([id, e.date, e.tradeDate, e.path[k0], e.path[kN]]));
      grid.append(p.root);
    }
    const pt = panel("Per-event detail", { span: 3 });
    const first = ids.find((i) => ok[i]);
    if (first) {
      const rows = rowsAll.filter((r) => r[0] === first).reverse().slice(0, 60);
      const unit = ok[first].meta.change === "pct" ? "%" : "bp";
      pt.body.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" },
        el("thead", {}, el("tr", {}, ["Event date", "Day 0", `${label[first]}: day-0 move`, `Cumulative to +${post}`].map((h, k) => el("th", { class: k > 1 ? "r" : "", text: h })))),
        el("tbody", {}, rows.map((r) => el("tr", {}, el("td", { class: "num", text: F.date(r[1], "long") }), el("td", { class: "num dim", text: F.date(r[2]) }),
          el("td", { class: `r num ${r[3] > 0 ? "up" : r[3] < 0 ? "down" : ""}`, text: r[3] == null ? "—" : r[3].toFixed(2) + unit }),
          el("td", { class: `r num ${r[4] > 0 ? "up" : r[4] < 0 ? "down" : ""}`, text: r[4] == null ? "—" : r[4].toFixed(2) + unit })))))));
      pt.actions.append(el("button", { class: "lnk", type: "button", text: "CSV (all instruments)", onclick: () =>
        downloadCSV(`event_study_${type}.csv`, ["instrument", "event_date", "day0_date", "day0_change", `cum_plus_${post}`], rowsAll) }));
      pt.foot.append(`Most recent 60 events for ${label[first]}. The CSV covers all selected instruments.`);
    }
    grid.append(pt.root);
    out.replaceChildren(grid);
  }
}
