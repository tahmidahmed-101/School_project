from __future__ import annotations

import pytest

from apps.accounting.tests.helpers import seed_chart_of_accounts


@pytest.fixture(autouse=True)
def _chart_of_accounts(db):
    """Shipment/payment services post journal entries — the chart of
    accounts must exist first, same as it must in a real deployment
    (`manage.py seed_chart_of_accounts`)."""
    seed_chart_of_accounts()
