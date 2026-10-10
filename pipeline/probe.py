"""Source probe: one small representative call per provider; writes a JSON report.

    python -m pipeline.probe --out site/data/probe.json

Run it (or the "Probe data sources" workflow) after adding a provider or when a source looks
broken. It is the mechanical counterpart of docs/DATA_SOURCES.md.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import traceback
from pathlib import Path

from .providers import bis, boc, boe, bundesbank, coinbase, fiscaldata, fred, mof, nyfed, rss, treasury


def _last(obs):
    return obs[-1] if obs else None


def checks():
    today = dt.date.today()
    m = f"{today.year}{today.month:02d}"
    yield "fred", lambda: _last(fred.fetch_series("DGS10", start=(today - dt.timedelta(days=14)).isoformat(), with_meta=False).obs)
    yield "fred_release_calendar", lambda: len(fred.fetch_release_calendar(today.isoformat(), (today + dt.timedelta(days=14)).isoformat()))
    yield "nyfed", lambda: _last(nyfed.fetch_rate("SOFR", "p99", start=(today - dt.timedelta(days=10)).isoformat()).obs)
    yield "treasury_xml", lambda: sorted(treasury.fetch_curve(0, months=[m]).items())[-1]
    yield "fiscaldata_tga", lambda: _last(fiscaldata.fetch_tga((today - dt.timedelta(days=10)).isoformat()).obs)
    yield "fiscaldata_auctions", lambda: len(fiscaldata.fetch_auctions((today - dt.timedelta(days=10)).isoformat()))
    yield "bundesbank", lambda: sorted(bundesbank.fetch_curve((today - dt.timedelta(days=10)).isoformat()).items())[-1]
    yield "boe_csv", lambda: {k: _last(v) for k, v in boe.fetch(["IUDBEDR", "IUDMNPY"], today - dt.timedelta(days=14)).items()}
    yield "boc", lambda: {k: _last(v) for k, v in boc.fetch(["V39079", "BD.CDN.10YR.DQ.YLD"], (today - dt.timedelta(days=10)).isoformat()).items()}
    yield "mof_current", lambda: sorted(mof.parse_csv(__import__("pipeline.http", fromlist=["get"]).get(mof.CURRENT).content).items())[-1]
    yield "mof_history", lambda: len(mof.parse_csv(__import__("pipeline.http", fromlist=["get"]).get(mof.HISTORY).content))
    yield "bis", lambda: {k: _last(v) for k, v in bis.fetch(["US", "GB", "JP"], (today - dt.timedelta(days=20)).isoformat()).items()}
    yield "coinbase", lambda: _last(coinbase.fetch_daily("BTC-USD", today - dt.timedelta(days=5)).obs)
    yield "medium_rss", lambda: len(rss.fetch("https://medium.com/feed/@ishritt"))
    yield "fed_rss", lambda: len(rss.fetch("https://www.federalreserve.gov/feeds/press_monetary.xml"))
    # Not used by the site; probed so the decision can be revisited with evidence.
    yield "ecb_data_portal (unused)", lambda: __import__("pipeline.http", fromlist=["get"]).get(
        "https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y",
        params={"lastNObservations": 1, "format": "csvdata"}).text[-200:]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="site/data/probe.json")
    args = ap.parse_args(argv)
    report = {"run_at": dt.datetime.now(dt.timezone.utc).isoformat(), "results": {}}
    for name, fn in checks():
        if name.startswith("fred") and not os.environ.get("FRED_API_KEY"):
            report["results"][name] = {"ok": False, "error": "FRED_API_KEY not set"}
            continue
        try:
            report["results"][name] = {"ok": True, "sample": json.loads(json.dumps(fn(), default=str))}
        except Exception as exc:  # noqa: BLE001
            report["results"][name] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"[:400],
                                       "trace": traceback.format_exc()[-600:]}
        print(f"{'OK ' if report['results'][name]['ok'] else 'ERR'} {name}: "
              f"{report['results'][name].get('sample', report['results'][name].get('error'))}"[:220])
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
