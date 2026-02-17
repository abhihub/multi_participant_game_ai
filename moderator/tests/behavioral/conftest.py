"""Auto-skip behavioral tests if OPENAI_API_KEY is not set or is a placeholder."""

from __future__ import annotations

import os

import pytest


def _has_real_openai_key() -> bool:
    key = os.environ.get("OPENAI_API_KEY", "")
    return key.startswith("sk-") and len(key) > 10


def pytest_collection_modifyitems(config, items):
    if not _has_real_openai_key():
        skip = pytest.mark.skip(reason="OPENAI_API_KEY not set or is a placeholder")
        for item in items:
            if "behavioral" in str(item.fspath):
                item.add_marker(skip)
