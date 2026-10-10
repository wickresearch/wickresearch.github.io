"""Bank of England Interactive Statistical Database (IADB), CSV export (no key).

Status: PARTIALLY VERIFIED – data confirmed via the HTML view on 2026-10-10; the CSV
format parsed here is confirmed by the probe workflow on first run (docs/DATA_SOURCES.md).
"""
from __future__ import annotations

import csv
import datetime as dt
import io

from ..http import get

URL = "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp"
CURVE = {"5Y": "IUDSNPY", "10Y": "IUDMNPY", "20Y": "IUDLNPY"}
BANK_RATE = "IUDBEDR"


def _parse_date(s: str) -> str | None:
    s = s.strip()
    for fmt in ("%d %b %Y", "%d %b %y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_csv(text: str) -> dict[str, list[tuple[str, float]]]:
    """Return {series_code: [(date, value)]}. Tolerates title rows before the header."""
    lines = text.splitlines()
    start = next((i for i, ln in enumerate(lines) if ln.upper().startswith("DATE")), None)
    if start is None:
        raise ValueError("BoE CSV: no DATE header found")
    reader = csv.reader(io.StringIO("\n".join(lines[start:])))
    header = [h.strip() for h in next(reader)]
    out: dict[str, list] = {h: [] for h in header[1:]}
    for row in reader:
        if not row:
            continue
        d = _parse_date(row[0])
        if not d:
            continue
        for h, v in zip(header[1:], row[1:]):
            v = v.strip()
            if v and v.lower() not in ("n/a", "..", "."):
                try:
                    out[h].append((d, float(v)))
                except ValueError:
                    pass
    return {k: sorted(v) for k, v in out.items()}


def fetch(codes: list[str], start: dt.date) -> dict[str, list[tuple[str, float]]]:
    params = {"csv.x": "yes", "Datefrom": start.strftime("%d/%b/%Y"), "Dateto": "now",
              "SeriesCodes": ",".join(codes), "CSVF": "TN", "UsingCodes": "Y", "VPD": "Y", "VFD": "N"}
    r = get(URL, params=params, headers={"Accept": "text/csv,text/plain,*/*",
                                         "Referer": "https://www.bankofengland.co.uk/boeapps/database/"})
    return parse_csv(r.text)
