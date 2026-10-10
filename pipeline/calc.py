"""Pure calculation helpers (no I/O). Covered by pipeline/tests/test_calc.py.

Conventions
-----------
* A series is a list of (ISO date, float) sorted ascending, no duplicate dates.
* "As-of" joins never look forward: the value used for date d is the latest observation on or
  before d (within a tolerance), which avoids look-ahead in derived series.
"""
from __future__ import annotations

import bisect
import datetime as dt
import math
from typing import Iterable

Obs = list[tuple[str, float]]


def D(s: str) -> dt.date:
    return dt.date.fromisoformat(s[:10])


# ------------------------------------------------------------------ cleaning
def clean(obs: Iterable[tuple[str, float]]) -> Obs:
    """Sort, drop non-finite values, de-duplicate dates (last value wins)."""
    m: dict[str, float] = {}
    for d, v in obs:
        if v is None or not isinstance(v, (int, float)) or not math.isfinite(v):
            continue
        m[str(d)[:10]] = float(v)
    return sorted(m.items())


def merge(old: Obs, new: Obs) -> Obs:
    """Union of two histories; on overlapping dates the NEW value wins (captures revisions)."""
    m = dict(old)
    m.update(dict(new))
    return sorted(m.items())


def scale(obs: Obs, k: float) -> Obs:
    return [(d, v * k) for d, v in obs]


def to_steps(obs: Obs) -> Obs:
    """Keep only change points (+ the final observation) – used for administered/policy rates."""
    out: Obs = []
    for i, (d, v) in enumerate(obs):
        if not out or v != out[-1][1] or i == len(obs) - 1:
            out.append((d, v))
    return out


# ------------------------------------------------------------------ joins
def asof(obs: Obs, date: str, tolerance_days: int | None = None) -> float | None:
    """Value of the latest observation on or before `date` (optionally within tolerance)."""
    if not obs:
        return None
    dates = [d for d, _ in obs]
    i = bisect.bisect_right(dates, date) - 1
    if i < 0:
        return None
    if tolerance_days is not None and (D(date) - D(dates[i])).days > tolerance_days:
        return None
    return obs[i][1]


def spread(a: Obs, b: Obs, k: float = 1.0, tolerance_days: int = 5) -> Obs:
    """(a − b) × k on a's dates, b taken as-of (no look-ahead)."""
    out = []
    for d, va in a:
        vb = asof(b, d, tolerance_days)
        if vb is not None:
            out.append((d, (va - vb) * k))
    return out


# ------------------------------------------------------------------ period transforms
def _shift_months(date: str, n: int) -> str:
    d = D(date)
    y, m = divmod(d.year * 12 + (d.month - 1) - n, 12)
    return f"{y:04d}-{m + 1:02d}-01"


def _lag_ratio(obs: Obs, months: int) -> list[tuple[str, float]]:
    """(date, x_t / x_{t−months}) for monthly/quarterly series keyed on the 1st of the month."""
    idx = {d[:7]: v for d, v in obs}
    out = []
    for d, v in obs:
        prev = idx.get(_shift_months(d, months)[:7])
        if prev not in (None, 0):
            out.append((d, v / prev))
    return out


def yoy(obs: Obs) -> Obs:
    return [(d, (r - 1) * 100) for d, r in _lag_ratio(obs, 12)]


def mom(obs: Obs) -> Obs:
    return [(d, (r - 1) * 100) for d, r in _lag_ratio(obs, 1)]


def ann3m(obs: Obs) -> Obs:
    return [(d, (r ** 4 - 1) * 100) for d, r in _lag_ratio(obs, 3)]


def ann1q(obs: Obs) -> Obs:
    """Quarterly series (dated first month of quarter): q/q annualised."""
    return [(d, (r ** 4 - 1) * 100) for d, r in _lag_ratio(obs, 3)]


def diff(obs: Obs) -> Obs:
    return [(obs[i][0], obs[i][1] - obs[i - 1][1]) for i in range(1, len(obs))]


def rolling_mean(obs: Obs, n: int) -> Obs:
    out, s = [], 0.0
    for i, (d, v) in enumerate(obs):
        s += v
        if i >= n:
            s -= obs[i - n][1]
        if i >= n - 1:
            out.append((d, s / n))
    return out


def realised_vol_bp(obs: Obs, window: int = 21) -> Obs:
    """Annualised realised volatility of daily changes, in bp (input in %).

    stdev uses the sample (n−1) definition over `window` daily changes, × √252.
    """
    ch = [(d, v * 100) for d, v in diff(obs)]
    out = []
    for i in range(window - 1, len(ch)):
        w = [x for _, x in ch[i - window + 1:i + 1]]
        mu = sum(w) / window
        var = sum((x - mu) ** 2 for x in w) / (window - 1)
        out.append((ch[i][0], math.sqrt(var) * math.sqrt(252)))
    return out


def net_liquidity(assets: Obs, tga: Obs, rrp: Obs) -> Obs:
    """WALCL − TGA − ON RRP on the Fed balance-sheet (Wednesday) dates, all in USD bn."""
    out = []
    for d, a in assets:
        t = asof(tga, d, 7)
        r = asof(rrp, d, 7)
        if r is None and d < "2013-09-23":
            r = 0.0  # facility did not exist at scale before Sept 2013
        if t is not None and r is not None:
            out.append((d, a - t - r))
    return out


# ------------------------------------------------------------------ summary statistics
def change(cur: float, prev: float | None, kind: str, units: str = "") -> float | None:
    """Change between two levels.

    kind: 'bp'  -> (cur − prev) × 100 if the series is in %, else (cur − prev)
          'pct' -> percentage change
          'abs' -> level difference
    """
    if prev is None:
        return None
    if kind == "pct":
        return None if prev == 0 else (cur / prev - 1) * 100
    if kind == "bp":
        return (cur - prev) * (100 if units.strip() == "%" else 1)
    return cur - prev


def summarise(obs: Obs, kind: str, units: str, asof_date: str | None = None) -> dict:
    """Latest value, changes over standard horizons, 52w range and 5y percentile.

    Horizons are calendar-based and use as-of lookups (e.g. '1W' compares with the last
    observation on or before latest_date − 7 days), so they are robust to holidays and
    to weekly/monthly frequencies.
    """
    if not obs:
        return {}
    ld, lv = obs[-1]
    last = D(ld)

    def back(days: int | None = None, months: int | None = None):
        if months is not None:
            y, m = divmod(last.year * 12 + last.month - 1 - months, 12)
            day = min(last.day, 28)
            target = dt.date(y, m + 1, day)
        else:
            target = last - dt.timedelta(days=days)
        return asof(obs[:-1], target.isoformat())

    prev = obs[-2][1] if len(obs) > 1 else None
    ytd_base = asof(obs, f"{last.year - 1}-12-31")
    window5 = [v for d, v in obs if D(d) >= last - dt.timedelta(days=5 * 365)]
    window52 = [v for d, v in obs if D(d) >= last - dt.timedelta(days=365)]
    pct5 = (sum(1 for v in window5 if v <= lv) / len(window5) * 100) if len(window5) >= 20 else None
    z1 = None
    if len(window52) >= 20:
        mu = sum(window52) / len(window52)
        sd = math.sqrt(sum((v - mu) ** 2 for v in window52) / (len(window52) - 1))
        z1 = (lv - mu) / sd if sd > 0 else None
    return {
        "date": ld, "value": lv,
        "prev_date": obs[-2][0] if len(obs) > 1 else None,
        "chg": {
            "1obs": change(lv, prev, kind, units),
            "1w": change(lv, back(days=7), kind, units),
            "1m": change(lv, back(months=1), kind, units),
            "3m": change(lv, back(months=3), kind, units),
            "ytd": change(lv, ytd_base, kind, units) if ytd_base is not None and last.month * 100 + last.day > 101 else None,
            "1y": change(lv, back(months=12), kind, units),
        },
        "hi52": max(window52) if window52 else None,
        "lo52": min(window52) if window52 else None,
        "pct5y": pct5,
        "z1y": z1,
        "first_date": obs[0][0],
        "n": len(obs),
    }


STALE_DAYS = {"D": 6, "W": 14, "M": 100, "Q": 200, "A": 550}


def is_stale(last_date: str, freq: str, today: dt.date | None = None) -> bool:
    """True if the latest observation is older than expected for its frequency
    (allowing for weekends/holidays and normal publication lags)."""
    today = today or dt.date.today()
    return (today - D(last_date)).days > STALE_DAYS.get(freq, 30)
