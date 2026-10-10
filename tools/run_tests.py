"""Run the Python test-suite with pytest if installed, otherwise with a minimal stdlib runner.

    python tools/run_tests.py

CI installs pytest (requirements-dev.txt). The fallback exists so the suite can run in
restricted environments without package-index access.
"""
from __future__ import annotations

import importlib
import inspect
import math
import sys
import traceback
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    import pytest  # noqa: F401
    sys.exit(pytest.main(["-q", str(ROOT / "pipeline" / "tests")]))
except ImportError:
    pass


class _Approx:
    def __init__(self, expected, rel=1e-6, abs=1e-12):
        self.e, self.rel, self.abs = expected, rel, abs

    def __eq__(self, other):
        return math.isclose(other, self.e, rel_tol=self.rel, abs_tol=self.abs)

    def __repr__(self):
        return f"approx({self.e})"


class _Raises:
    def __init__(self, exc):
        self.exc = exc

    def __enter__(self):
        return self

    def __exit__(self, et, ev, tb):
        if et is None:
            raise AssertionError(f"did not raise {self.exc}")
        return issubclass(et, self.exc)


stub = types.ModuleType("pytest")
stub.approx = lambda e, rel=1e-6, abs=1e-12: _Approx(e, rel, abs)
stub.raises = _Raises
sys.modules["pytest"] = stub

failed = passed = 0
for f in sorted((ROOT / "pipeline" / "tests").glob("test_*.py")):
    mod = importlib.import_module(f"pipeline.tests.{f.stem}")
    for name, fn in inspect.getmembers(mod, inspect.isfunction):
        if not name.startswith("test_"):
            continue
        params = inspect.signature(fn).parameters
        try:
            kwargs = {}
            if "tmp_path" in params:
                import tempfile
                kwargs["tmp_path"] = Path(tempfile.mkdtemp())
            if "monkeypatch" in params:
                raise RuntimeError("monkeypatch fixture requires pytest")
            fn(**kwargs)
            passed += 1
        except Exception:  # noqa: BLE001
            failed += 1
            print(f"FAIL {f.stem}::{name}\n{traceback.format_exc()}")
print(f"{passed} passed, {failed} failed (stdlib runner)")
sys.exit(1 if failed else 0)
