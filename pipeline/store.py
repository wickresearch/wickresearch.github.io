"""Reading/writing the static data files, and loading the previous build for fallback.

Output layout (relative to --out, normally site/data):
  catalog.json            index of every series: metadata, latest value, changes, status
  status.json             run log: per-provider outcome, errors, timings
  series/<ID>.json        {"id", "meta", "d": [...dates], "v": [...values]}
  curves/<ID>.json        {"id", "tenors": [...], "d": [...], "y": [[...]]}  (rows aligned with d)
  policy_rates.json, calendar.json, news.json, research.json, auctions.json, events.json
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger(__name__)


def _round(v: float, nd: int = 6):
    return None if v is None else round(v, nd)


def write_json(path: Path, obj: Any, compact: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        if compact:
            json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
        else:
            json.dump(obj, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)  # atomic: a crash never leaves a half-written file


def series_payload(sid: str, meta: dict, obs: list[tuple[str, float]]) -> dict:
    return {"id": sid, "meta": meta, "d": [d for d, _ in obs], "v": [_round(v) for _, v in obs]}


def obs_from_payload(p: dict) -> list[tuple[str, float]]:
    return [(d, v) for d, v in zip(p.get("d", []), p.get("v", [])) if v is not None]


class Previous:
    """Access to the previous successful build (live site URL or local directory).

    Used for (a) incremental fetching and (b) last-known-good fallback when a provider fails.
    """

    def __init__(self, base: str | None):
        self.base = (base or "").rstrip("/")
        self._cache: dict[str, Any] = {}
        self.seconds, self.requests = 0.0, 0  # reported in status.json

    def get(self, rel: str) -> Any | None:
        if not self.base:
            return None
        if rel in self._cache:
            return self._cache[rel]
        val = None
        import time
        t0 = time.time()
        self.requests += 1
        try:
            if self.base.startswith("http"):
                r = requests.get(f"{self.base}/{rel}", timeout=20)
                if r.status_code == 200:
                    val = r.json()
            else:
                p = Path(self.base) / rel
                if p.exists():
                    val = json.loads(p.read_text(encoding="utf-8"))
        except (requests.RequestException, ValueError, OSError) as exc:
            log.info("previous %s unavailable: %s", rel, exc)
        self.seconds += time.time() - t0
        self._cache[rel] = val
        return val
