// Sources & status: pipeline run report, every series with provenance, verification level and freshness, plus methodology.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, link, table, typeBadge, statusBadge, downloadCSV } from "../ui.js";
import { header, seriesHref } from "./common.js";

const REPO = "https://github.com/wickresearch/wickresearch.github.io";

export async function render(root, { go }) {
  root.append(header("Sources & status"));
  const grid = el("div", { class: "grid3" });
  root.append(grid);
  let cat, st;
  try { cat = await D.catalog(); } catch (e) { root.append(errorBox(e.message)); return; }
  try { st = await D.status(); } catch { st = null; }

  const pr = panel("Latest pipeline run", { span: 1 });
  if (st) {
    pr.body.append(el("dl", { class: "kv" }, el("dt", { text: "Mode" }), el("dd", { text: st.mode }), el("dt", { text: "Started" }), el("dd", { text: F.date(st.started_at, "time") }),
      el("dt", { text: "Finished" }), el("dd", { text: F.date(st.finished_at, "time") }),
      el("dt", { text: "Series status" }), el("dd", { text: Object.entries(st.counts).map(([k, v]) => `${k}: ${v}`).join(" · ") })));
  } else pr.body.append(errorBox("status.json unavailable"));
  pr.foot.append("Updates every 15 minutes on weekdays, hourly at weekends. ", link(`${REPO}/actions`, "Run history", true));
  grid.append(pr.root);

  const pp = panel("Providers this run", { span: 2 });
  if (st) {
    pp.body.append(table([{ key: "p", label: "Provider" }, { key: "ok", label: "OK", align: "r" }, { key: "fallback", label: "Last-good fallback", align: "r" },
      { key: "failed", label: "Failed", align: "r" }, { key: "err", label: "First error", fmt: (r) => el("span", { class: "dim", style: "white-space:normal", text: r.err }) }],
    Object.entries(st.providers).map(([p, v]) => ({ p: cat.providers[p]?.name || p, ok: v.ok, fallback: v.fallback, failed: v.failed, err: (v.errors[0] || "").slice(0, 160) }))));
  }
  grid.append(pp.root);

  const rows = Object.entries(cat.series).map(([id, m]) => ({ id, ...m, last: m.latest?.date, first: m.latest?.first_date }));
  const pc = panel(`Series catalogue (${rows.length})`, { span: 3 });
  pc.actions.append(el("button", { class: "lnk", type: "button", text: "CSV", onclick: () => downloadCSV("wick_catalogue.csv",
    ["id", "name", "provider", "provider_key", "type", "freq", "units", "first", "last", "retrieved_at", "status", "stale", "verification", "owner"],
    rows.map((r) => [r.id, r.name, r.provider_name, r.provider_key, r.type_label, r.freq, r.units, r.first, r.last, r.retrieved_at, r.status, r.stale, r.check, r.owner])) }));
  pc.body.append(table([
    { key: "name", label: "Series", fmt: (r) => el("span", {}, typeBadge(r), " ", r.name, " ", statusBadge(r)) },
    { key: "provider_name", label: "Provider", fmt: (r) => (r.source_url ? link(r.source_url, `${r.provider_name?.replace(/,.*$/, "")} · ${r.provider_key}`, true) : r.provider_name) },
    { key: "freq", label: "Freq", fmt: (r) => F.FREQ[r.freq] || r.freq },
    { key: "first", label: "From", fmt: (r) => (r.first ? F.obsDate(r.first, r.freq) : "—") },
    { key: "last", label: "Latest obs", fmt: (r) => (r.last ? F.obsDate(r.last, r.freq) : "—") },
    { key: "retrieved_at", label: "Retrieved", fmt: (r) => (r.retrieved_at ? F.date(r.retrieved_at, "time") : "—") },
    { key: "check", label: "Verification", fmt: (r) => el("span", { class: "dim", text: F.CHECK[r.check] || r.check || "" }) },
    { key: "owner", label: "Copyright / owner", fmt: (r) => el("span", { class: "dim", style: "white-space:normal", text: r.owner || "" }) },
  ], rows, { onRow: (r) => r.file && go(seriesHref(r.id)) }));
  pc.foot.append("Badges: ADM administered rate · O/N overnight market rate · EOD end-of-day close/yield · PUB official published data · EST model estimate · SVY survey · PROXY substitute instrument · CALC derived. STALE = latest observation older than expected for its frequency.");
  grid.append(pc.root);

  root.append(el("p", { class: "note", text: "Third-party data shown via FRED (S&P Dow Jones Indices, ICE, CBOE, Nikkei, Coinbase) remain the property of their owners." }));
}
