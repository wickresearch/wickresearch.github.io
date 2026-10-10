"""Core data structures."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

Obs = list[tuple[str, float]]  # [(ISO date 'YYYY-MM-DD', value), ...] sorted ascending


@dataclass
class SeriesResult:
    """Result of fetching one series from a provider."""
    obs: Obs
    meta: dict[str, Any] = field(default_factory=dict)  # provider metadata (title, units, notes, last_updated…)


class ValidationError(ValueError):
    pass
