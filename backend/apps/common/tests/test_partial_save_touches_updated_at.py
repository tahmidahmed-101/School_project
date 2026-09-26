from __future__ import annotations

import pytest

from apps.logistics.factories import CarrierFactory

pytestmark = pytest.mark.django_db


def test_partial_save_refreshes_updated_at_without_naming_it():
    carrier = CarrierFactory()
    before = carrier.updated_at

    carrier.name = "Renamed"
    carrier.save(update_fields=["name"])

    carrier.refresh_from_db()
    assert carrier.updated_at > before
    assert carrier.name == "Renamed"


def test_deactivate_refreshes_updated_at():
    carrier = CarrierFactory()
    before = carrier.updated_at

    carrier.deactivate()

    carrier.refresh_from_db()
    assert carrier.is_active is False
    assert carrier.updated_at > before


def test_empty_update_fields_still_writes_nothing():
    carrier = CarrierFactory()
    before = carrier.updated_at

    carrier.save(update_fields=[])

    carrier.refresh_from_db()
    assert carrier.updated_at == before
