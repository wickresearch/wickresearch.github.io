// Markets: end-of-day cross-asset table with drill-down, plus an explicit list of what is not covered.
import * as D from "../data.js";
import { el, panel } from "../ui.js";
import { seriesTable, header } from "./common.js";

export const GROUPS = [
  ["US Treasuries & curve", ["UST3M", "UST2Y", "UST5Y", "UST10Y", "UST30Y", "US2S10S", "US5S30S", "US3M10Y", "TIPS10Y", "BE10Y", "UST10Y_RVOL"]],
  ["Global 10Y government yields", ["DE_10Y", "UK_10Y", "JP_10Y", "CA_10Y", "US_DE_10Y"]],
  ["Equities", ["SPX", "NASDAQ", "DJIA", "NIKKEI"]],
  ["Volatility", ["VIX", "GVZ", "OVX"]],
  ["Dollar & FX", ["USD_BROAD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "USDCNY"]],
  ["Commodities", ["WTI", "BRENT", "HENRY_HUB", "COPPER", "GOLD_PROXY"]],
  ["Digital assets", ["BTC", "ETH"]],
  ["Credit", ["HY_OAS", "IG_OAS"]],
];

export async function render(root, { go }) {
  const cat = await D.catalog();
  root.append(header("Markets", "End-of-day closes and latest published fixes. Badges: EOD = daily close, PUB = official published, PROXY = substitute instrument, CALC = derived. Click a row for history."));
  const p = panel("Cross-asset monitor", { span: 3 });
  p.body.append(seriesTable(cat, GROUPS, { go }));
  p.foot.append("Changes: yields and spreads in bp, prices in %. '1D / prior' compares with the previous observation. FX: H.10 noon buying rates in New York (Fed). Copper is a monthly average.");
  root.append(p.root);
  const nc = panel("Not covered, and why", { span: 3 });
  nc.body.append(el("div", { class: "notcovered" },
    el("p", {}, el("strong", { text: "European and other Asian equity indices (DAX, FTSE 100, Euro STOXX 50, Hang Seng, Shanghai): " }), "no free source that is both verified and licensed for redistribution was found. FRED no longer carries them."),
    el("p", {}, el("strong", { text: "Spot gold and silver (LBMA): " }), "discontinued on FRED. Gold is shown through PAX Gold (PAXG-USD), a token backed by LBMA gold, labelled as a proxy. It can deviate from spot. Silver is not shown."),
    el("p", {}, el("strong", { text: "MOVE index, ICE DXY, CME futures (SOFR, fed funds): " }), "proprietary or licensed. Substitutes: realised 10Y yield volatility, the Fed's broad dollar index, and the T-bill forward proxy in Front end & Fed."),
    el("p", {}, el("strong", { text: "Real-time quotes: " }), "the site is rebuilt on a schedule (see Sources & status). Nothing on it is live.")));
  root.append(nc.root);
}
