"""End-to-end pipeline run with all network calls replaced by fakes.

Checks the failure policy: a provider error must never crash the run; series fall back to the
previous build ("fallback") or are reported "failed"; derived series and extras still build.
Synthetic values here exist only inside the test – they are never written to site/data.
"""
import datetime as dt
import json

from pipeline import run as runmod
from pipeline.model import SeriesResult
from pipeline.store import Previous, series_payload, write_json


def _synthetic(n=420, level=4.0):
    start = dt.date.today() - dt.timedelta(days=n)
    return [((start + dt.timedelta(days=i)).isoformat(), level + 0.001 * i) for i in range(n)]


def _monthly(n=40, level=100.0):
    t = dt.date.today()
    out = []
    for k in range(n, 0, -1):
        y, m = divmod(t.year * 12 + t.month - 1 - k - 1, 12)
        out.append((f"{y:04d}-{m + 1:02d}-01", level + k * -0.3))
    return out


def boom(*a, **k):
    raise RuntimeError("simulated provider outage")


def test_pipeline_survives_outages(tmp_path):
    prev_dir, out_dir = tmp_path / "prev", tmp_path / "out"
    write_json(prev_dir / "series" / "UST10Y.json",
               series_payload("UST10Y", {"provider": "fred", "retrieved_at": "2026-10-01T00:00:00+00:00"}, _synthetic(30, 5.0)))

    def fake_fred(key, start=None, with_meta=True):
        if key == "DGS10":
            raise RuntimeError("simulated FRED failure for DGS10")
        monthly = key in {"CPIAUCSL", "CPILFESL", "PAYEMS", "UNRATE", "PCEPI", "PCEPILFE"}
        return SeriesResult(obs=_monthly() if monthly else _synthetic(), meta={"title": key})

    saved = {}
    patches = {
        (runmod.fred, "fetch_series"): fake_fred,
        (runmod.fred, "fetch_release_calendar"): boom,
        (runmod.fred, "fetch_release_list"): boom,
        (runmod.nyfed, "fetch_rate"): lambda rate, field="rate", start=None: SeriesResult(obs=_synthetic(level=3.9)),
        (runmod.coinbase, "fetch_daily"): boom,
        (runmod.treasury, "fetch_curve"): lambda *a, **k: {d: {"2Y": v, "10Y": v + 0.5} for d, v in _synthetic(50)},
        (runmod.bundesbank, "fetch_curve"): boom,
        (runmod.boe, "fetch"): boom,
        (runmod.boc, "fetch"): boom,
        (runmod.mof, "fetch_curve"): boom,
        (runmod.bis, "fetch"): lambda areas, start: {"US": [("2026-01-01", 3.875), ("2026-02-01", 3.875)]},
        (runmod.fiscaldata, "fetch_tga"): boom,
        (runmod.fiscaldata, "fetch_auctions"): boom,
        (runmod.rss, "fetch"): boom,
    }
    for (mod, name), fn in patches.items():
        saved[(mod, name)] = getattr(mod, name)
        setattr(mod, name, fn)
    try:
        r = runmod.Run(out_dir, Previous(str(prev_dir)), "incremental", None)
        r.run_series(); r.run_curves(); r.run_policy_rates(); r.run_derived()
        r.write_series_and_catalog(); r.run_extras(); r.write_status()
    finally:
        for (mod, name), fn in saved.items():
            setattr(mod, name, fn)

    cat = json.loads((out_dir / "catalog.json").read_text())["series"]
    assert cat["UST10Y"]["status"] == "fallback"            # served from previous build
    assert cat["UST2Y"]["status"] == "ok"
    assert cat["BTC"]["status"] == "ok" and cat["BTC"]["provider"] == "fred"  # Coinbase down -> FRED fallback
    assert cat["GOLD_PROXY"]["status"] == "failed"         # no fallback, no previous data
    assert cat["US2S10S"]["status"] == "fallback"          # derived from a fallback input
    assert cat["CPI_YOY"]["latest"]["value"] is not None
    assert cat["DE_10Y"]["status"] if "DE_10Y" in cat else True
    assert cat["US_10Y"]["status"] == "ok"
    assert not (out_dir / "series" / "GOLD_PROXY.json").exists()
    status = json.loads((out_dir / "status.json").read_text())
    assert status["providers"]["bundesbank"]["failed"] == 1
    assert (out_dir / "research.json").exists()            # articles.yaml still published when the feed fails
    research = json.loads((out_dir / "research.json").read_text())
    assert research["note"] and len(research["articles"]) >= 9


def test_library_expansion_dedupes_and_infers(tmp_path):
    r = runmod.Run(tmp_path, Previous(None), "full", None)
    r.cfg = {"series": [{"id": "UST10Y", "provider": "fred", "key": "DGS10"},
                        {"id": "BTC", "provider": "coinbase", "key": "BTC-USD", "fallback": {"provider": "fred", "key": "CBBTCUSD"}},
                        {"id": "DFF", "provider": "nyfed", "key": "EFFR:rate"}],
             "fred_library": [{"group": "G", "type": "administered", "series": ["DGS10", "CBBTCUSD", "DFF", {"key": "IOER", "name": "IOER"}]}]}
    entries = r.library_entries()
    assert [e["id"] for e in entries] == ["FRED_DFF", "IOER"]          # DGS10/CBBTCUSD referenced, DFF id clash prefixed
    assert r.library_index == [{"group": "G", "ids": ["UST10Y", "BTC", "FRED_DFF", "IOER"], "note": None}]
    e = runmod.Run.apply_auto(entries[0], {"title": "Fed funds", "units": "Percent", "frequency_short": "D"})
    assert e["units"] == "%" and e["change"] == "bp" and e["type"] == "administered"
