"""Parser tests against recorded/representative provider payloads (fixtures/).

fred_dgs10.json, nyfed_latest.json, mof.csv, coinbase.json are verbatim responses captured on
2026-10-10. The other fixtures reproduce the documented wire formats with values observed that day.
"""
import json
from pathlib import Path

from pipeline.providers import bis, boc, boe, bundesbank, coinbase, fiscaldata, fred, mof, nyfed, rss, treasury

F = Path(__file__).parent / "fixtures"


def test_fred_observations_skip_missing_dot():
    obs = fred.parse_observations(json.loads((F / "fred_dgs10.json").read_text()))
    assert obs == [("2026-10-08", 5.22), ("2026-10-07", 5.28)]


def test_fred_meta_extracts_copyright():
    meta = fred.parse_series_meta({"seriess": [{"title": "S&P 500", "units": "Index", "frequency": "Daily",
                                               "notes": "Copyright, 2026, S&P Dow Jones Indices LLC.\nOther text"}]})
    assert meta["title"] == "S&P 500" and "S&P Dow Jones" in meta["copyright"]


def test_nyfed_fields():
    p = json.loads((F / "nyfed_latest.json").read_text())
    assert nyfed.parse_ref_rates(p, "p99")[-1] == ("2026-10-08", 3.95) or ("2026-10-08", 3.89) in nyfed.parse_ref_rates(p, "p99")
    vols = dict(nyfed.parse_ref_rates(p, "volume"))
    assert vols["2026-10-08"] in (117.0, 2963.0)


def test_treasury_xml():
    rows = treasury.parse_curve_xml((F / "treasury.xml").read_text())
    assert rows["2026-10-09"]["10Y"] == 5.24 and rows["2026-10-09"]["6W"] == 4.13
    assert rows["2026-10-08"] == {"1M": 4.14, "10Y": 5.22}  # null 20Y skipped


def test_bundesbank_both_sdmx_flavours():
    assert bundesbank.parse_sdmx_ml((F / "bundesbank.xml").read_text()) == [
        ("2026-10-07", 3.55), ("2026-10-08", 3.57), ("2026-10-09", 3.53)]
    assert bundesbank.parse_sdmx_ml((F / "bundesbank_generic.xml").read_text()) == [("2026-10-09", 3.53)]


def test_boe_csv():
    out = boe.parse_csv((F / "boe.csv").read_text())
    assert out["IUDMNPY"][-1] == ("2026-10-07", 5.3852)
    assert len(out["IUDBEDR"]) == 4


def test_boe_csv_with_title_rows():
    out = boe.parse_csv("Bank of England\nSome title\n" + (F / "boe.csv").read_text())
    assert out["IUDBEDR"][0] == ("2026-10-02", 3.75)


def test_boc_valet():
    out = boc.parse_valet(json.loads((F / "boc.json").read_text()))
    assert out["V39079"][-1] == ("2026-10-08", 2.25)
    assert out["BD.CDN.10YR.DQ.YLD"][-1] == ("2026-10-07", 3.94)


def test_mof_csv_with_junk_lines():
    rows = mof.parse_csv((F / "mof.csv").read_bytes())
    assert rows["2026-10-08"]["10Y"] == 3.089 and rows["2026-10-08"]["40Y"] == 4.134
    assert set(rows) == {"2026-10-07", "2026-10-08"}


def test_bis_csv_label_columns():
    out = bis.parse_csv((F / "bis.csv").read_text())
    assert out["JP"] == [("2026-09-23", 1.0), ("2026-09-24", 1.25)]
    assert out["US"] == [("2026-10-06", 3.875)]


def test_coinbase_candles_sorted_close():
    obs = coinbase.parse_candles(json.loads((F / "coinbase.json").read_text()))
    assert [d for d, _ in obs] == sorted(d for d, _ in obs)
    assert obs[-1][1] == 82431.36


def test_rss_medium():
    items = rss.parse_feed((F / "medium.xml").read_bytes())
    assert items[0]["title"] == "Beyond the Headline Numbers"
    assert items[1]["categories"] == ["rates"] and items[1]["date"].startswith("2026-10-09")


def test_tga_close_computed_when_closing_row_null():
    obs = dict(fiscaldata.parse_tga(json.loads((F / "tga.json").read_text())["data"]))
    assert obs["2026-10-08"] == 885783 + 301352 - 299666
    assert obs["2021-01-04"] == 1700000
    assert "2020-01-02" not in obs


def test_fred_auto_fields():
    a = fred.auto_fields({"title": "Federal Funds Effective Rate", "units": "Percent", "frequency_short": "D"})
    assert a == {"name": "Federal Funds Effective Rate", "units": "%", "freq": "D", "change": "bp", "scale": 1.0}
    b = fred.auto_fields({"title": "Assets: Total Assets (DISCONTINUED)", "units": "Millions of U.S. Dollars", "frequency_short": "W"})
    assert b["units"] == "USD bn" and b["scale"] == 0.001 and b["name"] == "Assets: Total Assets" and b["freq"] == "W"
    c = fred.auto_fields({"units": "Index 1982-1984=100", "frequency_short": "M"})
    assert c["change"] == "pct" and c["freq"] == "M"
    d = fred.auto_fields({"units": "Percent Change from Preceding Period", "frequency_short": "Q"})
    assert d["units"] == "%" and d["change"] == "abs"
