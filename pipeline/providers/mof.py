"""Ministry of Finance Japan – JGB constant-maturity yields (CSV, no key).

Status: current-month file VERIFIED; history file PARTIALLY VERIFIED (not yet fetched in testing).
"""
from __future__ import annotations

import csv
import io

from ..http import get, FetchError

CURRENT = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv"
HISTORY = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv"
KEEP = ["1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y", "40Y"]


def _date(s: str) -> str | None:
    parts = s.strip().replace("-", "/").split("/")
    if len(parts) != 3 or not parts[0].isdigit():
        return None  # history file uses Japanese-era dates in some versions; skip unparseable rows
    y, m, d = (int(p) for p in parts)
    return f"{y:04d}-{m:02d}-{d:02d}"


def parse_csv(raw: bytes) -> dict[str, dict[str, float]]:
    text = raw.decode("utf-8", errors="replace")
    lines = text.splitlines()
    start = next((i for i, ln in enumerate(lines) if ln.startswith("Date")), None)
    if start is None:
        raise ValueError("MoF CSV: header not found")
    rdr = csv.reader(io.StringIO("\n".join(lines[start:])))
    header = next(rdr)
    out: dict[str, dict[str, float]] = {}
    for row in rdr:
        if not row:
            continue
        d = _date(row[0])
        if not d:
            continue
        vals = {}
        for h, v in zip(header[1:], row[1:]):
            if h in KEEP and v.strip() not in ("", "-"):
                try:
                    vals[h] = float(v)
                except ValueError:
                    pass
        if vals:
            out[d] = vals
    return out


def fetch_curve(include_history: bool) -> tuple[dict[str, dict[str, float]], list[str]]:
    notes = []
    out: dict[str, dict[str, float]] = {}
    if include_history:
        try:
            out.update(parse_csv(get(HISTORY).content))
        except (FetchError, ValueError) as exc:
            notes.append(f"history file unavailable: {exc}")
    out.update(parse_csv(get(CURRENT).content))
    return out, notes
