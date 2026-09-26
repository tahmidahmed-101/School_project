from __future__ import annotations

import pytest

from apps.accounting.tests.helpers import seed_chart_of_accounts


@pytest.fixture(autouse=True)
def _chart_of_accounts(db):
    seed_chart_of_accounts()
