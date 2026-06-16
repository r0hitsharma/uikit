"""conftest.py for mcp-relay-python standalone tests.

Tests that import ``host.*`` are integration tests that only run when host
is installed alongside this package. Skip them gracefully in a standalone run.
"""

from __future__ import annotations

import importlib.util

import pytest

# True when host is resolvable in the current environment.
_HOST_AVAILABLE = importlib.util.find_spec("host") is not None

# Names of tests that directly import host and must be skipped standalone.
_HOST_TESTS = {
    "test_relay_tools_list_advertises_atlas_search",
    "test_no_fastmcp_mount_in_host_mcp",
    "test_relay_is_sole_mcp_handler",
}


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Skip host-dependent tests when host is not installed."""
    if _HOST_AVAILABLE:
        return
    skip = pytest.mark.skip(reason="host not installed in standalone mcp-relay-python env")
    for item in items:
        if item.name in _HOST_TESTS:
            item.add_marker(skip)
