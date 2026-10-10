"""NY Fed Markets Data API (no key). Docs: https://markets.newyorkfed.org/static/docs/markets-api.html

Reference rates come with distribution percentiles and volumes, which the liquidity module
uses (e.g. SOFR 99th percentile minus IORB as a funding-stress gauge).
"""
from __future__ import annotations

from ..http import get
from ..model import SeriesResult

BASE = "https://markets.newyorkfed.org/api"
PATHS = {  # rate type -> API path segment
    "SOFR": "secured/sofr", "TGCR": "secured/tgcr", "BGCR": "secured/bgcr",
    "EFFR": "unsecured/effr", "OBFR": "unsecured/obfr",
}
FIELDS = {"rate": "percentRate", "p1": "percentPercentile1", "p25": "percentPercentile25",
          "p75": "percentPercentile75", "p99": "percentPercentile99", "volume": "volumeInBillions"}


def parse_ref_rates(payload: dict, field: str) -> list[tuple[str, float]]:
    key = FIELDS[field]
    out = []
    for r in payload.get("refRates", []):
        v = r.get(key)
        if v in (None, ""):
            continue
        try:
            out.append((r["effectiveDate"], float(v)))
        except (KeyError, ValueError):
            continue
    return sorted(out)


_cache: dict[tuple, dict] = {}


def fetch_rate(rate: str, field: str = "rate", start: str = "2018-04-02", end: str | None = None) -> SeriesResult:
    import datetime as dt
    end = end or dt.date.today().isoformat()
    ck = (rate, start, end)
    if ck not in _cache:  # one HTTP call serves all fields of the same rate
        _cache[ck] = get(f"{BASE}/rates/{PATHS[rate]}/search.json",
                         params={"startDate": start, "endDate": end}).json()
    return SeriesResult(obs=parse_ref_rates(_cache[ck], field),
                        meta={"title": f"{rate} ({field})"})
