// Calendar & news: official release dates, central-bank meetings, and official headlines.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, link, segmented } from "../ui.js";
import { header } from "./common.js";

export async function render(root, { params, setParams }) {
  root.append(header("Calendar & news", "Release dates from the FRED release calendar; central-bank meeting dates transcribed from each bank's official calendar."));
  const grid = el("div", { class: "grid3" });
  root.append(grid);
  const pc = panel("Upcoming", { span: 2 });
  grid.append(pc.root);
  let cal;
  try {
    cal = await D.json("calendar.json");
    const draw = (kind) => {
      const items = cal.items.filter((i) => kind === "all" || (kind === "cb" ? i.kind === "central_bank" : i.importance === "high"));
      let wk = null;
      const rows = [];
      for (const it of items) {
        const d = new Date(it.date + "T00:00:00Z");
        const monday = new Date(d - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
        if (monday !== wk) { wk = monday; rows.push(el("tr", { class: "group" }, el("td", { colspan: 4, text: `Week of ${F.date(monday, "long")}` }))); }
        rows.push(el("tr", {}, el("td", { class: "num", text: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) }),
          el("td", {}, link(it.url, it.label, true), it.sep ? el("span", { class: "pill", text: "SEP" }) : null, it.tentative ? el("span", { class: "pill", text: "tentative" }) : null),
          el("td", {}, it.importance === "high" ? el("span", { class: "pill high", text: "key" }) : el("span", { class: "dim", text: it.importance })),
          el("td", { class: "dim", text: it.source })));
      }
      body.replaceChildren(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" }, el("tbody", {}, rows))));
    };
    const body = el("div");
    pc.actions.append(segmented([["all", "All"], ["key", "Key only"], ["cb", "Central banks"]], params.f || "all", (v) => { setParams({ f: v }); draw(v); }, "Filter"));
    pc.body.append(body);
    draw(params.f || "all");
    pc.foot.append(cal.disclaimer || "", cal.notes?.length ? ` ${cal.notes.join(" ")}` : "");
  } catch (e) { pc.body.append(errorBox(e.message)); }

  const pm = panel("Policy meeting schedule", { sub: cal ? `Verified against official pages on ${cal.verified_on}` : "", span: 1 });
  grid.append(pm.root);
  if (cal) {
    const today = new Date().toISOString().slice(0, 10);
    pm.body.append(el("div", {}, Object.entries(cal.meetings).map(([bank, m]) => {
      const next = m.dates.filter((d) => d >= today).slice(0, 4);
      return el("div", { style: "margin-bottom:10px" }, el("div", {}, el("strong", { text: bank }), " · ", link(m.source, "official calendar", true)),
        el("div", { class: "num", text: next.length ? next.map((d) => F.date(d, "long")).join(" · ") : "No upcoming dates published" }),
        m.note ? el("div", { class: "note", text: m.note }) : null);
    })));
  }

  const pn = panel("Official headlines", { sub: "Fed, ECB, Bank of England and Bank of Japan RSS feeds. Headlines and links only.", span: 3 });
  grid.append(pn.root);
  try {
    const news = await D.json("news.json");
    const list = el("ul", { class: "list" });
    const draw = (b) => list.replaceChildren(...news.items.filter((n) => b === "all" || n.bank === b).slice(0, 40)
      .map((n) => el("li", {}, el("span", { class: "when", text: `${n.bank} · ${F.date(n.date)}` }), link(n.url, n.title, true))));
    pn.actions.append(segmented([["all", "All"], ["Fed", "Fed"], ["ECB", "ECB"], ["BoE", "BoE"], ["BoJ", "BoJ"]], "all", draw, "Bank"));
    pn.body.append(list); draw("all");
    if (news.errors?.length) pn.foot.append(`Feeds unavailable this run: ${news.errors.join("; ")}`);
  } catch (e) { pn.body.append(errorBox(e.message)); }
}
