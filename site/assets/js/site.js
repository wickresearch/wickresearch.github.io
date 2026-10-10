// Wick Research – shared behaviour for the public pages (no dependencies).
// Data comes from /data/*.json written by the pipeline. Every block degrades gracefully when a
// file is missing: it shows an explicit "unavailable" message and never placeholder numbers.

const BASE = document.documentElement.dataset.base || "/";

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
}

async function getJSON(path) {
  const r = await fetch(BASE + path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

const fmtDate = (s, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  s ? new Date(s.length <= 10 ? s + "T00:00:00Z" : s).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" }) : "";

// ---------------------------------------------------------------- navigation
document.querySelectorAll(".nav-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const links = document.getElementById(btn.getAttribute("aria-controls"));
    const open = links.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });
});
document.querySelectorAll("[data-year]").forEach((n) => (n.textContent = new Date().getFullYear()));

// ---------------------------------------------------------------- research cards
export function articleCard(a) {
  const meta = el("div", { class: "meta" },
    el("span", { text: fmtDate(a.date) }), el("span", { text: a.platform || "" }));
  const tags = el("div", { class: "tags" }, el("span", { class: "tag cat", text: a.category || "Uncategorised" }),
    (a.tags || []).slice(0, 4).map((t) => el("span", { class: "tag", text: t })));
  return el("a", { class: "card article", href: a.url, target: "_blank", rel: "noopener" },
    meta, el("h3", { text: a.title }), a.description ? el("p", { text: a.description }) : null, tags);
}

async function renderFeatured() {
  const host = document.getElementById("featured-research");
  if (!host) return;
  try {
    const data = await getJSON("data/research.json");
    const arts = data.articles.filter((a) => a.featured).slice(0, 3);
    host.replaceChildren(...(arts.length ? arts : data.articles.slice(0, 3)).map(articleCard));
  } catch (e) {
    host.replaceChildren(el("p", { class: "muted", text: "The research index is unavailable right now. All articles are on Medium: " },
      el("a", { href: "https://medium.com/@ishritt", text: "medium.com/@ishritt" })));
  }
}

// ---------------------------------------------------------------- research library page
async function renderLibrary() {
  const host = document.getElementById("library");
  if (!host) return;
  let data;
  try { data = await getJSON("data/research.json"); } catch (e) {
    host.replaceChildren(el("p", { class: "muted", text: "The research index could not be loaded. " },
      el("a", { href: "https://medium.com/@ishritt", text: "Read on Medium" })));
    return;
  }
  const q = document.getElementById("q"), plat = document.getElementById("platform"), chips = document.getElementById("cats");
  const featured = document.getElementById("featured-list");
  const cats = data.categories.filter((c) => data.articles.some((a) => a.category === c));
  let active = new Set();
  chips.replaceChildren(...cats.map((c) => {
    const b = el("button", { class: "chip", type: "button", "aria-pressed": "false", text: c });
    b.addEventListener("click", () => {
      active.has(c) ? active.delete(c) : active.add(c);
      b.setAttribute("aria-pressed", String(active.has(c)));
      draw();
    });
    return b;
  }));
  if (featured) featured.replaceChildren(...data.articles.filter((a) => a.featured).map(articleCard));
  function draw() {
    const term = (q.value || "").toLowerCase().trim();
    const p = plat.value;
    const rows = data.articles.filter((a) =>
      (!active.size || active.has(a.category)) && (!p || a.platform === p) &&
      (!term || [a.title, a.description, a.category, ...(a.tags || [])].join(" ").toLowerCase().includes(term)));
    host.replaceChildren(...(rows.length ? rows.map(articleCard) : [el("p", { class: "muted", text: "No articles match these filters." })]));
    document.getElementById("count").textContent = `${rows.length} of ${data.articles.length} articles`;
  }
  q.addEventListener("input", draw);
  plat.addEventListener("change", draw);
  draw();
  if (data.note) document.getElementById("lib-note").textContent = data.note;
}

// ---------------------------------------------------------------- home snapshot
const SNAPSHOT = [
  ["UST2Y", "US 2Y"], ["UST10Y", "US 10Y"], ["US2S10S", "2s10s"], ["EFFR", "EFFR"],
  ["SOFR_IORB", "SOFR − IORB"], ["NET_LIQ", "Net liquidity"], ["CORE_PCE_YOY", "Core PCE y/y"], ["BRENT", "Brent"],
];

function fmtVal(v, units) {
  if (v == null) return "—";
  if (units === "USD bn") return (Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + "tn" : v.toFixed(0) + "bn");
  if (units === "%") return v.toFixed(2) + "%";
  if (units === "bp") return v.toFixed(0) + "bp";
  return v.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}
function fmtChg(c, kind, units) {
  if (c == null) return ["", "flat"];
  const cls = c > 0 ? "up" : c < 0 ? "down" : "flat";
  const sign = c > 0 ? "+" : c < 0 ? "−" : "±";
  const a = Math.abs(c);
  const txt = kind === "pct" ? `${sign}${a.toFixed(2)}%` : (kind === "bp" || units === "bp") ? `${sign}${a.toFixed(0)}bp`
    : units === "USD bn" ? `${sign}${a.toFixed(0)}bn` : `${sign}${a.toFixed(2)}`;
  return [txt, cls];
}

async function renderSnapshot() {
  const host = document.getElementById("snapshot");
  if (!host) return;
  try {
    const cat = await getJSON("data/catalog.json");
    const cells = SNAPSHOT.map(([id, label]) => {
      const s = cat.series[id];
      const L = s && s.latest;
      if (!L) return el("div", { class: "snap" }, el("div", { class: "k", text: label }), el("div", { class: "v", text: "n/a" }),
        el("div", { class: "d", text: "unavailable" }));
      const [txt, cls] = fmtChg(L.chg["1obs"], s.change, s.units);
      return el("a", { class: "snap", href: `${BASE}terminal/#series/${id}`, style: "text-decoration:none;color:inherit" },
        el("div", { class: "k", text: label }),
        el("div", { class: "v", text: fmtVal(L.value, s.units) }),
        el("div", { class: "c " + cls, text: txt ? `${txt} vs prior` : "" }),
        el("div", { class: "d", text: `${s.freq === "W" ? "Week of " : ""}${fmtDate(L.date)}${s.stale ? " · stale" : ""}` }));
    });
    host.replaceChildren(...cells);
    const note = document.getElementById("snapshot-note");
    if (note) { note.textContent = `End-of-day data · updated ${fmtDate(cat.generated_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} UTC`;
      note.title = "End-of-day and latest-published data, not real-time. Sources: FRED, NY Fed, U.S. Treasury."; }
  } catch (e) {
    host.replaceChildren(el("p", { class: "muted", style: "padding:16px", text: "Market data is unavailable right now (the data files have not been built or could not be loaded)." }));
  }
}

renderFeatured();
renderLibrary();
renderSnapshot();
