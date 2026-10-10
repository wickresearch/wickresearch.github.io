"""Wick Research data pipeline.

Fetches public macro/market data from verified providers (see docs/DATA_SOURCES.md),
validates it, computes derived series and writes static JSON for the site.

Run:  python -m pipeline.run --out site/data
"""
__version__ = "2.0.0"
