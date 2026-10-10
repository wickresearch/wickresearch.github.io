"""FRED API (St. Louis Fed). Requires FRED_API_KEY. Docs: https://fred.stlouisfed.org/docs/api/fred/"""
from __future__ import annotations

import os
import time

from ..http import get
from ..model import SeriesResult

BASE = "https://api.stlouisfed.org/fred"
_PAUSE = 0.6  # stay well under the documented 120 requests/minute


def api_key() -> str:
    key = os.environ.get("FRED_API_KEY", "").strip()
    if not key:
        raise RuntimeError("FRED_API_KEY is not set (GitHub secret or local .env)")
    return key


def _call(path: str, **params) -> dict:
    params.update(api_key=api_key(), file_type="json")
    time.sleep(_PAUSE)
    return get(f"{BASE}/{path}", params=params).json()


def parse_observations(payload: dict) -> list[tuple[str, float]]:
    out = []
    for o in payload.get("observations", []):
        v = o.get("value")
        if v in (None, "", "."):  # FRED uses "." for missing
            continue
        try:
            out.append((o["date"], float(v)))
        except (KeyError, ValueError):
            continue
    return out


def parse_series_meta(payload: dict) -> dict:
    s = (payload.get("seriess") or [{}])[0]
    notes = s.get("notes") or ""
    # Keep only the copyright/licensing sentence(s) – they matter for public display.
    copyright_lines = [ln.strip() for ln in notes.splitlines()
                       if any(w in ln.lower() for w in ("copyright", "©", "permission", "licen"))]
    return {
        "title": s.get("title"),
        "units": s.get("units"),
        "frequency": s.get("frequency"),
        "frequency_short": s.get("frequency_short"),
        "units_short": s.get("units_short"),
        "seasonal_adjustment": s.get("seasonal_adjustment_short"),
        "last_updated": s.get("last_updated"),
        "observation_start": s.get("observation_start"),
        "observation_end": s.get("observation_end"),
        "copyright": " ".join(copyright_lines)[:400] or None,
    }


def fetch_series(series_id: str, start: str | None = None, with_meta: bool = True) -> SeriesResult:
    params = {"series_id": series_id}
    if start:
        params["observation_start"] = start
    obs = parse_observations(_call("series/observations", **params))
    meta = parse_series_meta(_call("series", series_id=series_id)) if with_meta else {}
    return SeriesResult(obs=obs, meta=meta)


def fetch_release_calendar(start: str, end: str) -> list[dict]:
    """Scheduled release dates (including future dates) between start and end."""
    payload = _call("releases/dates", realtime_start=start, realtime_end=end,
                    include_release_dates_with_no_data="true", sort_order="asc", limit=1000)
    return [{"release_id": r.get("release_id"), "name": r.get("release_name"), "date": r.get("date")}
            for r in payload.get("release_dates", [])]


def fetch_release_list() -> list[dict]:
    payload = _call("releases", limit=1000)
    return [{"id": r["id"], "name": r["name"], "link": r.get("link")} for r in payload.get("releases", [])]


def fetch_release_history(release_id: int) -> list[str]:
    """All historical publication dates of a release (used for event studies, avoids look-ahead)."""
    payload = _call("release/dates", release_id=release_id, sort_order="asc", limit=10000,
                    include_release_dates_with_no_data="false")
    return [r["date"] for r in payload.get("release_dates", [])]


def auto_fields(pm: dict) -> dict:
    """Display fields for a FRED series inferred from its own metadata (used by the FRED library,
    where a series is configured by ID only). Explicit config always overrides these."""
    import re
    pm = pm or {}
    units = (pm.get("units") or "").strip()
    u = units.lower()
    fs = (pm.get("frequency_short") or (pm.get("frequency") or "D")[:1] or "D").upper()
    freq = {"D": "D", "W": "W", "BW": "W", "M": "M", "Q": "Q", "SA": "A", "A": "A"}.get(fs, fs[:1])
    scale = 1.0
    if u.startswith("percent") and "change" not in u:
        out_u, change = "%", "bp"
    elif u.startswith("percent"):
        out_u, change = "%", "abs"            # % change series: show changes in pp
    elif u.startswith("basis points"):
        out_u, change = "bp", "abs"
    elif u.startswith("billions of chained"):
        out_u, change = "USD bn (real)", "pct"
    elif u.startswith("billions of dollars") or u.startswith("billions of u.s. dollars"):
        out_u, change = "USD bn", "abs"
    elif u.startswith("millions of dollars") or u.startswith("millions of u.s. dollars"):
        out_u, change, scale = "USD bn", "abs", 0.001
    elif u.startswith("thousands"):
        out_u, change = "thousands", "abs"
    elif u.startswith("index"):
        out_u, change = "index", "pct"
    elif "dollars per" in u or "to one" in u or u.startswith("u.s. dollars"):
        out_u, change = units[:40], "pct"
    else:
        out_u, change = units[:40] or "", "abs"
    name = re.sub(r"\s*\(DISCONTINUED\)", "", pm.get("title") or "").strip()
    return {"name": name, "units": out_u, "freq": freq, "change": change, "scale": scale}
