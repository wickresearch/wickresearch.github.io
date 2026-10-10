"""Minimal RSS 2.0 / Atom reader (stdlib only). Only titles, links and dates are kept."""
from __future__ import annotations

import email.utils
import xml.etree.ElementTree as ET

from ..http import get


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _iso(s: str | None) -> str | None:
    if not s:
        return None
    try:
        return email.utils.parsedate_to_datetime(s).isoformat()
    except (TypeError, ValueError):
        return s.strip()  # Atom dates are already ISO 8601


def parse_feed(text: str | bytes) -> list[dict]:
    root = ET.fromstring(text)
    items = []
    for el in root.iter():
        n = _local(el.tag)
        if n not in ("item", "entry"):
            continue
        rec = {"title": None, "link": None, "date": None, "categories": []}
        for c in el:
            cn = _local(c.tag)
            if cn == "title":
                rec["title"] = (c.text or "").strip()
            elif cn == "link":
                rec["link"] = (c.text or c.attrib.get("href") or "").strip()
            elif cn in ("pubDate", "published", "updated", "date") and not rec["date"]:
                rec["date"] = _iso(c.text)
            elif cn == "category":
                t = (c.text or c.attrib.get("term") or "").strip()
                if t:
                    rec["categories"].append(t)
        if rec["title"] and rec["link"]:
            items.append(rec)
    return items


def fetch(url: str) -> list[dict]:
    return parse_feed(get(url).content)
