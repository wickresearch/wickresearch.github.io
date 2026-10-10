// Overview: the morning screen – key levels, the US curve, policy rates, what's next, and headlines.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, link, sourceLine } from "../ui.js";
import { curveChart, bars } from "../chart.js";
import { TENOR_YEARS } from "../stats.js";
import { tiles, header, seriesHref } from "./common.js";

export async function render(root, { go }) {
  const cat = await D.catalog();
  root.append(header("Overview", "Key levels across rates, the front end, liquidity, inflation and markets. Click any tile for history, sources and statistics."));
  root.append(tiles(cat, [["UST2Y", "US 2Y"], ["UST10Y", "US 10Y"], ["US2S10S", "2s10s"], ["TIPS10Y", "10Y real"], ["BE10Y", "10Y breakeven"],
    ["EFFR", "EFFR"], ["SOFR", "SOFR"], ["IORB", "IORB"]]));
  root.append(tiles(cat, [["CORE_PCE_YOY", "Core PCE y/y"], ["CORE_CPI_YOY", "Core CPI y/y"], ["UNRATE", "Unemployment"], ["PAYROLLS_CHG", "Payrolls m/m"],
    ["NET_LIQ", "Net liquidity"], ["SPX", "S&P 500"], ["USD_BROAD", "USD broad"], ["BRENT", "Brent"], ["GOLD_PROXY", "Gold (PAXG proxy)"], ["BTC", "Bitcoin"], ["VIX", "VIX"]]));

  const grid = el("div", { class: "grid3" });
  root.append(grid);

  // US curve snapshot
  const pc = panel("US Treasury curve", { sub: "Par yields: latest vs 1 month and 1 year earlier", span: 2 });
  grid.append(pc.root);
  try {
    const c = await D.curve("US");
    const idx = (target) => { let i = c.d.length - 1; while (i > 0 && c.d[i] > target) i--; return i; };
    const last = c.d[c.d.length - 1];
    const shift = (days) => new Date(Date.parse(last) - days * 864e5).toISOString().slice(0, 10);
    const pts = (i) => c.tenors.map((t, j) => [TENOR_YEARS[t], c.y[i][j]]).filter(([x, y]) => x != null && y != null);
    const picks = [[c.d.length - 1, "Latest"], [idx(shift(30)), "1M ago"], [idx(shift(365)), "1Y ago"]];
    pc.body.append(curveChart(picks.map(([i, lab], k) => ({ label: `${lab} (${F.date(c.d[i])})`, pts: pts(i), dash: k === 2 ? [4, 4] : undefined })),
      { tenorLabels: c.tenors.map((t) => [TENOR_YEARS[t], t]), height: 250 }).el);
    pc.foot.append(sourceLine([c.meta]), " · ", link("#rates", "Open Rates & curves →"));
  } catch (e) { pc.body.append(errorBox(e.message)); }

  // Policy rates
  const pp = panel("Policy rates", { sub: "Current setting and last change (BIS)", span: 1 });
  grid.append(pp.root);
  const pol = Object.entries(cat.series).filter(([id]) => id.startsWith("POL_"));
  const { ok } = await D.many(pol.map(([id]) => id));
  pp.body.append(el("table", { class: "tbl" }, el("thead", {}, el("tr", {}, el("th", { text: "Bank" }), el("th", { class: "r", text: "Rate" }), el("th", { class: "r", text: "Last move" }), el("th", { text: "Since" }))),
    el("tbody", {}, pol.map(([id, m]) => {
      const s = ok[id];
      if (!s) return el("tr", {}, el("td", { text: m.bank || id }), el("td", { class: "r dim", text: "n/a" }), el("td"), el("td"));
      let i = s.v.length - 1; while (i > 0 && s.v[i - 1] === s.v[i]) i--;
      const mv = i > 0 ? (s.v[i] - s.v[i - 1]) * 100 : null;
      return el("tr", { class: "click", onclick: () => go(seriesHref(id)) }, el("td", { text: m.bank }), el("td", { class: "r num", text: F.value(s.v[s.v.length - 1], "%") }),
        el("td", { class: `r num ${mv > 0 ? "up" : mv < 0 ? "down" : ""}`, text: mv == null ? "—" : `${mv > 0 ? "+" : "−"}${Math.abs(mv).toFixed(0)}bp` }),
        el("td", { class: "dim", text: i > 0 ? F.date(s.d[i]) : "—" }));
    }))));
  pp.foot.append("BIS policy-rate data can lag announcements by several days. ", link("#cb", "Central banks →"));

  // 1M cross-asset moves
  const pm = panel("One-month moves", { sub: "% change (prices) and bp (yields), latest vs 1 month earlier", span: 1 });
  grid.append(pm.root);
  const ids = [["UST2Y", "US 2Y"], ["UST10Y", "US 10Y"], ["DE_10Y", "Bund 10Y"], ["SPX", "S&P 500"], ["NASDAQ", "Nasdaq"], ["NIKKEI", "Nikkei"], ["USD_BROAD", "USD"], ["EURUSD", "EUR/USD"],
    ["BRENT", "Brent"], ["GOLD_PROXY", "Gold*"], ["BTC", "BTC"]];
  pm.body.append(bars(ids.filter(([id]) => cat.series[id]?.latest).map(([id, label]) => {
    const m = cat.series[id], c = m.latest.chg["1m"];
    return { label, value: c, text: F.change(c, m.change, m.units)[0] };
  })));
  pm.foot.append("Yields in bp, prices in %. *PAXG token, a proxy for spot gold. Different units: compare direction, not size.");

  // Calendar
  const pk = panel("Next on the calendar", { sub: "Official release dates and policy decisions", span: 1 });
  grid.append(pk.root);
  try {
    const cal = await D.json("calendar.json");
    const items = cal.items.slice(0, 12);
    pk.body.append(el("ul", { class: "list" }, items.map((it) => el("li", {}, el("span", { class: "when", text: F.date(it.date) }),
      el("span", {}, link(it.url, it.label, true), it.importance === "high" ? el("span", { class: "pill high", text: "key" }) : null, it.tentative ? el("span", { class: "pill", text: "tentative" }) : null)))));
    pk.foot.append(link("#calendar", "Full calendar →"));
  } catch (e) { pk.body.append(errorBox(e.message)); }

  // News
  const pn = panel("Central-bank headlines", { sub: "Official RSS feeds: Fed, ECB, BoE, BoJ", span: 1 });
  grid.append(pn.root);
  try {
    const news = await D.json("news.json");
    pn.body.append(el("ul", { class: "list" }, news.items.slice(0, 9).map((n) => el("li", {}, el("span", { class: "when", text: `${n.bank} · ${F.date(n.date)}` }), link(n.url, n.title, true)))));
  } catch (e) { pn.body.append(errorBox(e.message)); }
}
