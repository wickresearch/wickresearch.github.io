// Small DOM toolkit for the terminal: elements, panels, tables, controls and status badges.
import * as F from "./fmt.js";

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v; // only ever used with static, code-defined strings
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}

/** A titled panel. Returns {root, body, actions, foot}. */
export function panel(title, { sub, span = 1, cls = "" } = {}) {
  const actions = el("div", { class: "p-actions" });
  const body = el("div", { class: "p-body" });
  const foot = el("div", { class: "p-foot" });
  const root = el("section", { class: `panel span-${span} ${cls}` },
    el("header", { class: "p-head" }, el("div", {}, el("h2", { text: title }), sub ? el("div", { class: "p-sub", text: sub }) : null), actions),
    body, foot);
  return { root, body, actions, foot };
}

export function errorBox(msg, hint) {
  return el("div", { class: "err", role: "status" }, el("strong", { text: "Unavailable. " }), msg, hint ? el("div", { class: "small", text: hint }) : null);
}
export function note(text) { return el("p", { class: "note", text }); }
export function loading() { return el("div", { class: "loading", text: "Loading…" }); }

/** Segmented control. options: [[value, label]]. */
export function segmented(options, value, onChange, label = "") {
  const wrap = el("div", { class: "seg", role: "group", "aria-label": label });
  options.forEach(([v, lab]) => {
    const b = el("button", { type: "button", "aria-pressed": String(v === value), text: lab });
    b.addEventListener("click", () => {
      wrap.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      onChange(v);
    });
    wrap.append(b);
  });
  return wrap;
}

export function select(options, value, onChange, label = "") {
  const s = el("select", { "aria-label": label });
  options.forEach(([v, lab]) => s.append(el("option", { value: v, selected: v === value, text: lab })));
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

export function multiSelect(options, values, onChange, label = "") {
  const wrap = el("div", { class: "chips", role: "group", "aria-label": label });
  const set = new Set(values);
  options.forEach(([v, lab]) => {
    const b = el("button", { type: "button", class: "chip", "aria-pressed": String(set.has(v)), text: lab });
    b.addEventListener("click", () => {
      set.has(v) ? set.delete(v) : set.add(v);
      b.setAttribute("aria-pressed", String(set.has(v)));
      onChange([...set]);
    });
    wrap.append(b);
  });
  return wrap;
}

export function numberInput(value, onChange, { step = "any", min, max, label, width = 90 } = {}) {
  const i = el("input", { type: "number", step, min, max, value, "aria-label": label, style: `width:${width}px` });
  i.addEventListener("change", () => onChange(parseFloat(i.value)));
  return i;
}

/** Status/type badges shown next to every number. */
export function typeBadge(meta) {
  const map = { administered: "ADM", overnight_market: "O/N", treasury_yield: "EOD", market_close: "EOD", official_release: "PUB",
    model_estimate: "EST", survey: "SVY", proxy: "PROXY", derived: "CALC" };
  return el("span", { class: `badge t-${meta.type || "x"}`, title: meta.type_label || meta.type || "", text: map[meta.type] || "—" });
}
export function statusBadge(meta) {
  if (meta.status === "fallback") return el("span", { class: "badge warn", title: `Provider failed on the latest run; showing last good data retrieved ${F.date(meta.retrieved_at, "time")}`, text: "LAST GOOD" });
  if (meta.status === "failed") return el("span", { class: "badge bad", title: "No data available", text: "N/A" });
  if (meta.stale) return el("span", { class: "badge warn", title: "Latest observation is older than expected for this frequency", text: "STALE" });
  return null;
}

export function chg(c, kind, units) {
  const [t, cls] = F.change(c, kind, units);
  return el("span", { class: `num ${cls}`, text: t });
}

/** Generic sortable table. cols: [{key, label, fmt?: (row) => node|string, align?, sort?: (row)=>value}] */
export function table(cols, rows, { onRow, cls = "", caption } = {}) {
  let sortKey = null, dir = 1;
  const tbody = el("tbody");
  const thead = el("thead", {}, el("tr", {}, cols.map((c) => {
    const th = el("th", { class: c.align === "r" ? "r" : "", scope: "col", text: c.label, title: c.title });
    if (c.sort !== false) {
      th.classList.add("sortable");
      th.addEventListener("click", () => { dir = sortKey === c.key ? -dir : 1; sortKey = c.key; draw(); });
    }
    return th;
  })));
  function draw() {
    let rs = rows;
    if (sortKey) {
      const c = cols.find((x) => x.key === sortKey);
      const get = c.sort || ((r) => r[sortKey]);
      rs = [...rows].sort((a, b) => { const x = get(a), y = get(b); return (x == null) - (y == null) || (x < y ? -dir : x > y ? dir : 0); });
    }
    tbody.replaceChildren(...rs.map((r) => {
      const tr = el("tr", onRow ? { class: "click", tabindex: "0" } : {}, cols.map((c) => {
        const v = c.fmt ? c.fmt(r) : r[c.key];
        return el("td", { class: c.align === "r" ? "r num" : "" }, v == null ? "—" : v);
      }));
      if (onRow) {
        tr.addEventListener("click", () => onRow(r));
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter") onRow(r); });
      }
      return tr;
    }));
  }
  draw();
  return el("div", { class: "tbl-wrap" }, el("table", { class: `tbl ${cls}` }, caption ? el("caption", { text: caption }) : null, thead, tbody));
}

/** Source line: provider, type, observation date, retrieval time. */
export function sourceLine(metas) {
  const provs = [...new Set(metas.filter(Boolean).map((m) => m.provider_name).filter(Boolean))];
  const last = metas.filter((m) => m && m.retrieved_at).map((m) => m.retrieved_at).sort().pop();
  return el("div", { class: "src" }, `Source: ${provs.join(", ") || "—"}`, last ? ` · retrieved ${F.date(last, "time")}` : "");
}

export function downloadCSV(filename, header, rows) {
  const esc = (x) => (x == null ? "" : /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: filename });
  document.body.append(a); a.click(); a.remove();
}

export function link(href, text, ext = false) {
  return el("a", ext ? { href, target: "_blank", rel: "noopener", text } : { href, text });
}

// Persist small per-viewer preferences (watchlists, chosen windows). Browser-local only.
export const prefs = {
  get(k, d) { try { const v = localStorage.getItem("wick:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("wick:" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
