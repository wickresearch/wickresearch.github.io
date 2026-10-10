"""US Treasury FiscalData API (no key). Docs: https://fiscaldata.treasury.gov/api-documentation/"""
from __future__ import annotations

from collections import defaultdict

from ..http import get
from ..model import SeriesResult

BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service"


def _num(x):
    try:
        return float(str(x).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _paged(path: str, params: dict, max_pages: int = 20) -> list[dict]:
    rows, page = [], 1
    while page <= max_pages:
        p = dict(params, **{"page[number]": page, "page[size]": 10000})
        js = get(f"{BASE}/{path}", params=p).json()
        rows += js.get("data", [])
        total = (js.get("meta") or {}).get("total-pages") or 1
        if page >= total:
            break
        page += 1
    return rows


def parse_tga(rows: list[dict]) -> list[tuple[str, float]]:
    """Daily TGA closing balance in USD millions.

    Since the 2021 DTS redesign the closing-balance row is often null, so we compute
    close = opening + total deposits − total withdrawals (all from the same day's statement).
    If a populated closing-balance row exists we use it instead.
    """
    by_date: dict[str, dict[str, float]] = defaultdict(dict)
    for r in rows:
        t = (r.get("account_type") or "").lower()
        d = r.get("record_date")
        if not d or "tga" not in t and "treasury general account" not in t:
            continue
        if "closing balance" in t:
            v = _num(r.get("close_today_bal")) or _num(r.get("open_today_bal"))
            if v is not None:
                by_date[d]["close"] = v
        elif "opening balance" in t:
            v = _num(r.get("open_today_bal"))
            if v is not None:
                by_date[d]["open"] = v
        elif "deposits" in t:
            v = _num(r.get("open_today_bal"))
            if v is not None:
                by_date[d]["dep"] = v
        elif "withdrawals" in t:
            v = _num(r.get("open_today_bal"))
            if v is not None:
                by_date[d]["wd"] = v
    out = []
    for d, x in sorted(by_date.items()):
        if "close" in x:
            out.append((d, x["close"]))
        elif {"open", "dep", "wd"} <= x.keys():
            out.append((d, x["open"] + x["dep"] - x["wd"]))
    return out


def fetch_tga(start: str = "2015-01-01") -> SeriesResult:
    rows = _paged("v1/accounting/dts/operating_cash_balance",
                  {"filter": f"record_date:gte:{start}", "sort": "record_date"})
    return SeriesResult(obs=parse_tga(rows), meta={"title": "Treasury General Account closing balance (DTS)",
                                                   "units": "USD millions"})


AUCTION_FIELDS = ["auction_date", "issue_date", "security_type", "security_term", "cusip",
                  "offering_amt", "high_yield", "high_discnt_rate", "high_investment_rate",
                  "bid_to_cover_ratio", "total_accepted", "maturity_date"]


def fetch_auctions(start: str) -> list[dict]:
    """Recent and announced auctions. Unknown fields are simply absent (API returns all fields)."""
    js = get(f"{BASE}/v1/accounting/od/auctions_query",
             params={"filter": f"auction_date:gte:{start}", "sort": "-auction_date", "page[size]": 500}).json()
    out = []
    for r in js.get("data", []):
        row = {k: r.get(k) for k in AUCTION_FIELDS if k in r}
        for k in ("offering_amt", "high_yield", "high_discnt_rate", "high_investment_rate",
                  "bid_to_cover_ratio", "total_accepted"):
            if k in row:
                row[k] = _num(row[k])
        out.append(row)
    return out
