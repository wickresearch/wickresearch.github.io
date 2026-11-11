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
  root.append(header("Markets", "Cross-asset closes and fixes"));
  const p = panel("Cross-asset monitor", { span: 3 });
  p.body.append(seriesTable(cat, GROUPS, { go }));
  root.append(p.root);
}
