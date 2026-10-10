// Global macro: sovereign yields and spreads across countries, euro-area inflation, FX vs USD.
import * as D from "../data.js";
import { el, panel } from "../ui.js";
import { header, chartPanel, seriesTable } from "./common.js";

export async function render(root, { go }) {
  const cat = await D.catalog();
  root.append(header("Global macro", "Daily government curves where verified sources exist (US, Germany, UK, Japan, Canada); monthly OECD averages via FRED for longer cross-country history."));
  const grid = el("div", { class: "grid3" });
  root.append(grid);
  grid.append(await chartPanel("10Y yields, daily", ["US_10Y", "DE_10Y", "UK_10Y", "JP_10Y", "CA_10Y"], { units: "%", range: "3Y", span: 2,
    labels: { US_10Y: "US", DE_10Y: "Germany", UK_10Y: "UK", JP_10Y: "Japan", CA_10Y: "Canada" } }));
  grid.append(await chartPanel("10Y spreads vs US", ["US_DE_10Y", "US_UK_10Y", "US_JP_10Y", "US_CA_10Y"], { units: "bp", range: "3Y", span: 1,
    labels: { US_DE_10Y: "US − DE", US_UK_10Y: "US − UK", US_JP_10Y: "US − JP", US_CA_10Y: "US − CA" } }));
  grid.append(await chartPanel("Euro-area sovereign spreads vs Bund (monthly)", ["IT_DE_10Y_M", "FR_DE_10Y_M"], { units: "bp", range: "10Y", span: 1, sub: "OECD monthly averages",
    labels: { IT_DE_10Y_M: "Italy − Germany", FR_DE_10Y_M: "France − Germany" } }));
  grid.append(await chartPanel("Inflation: US vs euro area", ["CPI_YOY", "EA_HICP_YOY"], { units: "%", range: "10Y", span: 1, labels: { CPI_YOY: "US CPI y/y", EA_HICP_YOY: "Euro area HICP y/y" },
    note: "UK CPI not shown: no verified current source (see Sources & status)." }));
  grid.append(await chartPanel("Bund curve: 2s10s", ["DE2S10S"], { units: "bp", range: "5Y", span: 1 }));
  const pt = panel("Global rates and FX", { span: 3 });
  pt.body.append(seriesTable(cat, [["10Y government (daily)", ["US_10Y", "DE_10Y", "UK_10Y", "JP_10Y", "CA_10Y"]],
    ["2Y government (daily)", ["US_2Y", "DE_2Y", "JP_2Y", "CA_2Y"]],
    ["10Y government (monthly avg, OECD)", ["DE10Y_M", "FR10Y_M", "IT10Y_M", "ES10Y_M", "UK10Y_M", "JP10Y_M", "CH10Y_M"]],
    ["FX vs USD (Fed H.10)", ["USD_BROAD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "USDCNY"]]], { go }));
  grid.append(pt.root);
}
