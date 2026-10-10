// Liquidity & funding: Fed balance sheet, reserves, TGA, ON RRP, repo spreads, financial conditions, Treasury auctions.
import * as D from "../data.js";
import * as F from "../fmt.js";
import { el, panel, errorBox, link } from "../ui.js";
import { header, tiles, chartPanel, formula, seriesTable } from "./common.js";

export async function render(root, { go }) {
  const cat = await D.catalog();
  root.append(header("Liquidity & funding", "US reserve supply and money-market conditions. H.4.1 data are weekly (Wednesday levels or week averages); the TGA is also shown daily from the Daily Treasury Statement."));
  root.append(tiles(cat, [["FED_ASSETS", "Fed assets"], ["FED_UST", "Fed Treasuries"], ["RESERVES", "Reserves"], ["TGA_D", "TGA (daily)"], ["ONRRP", "ON RRP"],
    ["NET_LIQ", "Net liquidity proxy"], ["SOFR_IORB", "SOFR − IORB"], ["SOFR99_IORB", "SOFR p99 − IORB"], ["NFCI", "NFCI"]]));
  const grid = el("div", { class: "grid3" });
  root.append(grid);

  grid.append(await chartPanel("Net liquidity proxy", ["NET_LIQ"], { units: "USD bn", range: "5Y", span: 2, sub: "Fed total assets − TGA − ON RRP (Wednesday levels)",
    note: "A widely used shorthand, not an official measure of market liquidity. It ignores, for example, the composition of reserves, foreign repo and the distribution of reserves across banks." }));
  const pf = panel("Definition", { span: 1 });
  pf.body.append(formula("Net liquidity = WALCL − WTREGEN − RRPONTSYD"),
    el("dl", { class: "kv" }, el("dt", { text: "WALCL" }), el("dd", { text: "Fed total assets, Wednesday level, USD mn → bn" }),
      el("dt", { text: "WTREGEN" }), el("dd", { text: "Treasury General Account, Wednesday level, USD mn → bn" }),
      el("dt", { text: "RRPONTSYD" }), el("dd", { text: "ON RRP take-up, daily, USD bn; value on (or last before) each Wednesday" }),
      el("dt", { text: "Frequency" }), el("dd", { text: "Weekly (Thursday H.4.1 release)" })),
    el("p", { class: "note", text: "Read the components directly as well: reserves are the quantity banks actually hold, and the TGA and ON RRP are the main swing factors on the Fed's liability side." }));
  grid.append(pf.root);
  grid.append(await chartPanel("Balance-sheet components", ["FED_ASSETS", "RESERVES", "TGA_W", "ONRRP"], { units: "USD bn", range: "5Y", span: 2,
    labels: { FED_ASSETS: "Total assets", RESERVES: "Reserves (week avg)", TGA_W: "TGA (Wed)", ONRRP: "ON RRP" } }));
  grid.append(await chartPanel("TGA, daily", ["TGA_D"], { units: "USD bn", range: "1Y", span: 1, sub: "Daily Treasury Statement closing balance", note: "Computed as opening balance + deposits − withdrawals (DTS Table I/II)." }));
  grid.append(await chartPanel("Money-market spreads", ["SOFR_IORB", "SOFR99_IORB", "EFFR_IORB", "TGCR_RRP"], { units: "bp", range: "1Y", span: 2,
    sub: "bp. Rising repo rates relative to IORB signal scarcer reserves or collateral pressure",
    labels: { SOFR_IORB: "SOFR − IORB", SOFR99_IORB: "SOFR p99 − IORB", EFFR_IORB: "EFFR − IORB", TGCR_RRP: "TGCR − ON RRP rate" } }));
  grid.append(await chartPanel("SOFR volume", ["SOFR_VOL"], { units: "USD bn", range: "3Y", span: 1, sub: "NY Fed, daily" }));
  grid.append(await chartPanel("Financial conditions: Chicago Fed NFCI", ["NFCI"], { range: "10Y", span: 1, sub: "Positive = tighter than average. Model estimate." }));
  grid.append(await chartPanel("St. Louis Fed Financial Stress Index", ["STLFSI"], { range: "10Y", span: 1, sub: "0 = normal. Model estimate." }));
  grid.append(await chartPanel("Credit spreads", ["HY_OAS", "IG_OAS"], { units: "%", range: "MAX", span: 1, sub: "ICE BofA option-adjusted spreads", note: "FRED shows only about three years of ICE history under its licence." }));

  const pa = panel("Treasury auctions", { sub: "Recent results and announced auctions (FiscalData)", span: 3 });
  grid.append(pa.root);
  try {
    const a = await D.json("auctions.json");
    const rows = a.items.slice(0, 40);
    pa.body.append(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ["Auction", "Security", "Term", "Offering", "High yield / rate", "Bid-to-cover"].map((h, k) => el("th", { class: k >= 3 ? "r" : "", text: h })))),
      el("tbody", {}, rows.map((r) => el("tr", {}, el("td", { class: "num", text: F.date(r.auction_date) }), el("td", { text: r.security_type }), el("td", { text: r.security_term }),
        el("td", { class: "r num", text: r.offering_amt ? `$${(r.offering_amt / 1e9).toFixed(0)}bn` : "—" }),
        el("td", { class: "r num", text: r.high_yield != null ? r.high_yield.toFixed(3) + "%" : r.high_investment_rate != null ? r.high_investment_rate.toFixed(3) + "%" : r.high_discnt_rate != null ? r.high_discnt_rate.toFixed(3) + "% (disc.)" : "pending" }),
        el("td", { class: "r num", text: r.bid_to_cover_ratio != null ? r.bid_to_cover_ratio.toFixed(2) : "—" })))))));
    pa.foot.append("Source: ", link(a.url, "U.S. Treasury FiscalData", true), ". Results fields are empty until the auction closes.");
  } catch (e) { pa.body.append(errorBox(e.message)); }

  const pt = panel("All liquidity series", { span: 3 });
  pt.body.append(seriesTable(cat, [["", ["FED_ASSETS", "FED_UST", "FED_MBS", "RESERVES", "TGA_W", "TGA_D", "ONRRP", "NET_LIQ", "M2", "SOFR_IORB", "SOFR99_IORB", "EFFR_IORB", "TGCR_RRP", "NFCI", "STLFSI", "HY_OAS", "IG_OAS"]]], { go }));
  grid.append(pt.root);
}
