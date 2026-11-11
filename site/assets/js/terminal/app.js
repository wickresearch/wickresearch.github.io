// Wick macro terminal – shell, router and shared series view.
// Routes are hash-based so every view is a shareable URL, e.g. #cross?ids=SPX,UST10Y&win=1Y
import * as D from "./data.js";
import * as F from "./fmt.js";
import { el, errorBox, panel, typeBadge, statusBadge, chg, link, downloadCSV } from "./ui.js";
import { timeChart } from "./chart.js";
import * as S from "./stats.js";

export const MODULES = [
  { id: "overview", title: "Overview", group: "Monitor" },
  { id: "markets", title: "Markets", group: "Monitor" },
  { id: "calendar", title: "Calendar & news", group: "Monitor" },
  { id: "rates", title: "Rates & curves", group: "Rates" },
  { id: "frontend", title: "Front end & Fed", group: "Rates" },
  { id: "cb", title: "Central banks", group: "Rates" },
  { id: "liquidity", title: "Liquidity & funding", group: "Rates" },
  { id: "macro", title: "Inflation & labour", group: "Macro" },
  { id: "global", title: "Global macro", group: "Macro" },
  { id: "library", title: "FRED library", group: "Macro" },
  { id: "cross", title: "Cross-asset", group: "Analysis" },
  { id: "events", title: "Event studies", group: "Analysis" },
  { id: "regimes", title: "Regimes", group: "Analysis" },
  { id: "risk", title: "Risk & sizing", group: "Analysis" },
  { id: "sources", title: "Sources & status", group: "Reference" },
];

// ------------------------------------------------------------------ routing
export function parseHash() {
  const h = decodeURIComponent(location.hash.slice(1) || "overview");
  const [path, qs] = h.split("?");
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  const [mod, arg] = path.split("/");
  return { mod: mod || "overview", arg, params };
}
/** Update URL params for the current view without re-rendering (keeps views shareable). */
export function setParams(p) {
  const { mod, arg } = parseHash();
  const cur = parseHash().params;
  const merged = { ...cur, ...p };
  Object.keys(merged).forEach((k) => (merged[k] == null || merged[k] === "") && delete merged[k]);
  const qs = new URLSearchParams(merged).toString();
  history.replaceState(null, "", `#${mod}${arg ? "/" + arg : ""}${qs ? "?" + qs : ""}`);
}
export const go = (hash) => { location.hash = hash; };

const view = document.getElementById("view");
const nav = document.getElementById("modnav");

function buildNav() {
  let group = null;
  MODULES.forEach((m) => {
    if (m.group !== group) { group = m.group; nav.append(el("div", { class: "nav-group", text: group })); }
    nav.append(el("a", { href: `#${m.id}`, "data-mod": m.id, text: m.title }));
  });
  nav.append(el("div", { class: "nav-group", text: "Site" }),
    el("a", { href: "/research/", text: "Research library ↗" }), el("a", { href: "/framework/", text: "Framework ↗" }));
}

// ------------------------------------------------------------------ live updates
// The pipeline runs every 15 minutes on weekdays and redeploys only when data changed. The page
// polls the tiny build.json and, when a new build appears, reloads the data and redraws the view.
const POLL_MS = 60_000;
let builtAt = null, lastBuild = null;

function ago(iso) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

async function statusBar() {
  const host = document.getElementById("datastatus");
  try {
    const [cat, st] = await Promise.all([D.catalog(), D.status().catch(() => null)]);
    const all = Object.values(cat.series);
    const stale = all.filter((m) => m.stale).length, fb = all.filter((m) => m.status === "fallback").length,
      failed = all.filter((m) => m.status === "failed").length;
    const issues = stale + fb + failed;
    builtAt = (lastBuild && lastBuild.data_changed_at) || cat.generated_at;
    host.replaceChildren(...[
      el("span", { class: "dot " + (failed || fb ? "warn" : "ok") }),
      el("span", { class: "live", text: "Live" }),
      el("span", { id: "updated-ago", text: ` · data updated ${F.date(builtAt, "time")} (${ago(builtAt)})` }),
      issues ? el("a", { href: "#sources", class: "issues", text: ` · ${issues} series flagged` }) : null].filter(Boolean));
    host.title = `Checks for new data every minute. Last pipeline run: ${F.date(lastBuild?.built_at || st?.finished_at || cat.generated_at, "time")}`;
  } catch (e) {
    host.replaceChildren(el("span", { class: "dot bad" }), el("span", { text: "Data files unavailable" }));
  }
}

function toast(changes) {
  const fresh = (changes || []).filter((c) => c.new_obs && c.freq !== "D");
  const list = (fresh.length ? fresh : changes || []).slice(0, 4).map((c) => `${c.name} (${F.obsDate(c.date, c.freq)})`);
  const t = el("div", { class: "toast", role: "status" },
    el("strong", { text: fresh.length ? "New releases: " : "Data updated" }), fresh.length ? list.join(" · ") : "",
    fresh.length > 4 ? ` +${fresh.length - 4} more` : "");
  document.body.append(t);
  setTimeout(() => t.classList.add("out"), 7000);
  setTimeout(() => t.remove(), 7600);
}

/** Views with typed-in inputs are not redrawn automatically; a button offers the update instead. */
function busy() {
  const a = document.activeElement;
  return parseHash().mod === "risk" || (a && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}

function offerUpdate(changes) {
  if (document.getElementById("update-pill")) return;
  const b = el("button", { id: "update-pill", class: "update-pill", type: "button", text: "New data available – update view",
    onclick: () => { b.remove(); render({ keep: true }); toast(changes); } });
  document.body.append(b);
}

async function checkForUpdate() {
  if (document.hidden) return;
  try {
    const b = await D.build();
    const changed = D.setVersion(b.data_hash);
    lastBuild = b;
    if (!changed) { const n = document.getElementById("updated-ago"); if (n && builtAt) n.textContent = ` · data updated ${F.date(builtAt, "time")} (${ago(builtAt)})`; return; }
    await statusBar();
    if (busy()) offerUpdate(b.changes);
    else { await render({ keep: true }); toast(b.changes); }
  } catch (e) { /* offline or build.json missing: keep showing what is on screen */ }
}

async function render({ keep = false } = {}) {
  const { mod, arg, params } = parseHash();
  nav.querySelectorAll("a[data-mod]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.mod === mod));
  const m = MODULES.find((x) => x.id === mod);
  document.title = `${m ? m.title : mod === "series" ? "Series" : "Terminal"} · Wick Macro Terminal`;
  const y = window.scrollY;
  if (!keep) {
    view.replaceChildren(el("div", { class: "loading", text: "Loading…" }));
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  try {
    if (mod === "series") {
      const host = keep ? el("div") : view;
      await seriesView(host, arg, params);
      if (keep) { view.replaceChildren(...host.childNodes); window.scrollTo(0, y); }
      return;
    }
    if (!m) { view.replaceChildren(errorBox(`Unknown module "${mod}".`)); return; }
    const module = await import(`./modules/${mod}.js`);
    const page = el("div", { class: "page" });
    if (!keep) view.replaceChildren(page);
    await module.render(page, { params, setParams, go });
    if (keep) { view.replaceChildren(page); window.scrollTo(0, y); }
  } catch (e) {
    console.error(e);
    if (!keep) view.replaceChildren(errorBox(`This module could not be loaded: ${e.message}`, "Other modules are unaffected. See Sources & status."));
  }
}

// ------------------------------------------------------------------ series detail view (#series/ID)
export const seriesHref = (id) => `#series/${id}`;

async function seriesView(root, id, params) {
  const s = await D.series(id);
  const m = s.meta, L = m.latest || {};
  const head = el("div", { class: "page-head" },
    el("div", {}, el("div", { class: "crumbs" }, el("button", { type: "button", class: "lnk", text: "← Back", onclick: () => (history.length > 1 ? history.back() : go("#overview")) })),
      el("h1", { text: m.name }), el("div", { class: "sub" }, typeBadge(m), " ", statusBadge(m), " ", m.type_label || "", " · ", F.FREQ[m.freq] || m.freq, " · ", m.units || "")));
  const stats = el("div", { class: "kpis" },
    kpi("Latest", F.value(L.value, m.units), F.obsDate(L.date, m.freq)),
    kpi("vs prior", chg(L.chg?.["1obs"], m.change, m.units)),
    kpi("1 month", chg(L.chg?.["1m"], m.change, m.units)),
    kpi("YTD", chg(L.chg?.ytd, m.change, m.units)),
    kpi("1 year", chg(L.chg?.["1y"], m.change, m.units)),
    kpi("52w range", `${F.value(L.lo52, m.units)} – ${F.value(L.hi52, m.units)}`),
    kpi("5y percentile", L.pct5y == null ? "—" : `${L.pct5y.toFixed(0)}th`),
    kpi("1y z-score", L.z1y == null ? "—" : F.num(L.z1y, 2)));
  const p = panel("History", { span: 3 });
  const ch = timeChart([{ id, label: m.name, d: s.d, v: s.v, step: m.step }], { units: m.units, height: 340, range: params.range || (m.freq === "M" || m.freq === "Q" ? "10Y" : "1Y"),
    onRange: (r) => setParams({ range: r }), filename: id });
  p.body.append(ch.el);

  // Comparison with history: same-date values N years ago, and distribution stats
  const cmp = panel("Current vs history", { span: 1 });
  const rows = [1, 2, 5, 10].map((y) => {
    const target = `${+L.date.slice(0, 4) - y}${L.date.slice(4)}`;
    const i = s.d.findLastIndex ? s.d.findLastIndex((d) => d <= target) : -1;
    return [`${y}y ago`, i >= 0 ? `${F.value(s.v[i], m.units)} (${F.obsDate(s.d[i], m.freq)})` : "—"];
  });
  const v5 = S.sliceFrom(s, `${+L.date.slice(0, 4) - 5}${L.date.slice(4)}`).v;
  cmp.body.append(el("dl", { class: "kv" }, rows.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { class: "num", text: v })]),
    el("dt", { text: "5y median" }), el("dd", { class: "num", text: F.value(S.median(v5), m.units) }),
    el("dt", { text: "5y min / max" }), el("dd", { class: "num", text: `${F.value(Math.min(...v5), m.units)} / ${F.value(Math.max(...v5), m.units)}` })));

  const meta = panel("Source & metadata", { span: 2 });
  const pm = m.provider_meta || {};
  meta.body.append(el("dl", { class: "kv" },
    ...[["Provider", m.source_url ? link(m.source_url, m.provider_name, true) : m.provider_name], ["Provider code", m.provider_key],
      ["Title at source", pm.title], ["Data type", m.type_label], ["Frequency", F.FREQ[m.freq]], ["Units", m.units],
      ["Latest observation", F.obsDate(L.date, m.freq)], ["First observation", F.obsDate(L.first_date, m.freq)], ["Observations", L.n],
      ["Provider last updated", pm.last_updated], ["Retrieved by pipeline", F.date(m.retrieved_at, "time")],
      ["Status", m.status === "ok" ? (m.stale ? "Stale – older than expected for its frequency" : "OK") : m.status === "fallback" ? "Last good data (latest fetch failed)" : m.status],
      ["Verification", F.CHECK[m.check] || m.check], ["Copyright / owner", m.owner], ["Note", m.note]]
      .filter(([, v]) => v != null && v !== "").flatMap(([k, v]) => [el("dt", { text: k }), el("dd", {}, v)])),
    el("button", { class: "btn-sm", type: "button", text: "Download all observations (CSV)", onclick: () =>
      downloadCSV(`${id}.csv`, ["date", `${id} (${m.units || ""})`], s.d.map((d, i) => [d, s.v[i]])) }));
  root.replaceChildren(el("div", { class: "page" }, head, stats, el("div", { class: "grid3" }, p.root, cmp.root, meta.root)));
}

export function kpi(label, value, sub) {
  const small = typeof value === "string" && value.length > 10;
  return el("div", { class: "kpi" }, el("div", { class: "k", text: label }), el("div", { class: small ? "v num sm" : "v num", title: typeof value === "string" ? value : null }, value), sub ? el("div", { class: "s", text: sub }) : null);
}

buildNav();
(async () => {
  try { lastBuild = await D.build(); D.setVersion(lastBuild.data_hash); } catch (e) { /* first deploy without build.json */ }
  statusBar();
  window.addEventListener("hashchange", () => render());
  await render();
  setInterval(checkForUpdate, POLL_MS);
  document.addEventListener("visibilitychange", () => !document.hidden && checkForUpdate());
})();
