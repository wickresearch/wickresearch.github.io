"""Pipeline entry point.

    python -m pipeline.run --out site/data [--previous URL_OR_DIR] [--mode incremental|full] [--only ID ...]

Steps: fetch configured series → validate → merge with previous build → compute derived series →
write static JSON (series, curves, catalog, calendar, news, research, events, status).

Failure policy: a failing provider never aborts the run. Series fall back to the previous build's
data (status "fallback"), or are reported "failed" if no previous data exists. The process exits
non-zero only if nothing at all could be produced.
"""
from __future__ import annotations

import argparse
import datetime as dt
import logging
import os
import re
import sys
import time
import traceback
from collections import defaultdict
from pathlib import Path

import yaml

from . import calc
from .providers import bis, boc, boe, bundesbank, coinbase, fiscaldata, fred, mof, nyfed, rss, treasury
from .store import Previous, obs_from_payload, series_payload, write_json

ROOT = Path(__file__).resolve().parent.parent
CONFIG = Path(__file__).resolve().parent / "config"
log = logging.getLogger("pipeline")

TYPE_LABELS = {
    "administered": "Administered rate",
    "overnight_market": "Overnight market rate",
    "treasury_yield": "Government bond yield (EOD)",
    "market_close": "Daily close (EOD)",
    "official_release": "Official published data",
    "model_estimate": "Model estimate",
    "survey": "Survey",
    "proxy": "Proxy (see note)",
    "derived": "Derived / calculated",
}
# Incremental re-fetch window by native frequency (re-fetching a window captures revisions).
LOOKBACK_DAYS = {"D": 45, "W": 120}


def load_yaml(name: str) -> dict:
    return yaml.safe_load((CONFIG / name).read_text(encoding="utf-8"))


def load_content(name: str) -> dict:
    return yaml.safe_load((ROOT / "content" / name).read_text(encoding="utf-8"))


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


class Run:
    def __init__(self, out: Path, previous: Previous, mode: str, only: set[str] | None):
        self.out = out
        self.prev = previous
        self.mode = mode
        self.only = only
        self.today = dt.date.today()
        self.sources = load_yaml("sources.yaml")
        self.cfg = load_yaml("series.yaml")
        self.obs: dict[str, list] = {}          # id -> observations (for derived calcs + writing)
        self.meta: dict[str, dict] = {}         # id -> metadata
        self.provider_log: dict[str, dict] = defaultdict(lambda: {"ok": 0, "failed": 0, "fallback": 0, "errors": [], "seconds": 0.0})
        self.started = now_utc()

    # ---------------------------------------------------------------- helpers
    def provider_enabled(self, p: str) -> bool:
        return bool(self.sources["providers"].get(p, {}).get("enabled"))

    def prev_series(self, sid: str):
        p = self.prev.get(f"series/{sid}.json")
        return (obs_from_payload(p), p.get("meta", {})) if p else (None, None)

    def start_for(self, sid: str, cfg_start: str, freq: str) -> tuple[str, list | None, dict | None]:
        prev_obs, prev_meta = self.prev_series(sid)
        if self.mode == "incremental" and prev_obs and freq in LOOKBACK_DAYS:
            last = calc.D(prev_obs[-1][0])
            return (max(calc.D(cfg_start), last - dt.timedelta(days=LOOKBACK_DAYS[freq])).isoformat(),
                    prev_obs, prev_meta)
        return cfg_start, prev_obs, prev_meta

    def record_error(self, provider: str, sid: str, exc: Exception):
        msg = f"{sid}: {type(exc).__name__}: {str(exc)[:300]}"
        log.error("[%s] %s", provider, msg)
        self.provider_log[provider]["errors"].append(msg)

    def validate(self, sid: str, obs: list, *, allow_future_days: int = 1) -> list:
        """Basic validation: clean types, drop far-future dates, require non-empty."""
        obs = calc.clean(obs)
        limit = (self.today + dt.timedelta(days=allow_future_days)).isoformat()
        obs = [(d, v) for d, v in obs if d <= limit and d >= "1900-01-01"]
        if not obs:
            raise ValueError(f"{sid}: no valid observations")
        return obs

    def accept(self, sid: str, provider: str, new_obs: list, prev_obs: list | None, meta: dict, status: str = "ok"):
        obs = calc.merge(prev_obs or [], new_obs) if prev_obs and self.mode == "incremental" else new_obs
        self.obs[sid] = obs
        meta.update(status=status, retrieved_at=now_utc() if status == "ok" else meta.get("retrieved_at"))
        self.meta[sid] = meta
        self.provider_log[provider]["ok" if status == "ok" else status] += 1

    def fallback(self, sid: str, provider: str, prev_obs, prev_meta, base_meta: dict):
        if prev_obs:
            m = dict(prev_meta or {})
            m.update({k: v for k, v in base_meta.items() if k not in ("retrieved_at",)})
            m["status"] = "fallback"
            m["retrieved_at"] = (prev_meta or {}).get("retrieved_at")
            self.obs[sid], self.meta[sid] = prev_obs, m
            self.provider_log[provider]["fallback"] += 1
        else:
            self.provider_log[provider]["failed"] += 1
            self.meta[sid] = dict(base_meta, status="failed")

    def base_meta(self, s: dict, provider: str, key: str) -> dict:
        prov = self.sources["providers"].get(provider, {})
        url = (prov.get("url") or "").replace("{key}", str(key))
        return {
            "name": s.get("name") or key, "group": s.get("group"), "units": s.get("units"), "freq": s.get("freq", "D"),
            "change": s.get("change", "abs"), "type": s.get("type"), "type_label": TYPE_LABELS.get(s.get("type"), ""),
            "provider": provider, "provider_name": prov.get("name", provider), "provider_key": key,
            "source_url": url, "check": s.get("check"), "owner": s.get("owner"), "formula": s.get("formula"),
            "step": s.get("step", False),
            # publication-lag override for the staleness check, and a flag for discontinued-by-design series
            "stale_days": s.get("stale_days"), "historical": s.get("historical", False),
        }

    # ---------------------------------------------------------------- series
    def fetch_one(self, provider: str, key: str, start: str, need_meta: bool):
        t0 = time.time()
        try:
            return self._fetch_one(provider, key, start, need_meta)
        finally:
            self.provider_log[provider]["seconds"] += time.time() - t0  # timing per provider (run report)

    def _fetch_one(self, provider: str, key: str, start: str, need_meta: bool):
        if provider == "fred":
            return fred.fetch_series(key, start=start, with_meta=need_meta)
        if provider == "nyfed":
            rate, field = key.split(":")
            return nyfed.fetch_rate(rate, field, start=start)
        if provider == "coinbase":
            return coinbase.fetch_daily(key, calc.D(start))
        raise ValueError(f"unknown provider {provider}")

    def library_entries(self) -> list[dict]:
        """Expand `fred_library` (FRED IDs grouped by theme) into series entries.

        A FRED key already configured under `series:` is referenced, not fetched twice. New entries
        get id = FRED key (prefixed FRED_ on a clash) and their name/units/frequency are inferred
        from FRED's own metadata unless given explicitly. The group index is published in the
        catalogue for the terminal's FRED library module.
        """
        by_key = {s["key"]: s["id"] for s in self.cfg["series"] if s["provider"] == "fred"}
        by_key.update({s["fallback"]["key"]: s["id"] for s in self.cfg["series"]
                       if s.get("fallback", {}).get("provider") == "fred" and s["fallback"]["key"] not in by_key})
        ids = {s["id"] for s in self.cfg["series"]}
        entries, self.library_index = [], []
        for g in self.cfg.get("fred_library", []):
            gids = []
            for item in g["series"]:
                it = {"key": item} if isinstance(item, str) else dict(item)
                key = it["key"]
                if key in by_key:
                    gids.append(by_key[key])
                    continue
                sid = it.get("id") or (key if key not in ids else f"FRED_{key}")
                ids.add(sid)
                by_key[key] = sid
                e = {"id": sid, "provider": "fred", "key": key, "group": "library", "auto": True,
                     "type": it.get("type", g.get("type", "official_release")), "check": it.get("check", g.get("check", "family")),
                     "start": it.get("start", g.get("start", "1950-01-01"))}
                for f in ("name", "units", "freq", "change", "scale", "owner", "allow_future_days", "formula", "stale_days", "historical"):
                    if f in it:
                        e[f] = it[f]
                entries.append(e)
                gids.append(sid)
            self.library_index.append({"group": g["group"], "ids": gids, "note": g.get("note")})
        return entries

    @staticmethod
    def apply_auto(s: dict, provider_meta: dict | None) -> dict:
        """Fill missing display fields of an auto (library) entry from FRED metadata."""
        if not s.get("auto") or not provider_meta:
            return s
        s = dict(s)
        for k, v in fred.auto_fields(provider_meta).items():
            s.setdefault(k, v)
        return s

    def run_series(self):
        lib = self.library_entries()
        self.fred_ids = {x["key"]: x["id"] for x in self.cfg["series"] + lib if x["provider"] == "fred"}
        for s in self.cfg["series"] + lib:
            sid = s["id"]
            if self.only and sid not in self.only:
                continue
            provider, key = s["provider"], s["key"]
            if s.get("auto"):  # use last run's FRED metadata (if any) to know the frequency before fetching
                s = self.apply_auto(s, (self.prev_series(sid)[1] or {}).get("provider_meta"))
            meta = self.base_meta(s, provider, key)
            start, prev_obs, prev_meta = self.start_for(sid, s.get("start", "1990-01-01"), s.get("freq", "D"))
            if not self.provider_enabled(provider):
                self.fallback(sid, provider, prev_obs, prev_meta, meta)
                continue
            # Provider metadata (FRED notes/last_updated) is re-fetched on full runs or if missing.
            need_meta = self.mode == "full" or not (prev_meta or {}).get("provider_meta")
            attempts = [(provider, key)] + ([(s["fallback"]["provider"], s["fallback"]["key"])] if s.get("fallback") else [])
            done = False
            for i, (p, k) in enumerate(attempts):
                try:
                    res = self.fetch_one(p, k, start, need_meta)
                    if s.get("auto"):
                        s = self.apply_auto(s, res.meta or (prev_meta or {}).get("provider_meta"))
                        meta = self.base_meta(s, provider, key)
                    # IORB is published forward-dated; SEP projections are dated by target year (allow_future_days in config)
                    allow_future = s.get("allow_future_days", 10 if s.get("type") == "administered" else 1)
                    obs = self.validate(sid, calc.scale(res.obs, s.get("scale", 1.0)), allow_future_days=allow_future)
                    m = dict(meta)
                    if i > 0:  # secondary source used – say so in the metadata
                        m.update(self.base_meta(s, p, k))
                        m["note"] = f"Primary source ({provider}) failed this run; served from {p}."
                    m["provider_meta"] = res.meta or (prev_meta or {}).get("provider_meta")
                    if m["provider_meta"] and m["provider_meta"].get("copyright") and not m.get("owner"):
                        m["owner"] = m["provider_meta"]["copyright"]
                    # Only merge with previous data that came from the same provider.
                    same = prev_meta and prev_meta.get("provider") == p
                    self.accept(sid, p, obs, prev_obs if same else None, m)
                    done = True
                    break
                except Exception as exc:  # noqa: BLE001 – any provider failure is recorded, never fatal
                    self.record_error(p, sid, exc)
            if not done:
                self.fallback(sid, provider, prev_obs, prev_meta, meta)

        # Daily TGA from the Daily Treasury Statement (complements the weekly H.4.1 figure).
        if not self.only or "TGA_D" in self.only:
            s = {"id": "TGA_D", "name": "Treasury General Account (daily, DTS)", "group": "liquidity",
                 "units": "USD bn", "freq": "D", "change": "abs", "type": "official_release", "check": "tested"}
            meta = self.base_meta(s, "fiscaldata", "dts/operating_cash_balance")
            start, prev_obs, prev_meta = self.start_for("TGA_D", "2015-01-01", "D")
            try:
                res = fiscaldata.fetch_tga(start)
                self.accept("TGA_D", "fiscaldata", self.validate("TGA_D", calc.scale(res.obs, 0.001)), prev_obs, meta)
            except Exception as exc:  # noqa: BLE001
                self.record_error("fiscaldata", "TGA_D", exc)
                self.fallback("TGA_D", "fiscaldata", prev_obs, prev_meta, meta)

    # ---------------------------------------------------------------- curves
    def fetch_curve(self, c: dict, prev_rows: dict | None) -> tuple[dict, list[str], list[str]]:
        p, notes = c["provider"], []
        last = max(prev_rows) if prev_rows else None
        incr = self.mode == "incremental" and last is not None
        since = (calc.D(last) - dt.timedelta(days=20)) if incr else calc.D(c.get("start", "2000-01-01"))
        if p == "fred":
            # Curve assembled from FRED constant-maturity series that run_series already fetched
            # (no extra API calls). Tenor -> FRED ID mapping lives in the curve's config.
            tenors, rows = [], defaultdict(dict)
            start = c.get("start", "2000-01-01")
            for t, key in c["fred_tenors"].items():
                obs = self.obs.get(getattr(self, "fred_ids", {}).get(key, key))
                if not obs:
                    continue
                tenors.append(t)
                for d, v in obs:
                    if d >= start:
                        rows[d][t] = v
            if len(tenors) < len(c["fred_tenors"]) // 2:
                raise ValueError(f"too few FRED tenors available ({tenors})")
            rows = dict(rows)
        elif p == "treasury":
            tenors = [t for _, t in treasury.TENORS]
            if incr:
                months, d = [], since.replace(day=1)
                while d <= self.today:
                    months.append(f"{d.year}{d.month:02d}")
                    d = (d + dt.timedelta(days=32)).replace(day=1)
                rows = treasury.fetch_curve(0, months=months)
            else:
                rows = treasury.fetch_curve(c.get("start_year", 2000))
        elif p == "bundesbank":
            tenors, rows = list(bundesbank.TENORS), bundesbank.fetch_curve(since.isoformat())
        elif p == "boe":
            tenors = list(boe.CURVE)
            data = boe.fetch(list(boe.CURVE.values()), since)
            rows = defaultdict(dict)
            for t, code in boe.CURVE.items():
                for d, v in data.get(code, []):
                    rows[d][t] = v
            rows = dict(rows)
        elif p == "mof":
            tenors = mof.KEEP
            rows, notes = mof.fetch_curve(include_history=not incr)
        elif p == "boc":
            tenors = list(boc.CURVE)
            data = boc.fetch(list(boc.CURVE.values()), since.isoformat())
            rows = defaultdict(dict)
            for t, code in boc.CURVE.items():
                for d, v in data.get(code, []):
                    rows[d][t] = v
            rows = dict(rows)
        else:
            raise ValueError(p)
        if not rows:
            raise ValueError("no curve rows returned")
        return rows, tenors, notes

    def run_curves(self):
        for c in self.cfg["curves"]:
            cid = c["id"]
            tenor_ids = None
            if self.only and not any(x.startswith(cid + "_") or x == "CURVE_" + cid for x in self.only):
                continue
            prev = self.prev.get(f"curves/{cid}.json")
            prev_rows = ({d: {t: v for t, v in zip(prev["tenors"], row) if v is not None}
                          for d, row in zip(prev["d"], prev["y"])} if prev else None)
            status, notes = "ok", []
            try:
                rows = None
                for prov in [c["provider"]] + ([c["fallback"]] if c.get("fallback") else []):
                    try:
                        if not self.provider_enabled(prov):
                            raise RuntimeError(f"provider {prov} disabled")
                        t0 = time.time()
                        rows, tenors, notes = self.fetch_curve(dict(c, provider=prov), prev_rows)
                        self.provider_log[prov]["seconds"] += time.time() - t0
                        if prov != c["provider"]:
                            notes = notes + [f"primary source ({c['provider']}) unavailable; served from {prov}"]
                        c = dict(c, provider=prov)
                        break
                    except Exception as exc:  # noqa: BLE001
                        if prov == (c.get("fallback") or c["provider"]):
                            raise
                        self.record_error(prov, f"curve {cid}", exc)
                rows = {d: r for d, r in rows.items() if d <= self.today.isoformat()}
                if prev_rows and self.mode == "incremental":
                    merged = dict(prev_rows)
                    merged.update(rows)
                    rows = merged
                self.provider_log[c["provider"]]["ok"] += 1
            except Exception as exc:  # noqa: BLE001
                self.record_error(c["provider"], f"curve {cid}", exc)
                if not prev_rows:
                    self.provider_log[c["provider"]]["failed"] += 1
                    self.meta["CURVE_" + cid] = {"name": c["name"], "status": "failed"}
                    continue
                rows, tenors, status = prev_rows, prev["tenors"], "fallback"
                self.provider_log[c["provider"]]["fallback"] += 1
            dates = sorted(rows)
            tenors = [t for t in tenors if any(t in rows[d] for d in dates)]
            prov = self.sources["providers"][c["provider"]]
            cmeta = {"name": c["name"], "provider": c["provider"], "provider_name": prov["name"],
                     "source_url": prov.get("url"), "check": c.get("check"), "status": status,
                     "retrieved_at": now_utc() if status == "ok" else (prev or {}).get("meta", {}).get("retrieved_at"),
                     "notes": notes}
            write_json(self.out / "curves" / f"{cid}.json", {
                "id": cid, "meta": cmeta, "tenors": tenors, "d": dates,
                "y": [[(round(rows[d][t], 4) if t in rows[d] else None) for t in tenors] for d in dates]})
            self.meta["CURVE_" + cid] = cmeta
            for t in tenors:  # expose each tenor as a regular series
                sid = f"{cid}_{t.upper()}"
                obs = [(d, rows[d][t]) for d in dates if t in rows[d]]
                s = {"name": f"{c['name'].split(' (')[0]} {t}", "group": f"curve_{cid.lower()}", "units": "%",
                     "freq": "D", "change": "bp", "type": c.get("type", "treasury_yield"), "check": c.get("check")}
                m = self.base_meta(s, c["provider"], f"curve:{cid}:{t}")
                m.update(status=status, retrieved_at=cmeta["retrieved_at"], curve=cid, tenor=t)
                self.obs[sid], self.meta[sid] = obs, m

    # ---------------------------------------------------------------- policy rates
    def run_policy_rates(self):
        pr = self.cfg["policy_rates"]
        areas = list(pr["areas"])
        if self.only and not any(x.startswith("POL_") for x in self.only):
            return
        try:
            data = bis.fetch(areas, pr.get("start", "1990-01-01"))
            ok = True
        except Exception as exc:  # noqa: BLE001
            self.record_error("bis", "policy rates", exc)
            data, ok = {}, False
        for a, info in pr["areas"].items():
            sid = f"POL_{a}"
            s = {"name": info["name"], "group": "policy", "units": "%", "freq": "D", "change": "bp",
                 "type": "administered", "check": pr.get("check"), "step": True}
            meta = self.base_meta(s, "bis", f"WS_CBPOL/D.{a}")
            meta["bank"] = info["bank"]
            prev_obs, prev_meta = self.prev_series(sid)
            if ok and data.get(a):
                obs = calc.to_steps(self.validate(sid, data[a]))
                self.accept(sid, "bis", obs, None, meta)
            else:
                self.fallback(sid, "bis", prev_obs, prev_meta, meta)

    # ---------------------------------------------------------------- derived
    def run_derived(self):
        for s in self.cfg["derived"]:
            sid, op = s["id"], s["op"]
            inputs = [x for x in (s.get("a"), s.get("b")) if x]
            if op == "net_liquidity":
                inputs = ["FED_ASSETS", "TGA_W", "ONRRP"]
            missing = [x for x in inputs if not self.obs.get(x)]
            src_meta = self.meta.get(inputs[0], {}) if inputs else {}
            meta = {"name": s["name"], "group": "derived", "units": s.get("units"), "freq": src_meta.get("freq", "D"),
                    "change": s.get("change", "abs"), "type": "derived", "type_label": TYPE_LABELS["derived"],
                    "provider": "wick", "provider_name": "Wick Research calculation", "inputs": inputs,
                    "formula": s.get("formula"), "check": "derived"}
            if missing:
                meta["status"] = "failed"
                meta["note"] = f"missing inputs: {', '.join(missing)}"
                self.meta[sid] = meta
                continue
            a = self.obs.get(s.get("a")) if s.get("a") else None
            b = self.obs.get(s.get("b")) if s.get("b") else None
            try:
                if op == "spread":
                    # Monthly inputs need a wider as-of tolerance than daily ones.
                    tol = 40 if meta["freq"] in ("M", "Q") else 5
                    obs = calc.spread(a, b, s.get("scale", 1), tolerance_days=tol)
                elif op == "yoy":
                    obs = calc.yoy(a)
                elif op == "mom":
                    obs = calc.mom(a)
                elif op == "ann3m":
                    obs = calc.ann3m(a)
                elif op == "ann1q":
                    obs = calc.ann1q(a)
                elif op == "diff":
                    obs = calc.diff(a)
                elif op == "diff_avg3":
                    obs = calc.rolling_mean(calc.diff(a), 3)
                elif op == "avg4":
                    obs = calc.rolling_mean(a, 4)
                elif op == "realised_vol_bp":
                    obs = calc.realised_vol_bp(a, s.get("window", 21))
                elif op == "net_liquidity":
                    obs = calc.net_liquidity(self.obs["FED_ASSETS"], self.obs["TGA_W"], self.obs["ONRRP"])
                else:
                    raise ValueError(f"unknown op {op}")
                if not obs:
                    raise ValueError("empty result")
                in_status = {self.meta.get(x, {}).get("status") for x in inputs}
                meta["status"] = "fallback" if "fallback" in in_status else "ok"
                meta["retrieved_at"] = now_utc()
                self.obs[sid], self.meta[sid] = obs, meta
            except Exception as exc:  # noqa: BLE001
                self.record_error("derived", sid, exc)
                meta["status"] = "failed"
                self.meta[sid] = meta

    # ---------------------------------------------------------------- outputs
    def write_series_and_catalog(self):
        cat = {}
        for sid, meta in self.meta.items():
            if sid.startswith("CURVE_"):
                continue
            obs = self.obs.get(sid)
            entry = dict(meta)
            if obs:
                write_json(self.out / "series" / f"{sid}.json", series_payload(sid, meta, obs))
                summ = calc.summarise(obs, meta.get("change", "abs"), meta.get("units") or "")
                entry["latest"] = summ
                entry["stale"] = (not meta.get("step") and not meta.get("historical")
                                  and calc.is_stale(obs[-1][0], meta.get("freq", "D"), self.today, meta.get("stale_days")))
                entry["file"] = f"series/{sid}.json"
            cat[sid] = entry
        curves = {k[6:]: v for k, v in self.meta.items() if k.startswith("CURVE_")}
        # When running a subset (--only), keep the rest of the previous catalogue.
        if self.only:
            prev_cat = (self.prev.get("catalog.json") or {}).get("series", {})
            prev_cat.update(cat)
            cat = prev_cat
        write_json(self.out / "catalog.json", {
            "generated_at": now_utc(), "pipeline_version": __import__("pipeline").__version__,
            "providers": self.sources["providers"], "curves": curves, "library": getattr(self, "library_index", []), "series": cat})

    def run_extras(self):
        """Calendar, news, research, auctions, events. Each is independent and failure-tolerant."""
        tasks = [("calendar", self.build_calendar), ("news", self.build_news), ("research", self.build_research),
                 ("auctions", self.build_auctions), ("events", self.build_events)]
        for name, fn in tasks:
            if self.only and name not in self.only:
                continue
            t0 = time.time()
            try:
                payload = fn()
                self.provider_log[f"extra:{name}"]["seconds"] += time.time() - t0
                payload["generated_at"] = now_utc()
                write_json(self.out / f"{name}.json", payload, compact=False)
            except Exception as exc:  # noqa: BLE001
                self.record_error(name, name, exc)
                prev = self.prev.get(f"{name}.json")
                if prev:
                    prev["status"] = "fallback"
                    write_json(self.out / f"{name}.json", prev, compact=False)

    def _fred_release_ids(self) -> dict[str, int]:
        if not hasattr(self, "_rel_ids"):
            rels = fred.fetch_release_list()
            ids = {}
            for r in self.sources["calendar_releases"]:
                for rel in rels:
                    if r["match"].lower() in rel["name"].lower():
                        ids[r["match"]] = rel["id"]
                        break
            self._rel_ids = ids
        return self._rel_ids

    def build_calendar(self) -> dict:
        items, notes = [], []
        try:
            end = (self.today + dt.timedelta(days=60)).isoformat()
            rows = fred.fetch_release_calendar(self.today.isoformat(), end)
            seen = set()
            for row in rows:
                for r in self.sources["calendar_releases"]:
                    if r["match"].lower() in (row["name"] or "").lower():
                        k = (row["date"], r["label"])
                        if k not in seen:
                            seen.add(k)
                            items.append({"date": row["date"], "label": r["label"], "kind": "release",
                                          "importance": r["importance"], "source": "FRED release calendar",
                                          "url": f"https://fred.stlouisfed.org/release?rid={row['release_id']}"})
                        break
        except Exception as exc:  # noqa: BLE001
            notes.append(f"FRED release calendar unavailable: {exc}")
            self.record_error("fred", "calendar", exc)
        cal = load_content("calendar.yaml")
        horizon = (self.today + dt.timedelta(days=180)).isoformat()
        for bank, info in cal["banks"].items():
            for m in info["meetings"]:
                if self.today.isoformat() <= m["date"] <= horizon:
                    items.append({"date": m["date"], "label": f"{bank} policy decision", "kind": "central_bank",
                                  "bank": bank, "importance": "high", "sep": m.get("sep", False),
                                  "tentative": m.get("tentative", False), "source": info["name"], "url": info["source"]})
        items.sort(key=lambda x: (x["date"], x["kind"] != "central_bank"))
        return {"items": items, "notes": notes, "verified_on": cal.get("verified_on"),
                "meetings": {b: {"name": i["name"], "source": i["source"], "note": i.get("note"),
                                 "dates": [m["date"] for m in i["meetings"]]} for b, i in cal["banks"].items()},
                "disclaimer": "Release dates only. No consensus forecasts are shown: no free, licensed source exists."}

    def build_news(self) -> dict:
        items, errors = [], []
        for f in self.sources["news_feeds"]:
            try:
                for it in rss.fetch(f["url"])[:15]:
                    items.append({"title": it["title"], "url": it["link"], "date": it["date"],
                                  "source": f["source"], "bank": f["bank"]})
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{f['source']}: {exc}")
                self.record_error("rss", f["source"], exc)
        items.sort(key=lambda x: x["date"] or "", reverse=True)
        return {"items": items, "errors": errors}

    @staticmethod
    def _article_key(url: str) -> str:
        # Medium URLs differ by host and query; the trailing hex id is stable.
        u = url.split("?")[0].rstrip("/")
        m = re.search(r"-([0-9a-f]{8,})$", u)
        return m.group(1) if m else u.lower()

    def build_research(self) -> dict:
        content = load_content("articles.yaml")
        curated = {self._article_key(a["url"]): dict(a, source="curated") for a in content["articles"]}
        feed_note = None
        try:
            for it in rss.fetch(self.sources["providers"]["medium"]["feed"]):
                k = self._article_key(it["link"])
                if k in curated:
                    curated[k]["feed_confirmed"] = True
                    continue
                curated[k] = {"title": it["title"], "url": it["link"].split("?")[0], "date": (it["date"] or "")[:10],
                              "platform": "Medium", "category": "Uncategorised", "tags": it["categories"],
                              "description": None, "featured": False, "source": "feed"}
        except Exception as exc:  # noqa: BLE001
            feed_note = f"Medium feed unavailable this run: {exc}"
            self.record_error("medium", "feed", exc)
        arts = sorted(curated.values(), key=lambda a: str(a.get("date")), reverse=True)
        for a in arts:
            a["date"] = str(a.get("date"))
        return {"categories": content["categories"], "articles": arts, "note": feed_note}

    def build_auctions(self) -> dict:
        start = (self.today - dt.timedelta(days=45)).isoformat()
        rows = fiscaldata.fetch_auctions(start)
        return {"items": rows, "source": "U.S. Treasury FiscalData – auctions_query",
                "url": "https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/"}

    def build_events(self) -> dict:
        types = {}
        cal = load_content("calendar.yaml")
        past = lambda ds: [d for d in ds if d <= self.today.isoformat()]  # noqa: E731
        types["fomc"] = {"label": "FOMC decisions", "dates": past([m["date"] for m in cal["banks"]["Fed"]["meetings"]]),
                         "source": "federalreserve.gov FOMC calendars (transcribed, verified 2026-10-10)",
                         "timing": "Statement 14:00 ET; daily close-to-close window captures the decision day."}
        try:
            ids = self._fred_release_ids()
            for r in self.sources["calendar_releases"]:
                if r.get("event_study") and r["match"] in ids:
                    ds = [d for d in fred.fetch_release_history(ids[r["match"]]) if "2000-01-01" <= d]
                    types[r["event_study"]] = {"label": r["label"] + " releases", "dates": past(ds),
                                               "source": f"FRED release dates (release_id {ids[r['match']]})",
                                               "timing": "08:30 ET release; prior close to release-day close."}
        except Exception as exc:  # noqa: BLE001
            self.record_error("fred", "event dates", exc)
        for a, label in (("GB", "BoE Bank Rate changes"), ("XM", "ECB deposit-rate changes"),
                         ("JP", "BoJ policy-rate changes"), ("CA", "BoC policy-rate changes")):
            obs = self.obs.get(f"POL_{a}")
            if obs:
                ch = [obs[i][0] for i in range(1, len(obs)) if obs[i][1] != obs[i - 1][1]]
                types[f"pol_{a.lower()}"] = {"label": label, "dates": past(ch),
                                             "source": "BIS WS_CBPOL (effective dates)",
                                             "timing": "Effective date per BIS; may differ from the announcement day (e.g. ECB)."}
        return {"types": types}

    def write_status(self):
        cat_status = defaultdict(int)
        for m in self.meta.values():
            cat_status[m.get("status", "?")] += 1
        status = {"started_at": self.started, "finished_at": now_utc(), "mode": self.mode,
                  "previous_base": self.prev.base or None,
                  "previous_fetch": {"requests": self.prev.requests, "seconds": round(self.prev.seconds, 1)},
                  "counts": dict(cat_status),
                  "providers": {k: dict(v, seconds=round(v["seconds"], 1)) for k, v in self.provider_log.items()}}
        write_json(self.out / "status.json", status, compact=False)
        return status


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(ROOT / "site" / "data"))
    ap.add_argument("--previous", default=os.environ.get("WICK_PREVIOUS_BASE"),
                    help="Base URL or directory of the previous build (fallback + incremental fetch).")
    ap.add_argument("--mode", choices=["incremental", "full"], default=os.environ.get("WICK_MODE", "incremental"))
    ap.add_argument("--only", nargs="*", help="Series IDs or extras (calendar news research auctions events) to run.")
    ap.add_argument("--log-level", default="INFO")
    args = ap.parse_args(argv)
    logging.basicConfig(level=args.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    run = Run(out, Previous(args.previous), args.mode, set(args.only) if args.only else None)
    t0 = time.time()
    try:
        run.run_series()
        run.run_curves()
        run.run_policy_rates()
        run.run_derived()
        run.write_series_and_catalog()
        run.run_extras()
    except Exception:  # noqa: BLE001 – last-resort guard; still write status
        log.critical("pipeline crashed:\n%s", traceback.format_exc())
        run.provider_log["pipeline"]["errors"].append(traceback.format_exc()[-1000:])
    status = run.write_status()
    log.info("done in %.0fs: %s", time.time() - t0, status["counts"])
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:  # human-readable run report in the Actions UI
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"## Data pipeline ({args.mode})\n\nSeries status: `{status['counts']}`\n\n")
            f.write("| Provider | ok | fallback | failed | first error |\n|---|---|---|---|---|\n")
            for p, v in status["providers"].items():
                err = (v["errors"][0] if v["errors"] else "").replace("|", "/")[:160]
                f.write(f"| {p} | {v['ok']} | {v['fallback']} | {v['failed']} | {err} |\n")
    produced = sum(1 for m in run.meta.values() if m.get("status") in ("ok", "fallback"))
    return 0 if produced else 1


if __name__ == "__main__":
    sys.exit(main())
