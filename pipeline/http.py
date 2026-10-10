"""HTTP client with timeouts, retries and exponential backoff.

Every provider goes through `get()`, so retry/timeout policy lives in one place.
"""
from __future__ import annotations

import logging
import random
import time

import requests

log = logging.getLogger(__name__)

# Some official endpoints (Bank of England IADB, Coinbase) reject requests without a
# browser-like User-Agent. We identify ourselves honestly but in a compatible format.
USER_AGENT = (
    "Mozilla/5.0 (compatible; WickResearchDataBot/2.0; "
    "+https://wickresearch.github.io/)"
)

DEFAULT_TIMEOUT = (10, 45)  # (connect, read) seconds
RETRY_STATUSES = {429, 500, 502, 503, 504}


class FetchError(RuntimeError):
    """Raised when a request ultimately fails after retries."""


_session: requests.Session | None = None


def session() -> requests.Session:
    global _session
    if _session is None:
        s = requests.Session()
        s.headers.update({"User-Agent": USER_AGENT, "Accept": "*/*"})
        _session = s
    return _session


def get(url: str, params: dict | None = None, *, retries: int = 3, backoff: float = 2.0,
        timeout=DEFAULT_TIMEOUT, headers: dict | None = None,
        redact: tuple[str, ...] = ("api_key",)) -> requests.Response:
    """GET with retry on network errors and retryable HTTP statuses.

    `redact` lists query parameters that must never appear in logs (API keys).
    """
    safe_params = {k: ("***" if k in redact else v) for k, v in (params or {}).items()}
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            resp = session().get(url, params=params, timeout=timeout, headers=headers)
            if resp.status_code in RETRY_STATUSES:
                raise FetchError(f"HTTP {resp.status_code}")
            if resp.status_code >= 400:
                # Non-retryable client error: fail fast with a useful message.
                raise FetchError(f"HTTP {resp.status_code} for {url} {safe_params}: {resp.text[:200]!r}")
            return resp
        except (requests.RequestException, FetchError) as exc:
            last_exc = exc
            non_retryable = isinstance(exc, FetchError) and "HTTP 4" in str(exc) and "HTTP 429" not in str(exc)
            if non_retryable or attempt == retries:
                break
            wait = backoff ** attempt + random.uniform(0, 0.5)
            log.warning("GET %s failed (%s); retry %d/%d in %.1fs", url, exc, attempt + 1, retries, wait)
            time.sleep(wait)
    raise FetchError(f"GET {url} {safe_params} failed: {last_exc}")
