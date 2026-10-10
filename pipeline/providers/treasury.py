"""US Treasury daily par yield curve (XML/Atom feed, no key)."""
from __future__ import annotations

import datetime as dt
import xml.etree.ElementTree as ET

from ..http import get

URL = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml"

# Feed field -> tenor label used throughout the site. Order = curve order.
TENORS = [("BC_1MONTH", "1M"), ("BC_1_5MONTH", "6W"), ("BC_2MONTH", "2M"), ("BC_3MONTH", "3M"),
          ("BC_4MONTH", "4M"), ("BC_6MONTH", "6M"), ("BC_1YEAR", "1Y"), ("BC_2YEAR", "2Y"),
          ("BC_3YEAR", "3Y"), ("BC_5YEAR", "5Y"), ("BC_7YEAR", "7Y"), ("BC_10YEAR", "10Y"),
          ("BC_20YEAR", "20Y"), ("BC_30YEAR", "30Y")]


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_curve_xml(text: str) -> dict[str, dict[str, float]]:
    """Return {date: {tenor: yield}} from the Atom feed. Namespace-agnostic."""
    root = ET.fromstring(text)
    out: dict[str, dict[str, float]] = {}
    for props in root.iter():
        if _local(props.tag) != "properties":
            continue
        fields = {_local(c.tag): (c.text or "").strip() for c in props}
        d = fields.get("NEW_DATE", "")[:10]
        if not d:
            continue
        row = {}
        for f, label in TENORS:
            v = fields.get(f)
            if v:
                try:
                    row[label] = float(v)
                except ValueError:
                    pass
        if row:
            out[d] = row
    return out


def fetch_curve(start_year: int, end_year: int | None = None, months: list[str] | None = None):
    """Fetch by month list (incremental, e.g. ['202610']) or by year range (bootstrap)."""
    out: dict[str, dict[str, float]] = {}
    if months:
        for m in months:
            r = get(URL, params={"data": "daily_treasury_yield_curve", "field_tdr_date_value_month": m})
            out.update(parse_curve_xml(r.text))
    else:
        for y in range(start_year, (end_year or dt.date.today().year) + 1):
            r = get(URL, params={"data": "daily_treasury_yield_curve", "field_tdr_date_value": str(y)})
            out.update(parse_curve_xml(r.text))
    return out
