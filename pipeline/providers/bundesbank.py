"""Deutsche Bundesbank statistics API (no key): Svensson zero-coupon yields on listed Federal securities."""
from __future__ import annotations

import xml.etree.ElementTree as ET

from ..http import get

BASE = "https://api.statistiken.bundesbank.de/rest/data/BBSIS"
TENORS = {"1Y": "R01XX", "2Y": "R02XX", "3Y": "R03XX", "5Y": "R05XX", "7Y": "R07XX",
          "10Y": "R10XX", "15Y": "R15XX", "20Y": "R20XX", "30Y": "R30XX"}


def series_key(code: str) -> str:
    return f"D.I.ZST.ZI.EUR.S1311.B.A604.{code}.R.A.A._Z._Z.A"


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_sdmx_ml(text: str) -> list[tuple[str, float]]:
    """Parse SDMX-ML (generic or structure-specific) observations into [(date, value)]."""
    root = ET.fromstring(text)
    out = []
    for obs in root.iter():
        if _local(obs.tag) != "Obs":
            continue
        d = obs.attrib.get("TIME_PERIOD")
        v = obs.attrib.get("OBS_VALUE")
        if d is None or v is None:  # generic format uses child elements
            for c in obs:
                n = _local(c.tag)
                if n == "ObsDimension":
                    d = c.attrib.get("value")
                elif n == "ObsValue":
                    v = c.attrib.get("value")
        if d and v not in (None, "", "NaN", "."):
            try:
                out.append((d[:10], float(v)))
            except ValueError:
                pass
    return sorted(out)


def fetch_curve(start: str) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for label, code in TENORS.items():
        r = get(f"{BASE}/{series_key(code)}", params={"startPeriod": start},
                headers={"Accept": "application/vnd.sdmx.structurespecificdata+xml;version=2.1, application/xml"})
        for d, v in parse_sdmx_ml(r.text):
            out.setdefault(d, {})[label] = v
    return out
