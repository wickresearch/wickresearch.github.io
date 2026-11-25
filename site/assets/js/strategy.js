// Wick Research – strategy research pages. No dependencies.
// 1) Strategy cards: any element with data-strategy-cards is filled from /research/strategies/strategies.json.
// 2) P&L chart: an element with data-pnl-chart="<url of data.json>" gets a two-panel chart
//    (cumulative line above, monthly bars below, shared months, one y-axis per panel) with hover values.

const NS = "http://www.w3.org/2000/svg";
const fmtUSD = (v) => (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-GB");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
  }
  kids.flat().forEach((k) => k != null && n.append(k));
  return n;
}
function s(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
}

// ------------------------------------------------------------------ cards
async function renderCards() {
  const hosts = document.querySelectorAll("[data-strategy-cards]");
  if (!hosts.length) return;
  let data;
  try {
    const r = await fetch("/research/strategies/strategies.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch (e) {
    hosts.forEach((n) => n.replaceChildren(h("p", { class: "muted", text: "The strategy list could not be loaded. " },
      h("a", { href: "/research/strategies/", text: "Open the strategies index" }))));
    return;
  }
  const date = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const cards = () => data.strategies.map((st) => h("a", { class: "card st-card feature", href: `/research/strategies/${st.slug}/` },
    h("div", { class: "meta" }, h("span", { text: date(st.date) }), h("span", { text: st.instrument })),
    h("h3", { text: st.title }),
    h("p", { text: st.line }),
    h("div", { class: "mini" }, st.figures.map((f) => h("div", { text: f.label }, h("b", { text: f.value })))),
    h("div", { class: "basis-line", text: st.basis })));
  hosts.forEach((n) => n.replaceChildren(...cards()));
}

// ------------------------------------------------------------------ chart
function drawChart(host, d) {
  const W = Math.max(300, host.clientWidth);
  const narrow = W < 520;
  const H1 = narrow ? 150 : 190, H2 = narrow ? 100 : 120, GAP = 46;
  const m = { l: narrow ? 46 : 54, r: 12, t: 22, b: 30 };
  const H = m.t + H1 + GAP + H2 + m.b;
  const n = d.months.length;
  const iw = W - m.l - m.r, step = iw / n;
  const xc = (i) => m.l + step * (i + 0.5);

  const cumMax = Math.ceil(Math.max(...d.cumulative) / 10000) * 10000;
  const y1 = (v) => m.t + H1 - (v / cumMax) * H1;
  const nMin = Math.min(0, ...d.net), nMax = Math.max(...d.net);
  const lo = Math.floor(nMin / 2000) * 2000, hi = Math.ceil(nMax / 2000) * 2000;
  const top2 = m.t + H1 + GAP;
  const y2 = (v) => top2 + H2 - ((v - lo) / (hi - lo)) * H2;

  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
    "aria-label": `Cumulative and monthly net P&L, ${monthLabel(d.months[0])} to ${monthLabel(d.months[n - 1])}. Final cumulative ${fmtUSD(d.cumulative[n - 1])}.` });

  // panel 1: cumulative
  const g1 = s("g", { class: "grid" }, svg), ax1 = s("g", { class: "axis" }, svg);
  for (let v = 0; v <= cumMax; v += 10000) {
    s("line", { x1: m.l, x2: W - m.r, y1: y1(v), y2: y1(v) }, g1);
    s("text", { x: m.l - 8, y: y1(v) + 4, "text-anchor": "end" }, ax1).textContent = v === 0 ? "$0" : `$${v / 1000}k`;
  }
  s("text", { x: m.l, y: m.t - 8, class: "panel-label" }, svg).textContent = "Cumulative net P&L";
  const pts = d.cumulative.map((v, i) => `${xc(i).toFixed(1)},${y1(v).toFixed(1)}`).join(" ");
  s("polyline", { points: pts, class: "line" }, svg);
  const dots = d.cumulative.map((v, i) => s("circle", { cx: xc(i), cy: y1(v), r: 3.5, class: "dot", opacity: i === n - 1 ? 1 : 0 }, svg));

  // panel 2: monthly
  const g2 = s("g", { class: "grid" }, svg);
  for (let v = lo; v <= hi; v += 2000) {
    s("line", { x1: m.l, x2: W - m.r, y1: y2(v), y2: y2(v), class: v === 0 ? "zero" : "" }, g2);
    if (v % 4000 === 0) s("text", { x: m.l - 8, y: y2(v) + 4, "text-anchor": "end" }, ax1).textContent = v === 0 ? "$0" : `${v < 0 ? "−" : ""}$${Math.abs(v) / 1000}k`;
  }
  s("text", { x: m.l, y: top2 - 8, class: "panel-label" }, svg).textContent = "Monthly net P&L";
  const bw = Math.min(26, step * 0.62);
  const cols = d.net.map((v, i) => {
    const g = s("g", { class: "col" }, svg);
    const y0 = y2(0), yv = y2(v), r = Math.min(4, Math.abs(yv - y0) / 2);
    // bar with 4px rounded data-end, anchored square at the baseline
    const x = xc(i) - bw / 2, top = Math.min(y0, yv), hgt = Math.max(1, Math.abs(yv - y0));
    const path = v >= 0
      ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y0} Z`
      : `M${x},${y0} V${top + hgt - r} Q${x},${top + hgt} ${x + r},${top + hgt} H${x + bw - r} Q${x + bw},${top + hgt} ${x + bw},${top + hgt - r} V${y0} Z`;
    s("path", { d: path, class: "bar" }, g);
    return g;
  });

  // x labels: every month on desktop, every other month on narrow screens; year under Jan and the first month
  d.months.forEach((ym, i) => {
    const [y, mo] = ym.split("-").map(Number);
    if (!narrow || i % 2 === 0) s("text", { x: xc(i), y: H - m.b + 16, "text-anchor": "middle" }, ax1).textContent = MONTHS[mo - 1].slice(0, narrow ? 1 : 3);
    if (i === 0 || mo === 1) s("text", { x: xc(i), y: H - m.b + 29, "text-anchor": "middle" }, ax1).textContent = String(y);
  });

  // hover layer: crosshair spanning both panels and one hit column per month
  const cross = s("line", { class: "cross", x1: 0, x2: 0, y1: m.t, y2: top2 + H2, visibility: "hidden" }, svg);
  const tip = host.parentElement.querySelector(".tip") || host.parentElement.appendChild(h("div", { class: "tip", hidden: "" }));
  const show = (i) => {
    cross.setAttribute("x1", xc(i)); cross.setAttribute("x2", xc(i)); cross.setAttribute("visibility", "visible");
    dots.forEach((c, j) => c.setAttribute("opacity", j === i ? 1 : 0));
    cols.forEach((c, j) => c.classList.toggle("on", j === i));
    tip.replaceChildren(h("b", { text: monthLabel(d.months[i]) + (i === 0 || i === n - 1 ? " (part month)" : "") }), h("br"),
      h("span", { class: "m", text: "Month " }), fmtUSD(d.net[i]), h("br"),
      h("span", { class: "m", text: "Cumulative " }), fmtUSD(d.cumulative[i]));
    tip.hidden = false;
    const box = host.getBoundingClientRect(), pbox = host.parentElement.getBoundingClientRect();
    const tx = box.left - pbox.left + xc(i);
    const tw = tip.offsetWidth;
    let left = tx + 12;
    if (left + tw > pbox.width - 8) left = tx - tw - 12;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = box.top - pbox.top + y1(d.cumulative[i]) + 8 + "px";
  };
  const hide = () => {
    cross.setAttribute("visibility", "hidden"); tip.hidden = true;
    dots.forEach((c, j) => c.setAttribute("opacity", j === n - 1 ? 1 : 0));
    cols.forEach((c) => c.classList.remove("on"));
  };
  d.months.forEach((_, i) => {
    const r = s("rect", { x: m.l + step * i, y: m.t, width: step, height: top2 + H2 - m.t, class: "hit", tabindex: 0,
      "aria-label": `${monthLabel(d.months[i])}: month ${fmtUSD(d.net[i])}, cumulative ${fmtUSD(d.cumulative[i])}` }, svg);
    r.addEventListener("pointerenter", () => show(i));
    r.addEventListener("pointerdown", () => show(i));
    r.addEventListener("focus", () => show(i));
    r.addEventListener("blur", hide);
  });
  svg.addEventListener("pointerleave", hide);
  host.replaceChildren(svg);
}

function renderTable(host, d) {
  const rows = d.months.map((ym, i) => h("tr", {}, h("td", { text: monthLabel(ym) }), h("td", { text: fmtUSD(d.net[i]) }), h("td", { text: fmtUSD(d.cumulative[i]) })));
  host.replaceChildren(h("table", { class: "dtable" },
    h("thead", {}, h("tr", {}, h("th", { text: "Month" }), h("th", { text: "Net" }), h("th", { text: "Cumulative" }))),
    h("tbody", {}, rows)));
}

async function renderCharts() {
  for (const host of document.querySelectorAll("[data-pnl-chart]")) {
    try {
      const r = await fetch(host.dataset.pnlChart, { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status);
      const d = (await r.json()).monthly_backtest;
      drawChart(host, d);
      const t = host.parentElement.querySelector("[data-pnl-table]");
      if (t) renderTable(t, d);
      let w = host.clientWidth;
      new ResizeObserver(() => { if (Math.abs(host.clientWidth - w) > 4) { w = host.clientWidth; drawChart(host, d); } }).observe(host);
    } catch (e) {
      host.replaceChildren(h("p", { class: "muted", text: "Chart data could not be loaded." }));
    }
  }
}

renderCards();
renderCharts();
