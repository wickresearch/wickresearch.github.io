"""Coinbase Exchange public market data (no key). Daily candles, UTC day boundaries."""
from __future__ import annotations

import datetime as dt
import time

from ..http import get
from ..model import SeriesResult

URL = "https://api.exchange.coinbase.com/products/{product}/candles"
MAX_CANDLES = 300


def parse_candles(rows: list) -> list[tuple[str, float]]:
    # Each row: [time, low, high, open, close, volume]; time = UTC epoch seconds of the candle open.
    out = {}
    for r in rows:
        try:
            d = dt.datetime.fromtimestamp(int(r[0]), tz=dt.timezone.utc).date().isoformat()
            out[d] = float(r[4])
        except (IndexError, TypeError, ValueError):
            continue
    return sorted(out.items())


def fetch_daily(product: str, start: dt.date) -> SeriesResult:
    today = dt.datetime.now(dt.timezone.utc).date()
    obs: dict[str, float] = {}
    cursor = start
    while cursor < today:
        end = min(cursor + dt.timedelta(days=MAX_CANDLES - 1), today)
        rows = get(URL.format(product=product), params={
            "granularity": 86400, "start": f"{cursor.isoformat()}T00:00:00Z", "end": f"{end.isoformat()}T00:00:00Z"}).json()
        obs.update(dict(parse_candles(rows)))
        cursor = end + dt.timedelta(days=1)
        time.sleep(0.25)
    # Drop today's still-forming candle: only completed UTC days are published.
    obs.pop(today.isoformat(), None)
    return SeriesResult(obs=sorted(obs.items()), meta={"title": f"{product} daily close (UTC)"})
