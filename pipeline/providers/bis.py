"""BIS Data Portal – central bank policy rates (WS_CBPOL), SDMX REST v1, CSV (no key)."""
from __future__ import annotations

import csv
import io

from ..http import get

URL = "https://stats.bis.org/api/v1/data/WS_CBPOL/D.{areas}/all"


def _col(header: list[str], name: str) -> int:
    for i, h in enumerate(header):
        if h == name or h.startswith(name + ":") or h.split(":")[0].strip() == name:
            return i
    raise ValueError(f"BIS CSV: column {name} not found in {header[:12]}")


def parse_csv(text: str) -> dict[str, list[tuple[str, float]]]:
    rdr = csv.reader(io.StringIO(text))
    header = next(rdr)
    ia, it, iv = _col(header, "REF_AREA"), _col(header, "TIME_PERIOD"), _col(header, "OBS_VALUE")
    out: dict[str, list] = {}
    for row in rdr:
        if len(row) <= max(ia, it, iv):
            continue
        area = row[ia].split(":")[0].strip()
        v = row[iv].strip()
        if not v or v == "NaN":
            continue
        try:
            out.setdefault(area, []).append((row[it][:10], float(v)))
        except ValueError:
            pass
    return {k: sorted(v) for k, v in out.items()}


def fetch(areas: list[str], start: str) -> dict[str, list[tuple[str, float]]]:
    r = get(URL.format(areas="+".join(areas)), params={"startPeriod": start, "format": "csv"})
    return parse_csv(r.text)
