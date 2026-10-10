"""Bank of Canada Valet API (no key). Docs: https://www.bankofcanada.ca/valet/docs"""
from __future__ import annotations

from ..http import get

BASE = "https://www.bankofcanada.ca/valet/observations"
CURVE = {"2Y": "BD.CDN.2YR.DQ.YLD", "5Y": "BD.CDN.5YR.DQ.YLD", "10Y": "BD.CDN.10YR.DQ.YLD",
         "Long": "BD.CDN.LONG.DQ.YLD"}
POLICY = "V39079"


def parse_valet(payload: dict) -> dict[str, list[tuple[str, float]]]:
    out: dict[str, list] = {}
    for row in payload.get("observations", []):
        d = row.get("d")
        for k, cell in row.items():
            if k == "d" or not isinstance(cell, dict):
                continue
            v = cell.get("v")
            if v in (None, ""):
                continue
            try:
                out.setdefault(k, []).append((d, float(v)))
            except ValueError:
                pass
    return {k: sorted(v) for k, v in out.items()}


def fetch(codes: list[str], start: str) -> dict[str, list[tuple[str, float]]]:
    return parse_valet(get(f"{BASE}/{','.join(codes)}/json", params={"start_date": start}).json())
