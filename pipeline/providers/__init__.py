"""Provider adapters. Each module exposes fetch functions returning SeriesResult objects.

Adapters only translate a provider's wire format into [(date, value)] lists. Validation,
merging and derived calculations happen elsewhere so adapters stay small and testable
(parsers are pure functions exercised in pipeline/tests with recorded fixtures).
"""
