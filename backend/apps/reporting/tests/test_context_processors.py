from __future__ import annotations

import pytest

from apps.audit.factories import LoginHistoryFactory
from apps.reporting.context_processors import admin_dashboard_stats

pytestmark = pytest.mark.django_db


def test_admin_dashboard_stats_counts_critical_signals(rf):
    request = rf.get("/admin/")

    LoginHistoryFactory(was_successful=False)
    LoginHistoryFactory(was_successful=True)

    stats = admin_dashboard_stats(request)["admin_stats"]

    assert stats["failed_logins"] == 1


def test_admin_dashboard_stats_skips_non_admin_paths(rf):
    request = rf.get("/api/v1/public/catalog/variants/")

    assert admin_dashboard_stats(request) == {}
