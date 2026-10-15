from __future__ import annotations

import pytest

from apps.accounts.factories import (
    AddressFactory,
    AdminUserFactory,
    CustomerUserFactory,
    StaffUserFactory,
    SuperUserFactory,
)


@pytest.fixture
def user_factory():
    from apps.accounts.factories import UserFactory

    return UserFactory


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def customer_user():
    return CustomerUserFactory()


@pytest.fixture
def admin_user():
    return AdminUserFactory()


@pytest.fixture
def superuser():
    return SuperUserFactory()


@pytest.fixture
def staff_user():
    return StaffUserFactory()


@pytest.fixture
def address(customer_user):
    return AddressFactory(user=customer_user)


@pytest.fixture(autouse=True)
def _isolate_seeded_shipping_zones(db):  # noqa: ARG001 -- needed only to enable db access
    """Migrations seed live ops zones (Inside/Outside Dhaka and their rates).
    Left in place they out-match the zones tests build, so quotes resolve to the
    seeded rate instead of the fixture's."""
    from apps.logistics.models import ShippingZone

    ShippingZone.objects.all().delete()


@pytest.fixture(autouse=True)
def _forget_live_sales():
    """The test cache outlives a test's rolled-back database, so a sale one
    test made would still be priced in by the next."""
    from apps.catalog.selectors.sales import clear_live_sales_cache

    clear_live_sales_cache()
    yield
    clear_live_sales_cache()


@pytest.fixture
def telegram_outbox(settings):
    """Switch the Telegram bot on with a fake token and capture every Bot API
    call as `(method, payload)` instead of sending it."""
    import json
    from unittest.mock import MagicMock, patch

    from django.core.cache import cache

    settings.TELEGRAM_BOT_TOKEN = "test-token"  # noqa: S105 -- a fake value
    cache.clear()
    calls: list[tuple[str, dict]] = []

    def fake_urlopen(request, timeout=None):  # noqa: ARG001
        calls.append((request.full_url.rsplit("/", 1)[1], json.loads(request.data)))
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b'{"ok": true, "result": {}}'
        return response

    with patch("apps.common.services.telegram.urllib.request.urlopen", fake_urlopen):
        yield calls
    cache.clear()
