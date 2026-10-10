import datetime as dt
import math

import pytest

from pipeline import calc


def test_clean_dedupes_sorts_and_drops_nonfinite():
    assert calc.clean([("2026-01-02", 2.0), ("2026-01-01", 1.0), ("2026-01-02", 3.0), ("2026-01-03", float("nan"))]) == [
        ("2026-01-01", 1.0), ("2026-01-02", 3.0)]


def test_merge_new_values_win():
    assert calc.merge([("a", 1.0), ("b", 2.0)], [("b", 5.0), ("c", 6.0)]) == [("a", 1.0), ("b", 5.0), ("c", 6.0)]


def test_asof_no_lookahead_and_tolerance():
    obs = [("2026-01-01", 1.0), ("2026-01-05", 2.0)]
    assert calc.asof(obs, "2026-01-04") == 1.0
    assert calc.asof(obs, "2025-12-31") is None
    assert calc.asof(obs, "2026-01-20", tolerance_days=5) is None


def test_spread_bp():
    a = [("2026-01-02", 4.50), ("2026-01-05", 4.60)]
    b = [("2026-01-02", 4.00)]
    assert calc.spread(a, b, 100) == [("2026-01-02", pytest.approx(50.0)), ("2026-01-05", pytest.approx(60.0))]


def test_yoy_mom_ann3m():
    m = [(f"2025-{i:02d}-01", 100.0 + i) for i in range(1, 13)] + [("2026-01-01", 103.0)]
    assert calc.yoy(m) == [("2026-01-01", pytest.approx(103 / 101 * 100 - 100))]
    assert calc.mom(m)[-1][1] == pytest.approx((103 / 112 - 1) * 100)
    assert calc.ann3m(m)[-1][1] == pytest.approx(((103 / 110) ** 4 - 1) * 100)


def test_yoy_requires_exact_month_gap():
    m = [("2025-01-01", 100.0), ("2026-02-01", 110.0)]
    assert calc.yoy(m) == []


def test_diff_and_rolling_mean():
    s = [("1", 100.0), ("2", 103.0), ("3", 101.0), ("4", 107.0)]
    assert calc.diff(s) == [("2", 3.0), ("3", -2.0), ("4", 6.0)]
    assert calc.rolling_mean(calc.diff(s), 3) == [("4", pytest.approx(7 / 3))]


def test_realised_vol_constant_moves_is_zero_and_known_case():
    flat = [(f"d{i:03d}", 4.0 + 0.01 * i) for i in range(30)]
    assert all(v == pytest.approx(0.0, abs=1e-9) for _, v in calc.realised_vol_bp(flat, 21))
    alt = [(f"d{i:03d}", 4.0 + (0.01 if i % 2 else 0.0)) for i in range(23)]  # ±1bp alternating changes
    v = calc.realised_vol_bp(alt, 21)[-1][1]
    w = [1 if i % 2 else -1 for i in range(1, 22)]
    mu = sum(w) / 21
    sd = math.sqrt(sum((x - mu) ** 2 for x in w) / 20)
    assert v == pytest.approx(sd * math.sqrt(252))


def test_net_liquidity_aligns_asof_wednesday():
    assets = [("2026-10-07", 6747.56)]
    tga = [("2026-10-07", 880.253)]
    rrp = [("2026-10-06", 0.5), ("2026-10-07", 0.3), ("2026-10-08", 99.0)]
    assert calc.net_liquidity(assets, tga, rrp) == [("2026-10-07", pytest.approx(6747.56 - 880.253 - 0.3))]


def test_to_steps():
    s = [("1", 1.0), ("2", 1.0), ("3", 1.25), ("4", 1.25), ("5", 1.25)]
    assert calc.to_steps(s) == [("1", 1.0), ("3", 1.25), ("5", 1.25)]


def test_change_kinds():
    assert calc.change(5.22, 5.28, "bp", "%") == pytest.approx(-6.0)
    assert calc.change(110, 100, "pct") == pytest.approx(10.0)
    assert calc.change(3, 1, "abs") == 2
    assert calc.change(1, None, "abs") is None


def test_summarise_horizons():
    start = dt.date(2025, 1, 1)
    obs = [((start + dt.timedelta(days=i)).isoformat(), float(i)) for i in range(400)]
    s = calc.summarise(obs, "abs", "")
    assert s["value"] == 399 and s["chg"]["1obs"] == 1
    assert s["chg"]["1w"] == 7
    last = dt.date.fromisoformat(s["date"])
    assert s["chg"]["ytd"] == 399 - (dt.date(last.year - 1, 12, 31) - start).days
    assert s["pct5y"] == 100.0


def test_is_stale():
    today = dt.date(2026, 10, 10)
    assert not calc.is_stale("2026-10-08", "D", today)
    assert calc.is_stale("2026-09-20", "D", today)
    assert not calc.is_stale("2026-08-01", "M", today)
