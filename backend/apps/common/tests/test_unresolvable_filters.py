"""A foreign-key filter that cannot be resolved must never fall back to the
whole table — the variants CSV export makes that a data-exposure bug."""

from __future__ import annotations

from uuid import uuid4

import pytest

from apps.catalog.factories import CategoryFactory, ProductFactory, ProductVariantFactory
from apps.inventory.factories import StockItemFactory, StockLedgerEntryFactory
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.logistics.services.rates import delete_carrier

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def test_rates_filtered_by_deleted_carrier_do_not_return_everything(admin_client):
    carrier = CarrierFactory()
    zone = ShippingZoneFactory()
    ShippingRateFactory(zone=zone, carrier=carrier)
    ShippingRateFactory(zone=zone, carrier=CarrierFactory())
    delete_carrier(carrier=carrier)

    response = admin_client.get("/api/v1/admin/logistics/rates/", {"carrier_id": str(carrier.id)})

    assert response.status_code == 400
    assert response.data["error"]["fields"]["carrier_id"]


def test_rates_without_carrier_filter_still_return_everything(admin_client):
    baseline = admin_client.get("/api/v1/admin/logistics/rates/").data["data"]["count"]
    zone = ShippingZoneFactory()
    ShippingRateFactory(zone=zone, carrier=CarrierFactory())
    ShippingRateFactory(zone=zone, carrier=CarrierFactory())

    response = admin_client.get("/api/v1/admin/logistics/rates/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == baseline + 2


def test_variant_export_with_stale_product_id_does_not_dump_catalog(admin_client):
    ProductVariantFactory(sku="SECRET-SKU-1")
    ProductVariantFactory(sku="SECRET-SKU-2")

    response = admin_client.get(
        "/api/v1/admin/catalog/variants/export/", {"product_id": str(uuid4())}
    )

    assert response.status_code == 400
    assert "SECRET-SKU-1" not in response.content.decode()


def test_variant_export_without_product_filter_exports_catalog(admin_client):
    ProductVariantFactory(sku="EXPORTED-SKU")

    response = admin_client.get("/api/v1/admin/catalog/variants/export/")

    assert response.status_code == 200
    assert "EXPORTED-SKU" in response.content.decode()


@pytest.mark.parametrize(
    ("url", "param"),
    [
        ("/api/v1/admin/catalog/variants/", "product_id"),
        ("/api/v1/admin/catalog/variants/", "category_id"),
        ("/api/v1/admin/catalog/products/", "category_id"),
        ("/api/v1/admin/inventory/stock-items/", "variant_id"),
        ("/api/v1/admin/inventory/ledger-entries/", "variant_id"),
        ("/api/v1/admin/logistics/rates/", "zone_id"),
    ],
)
def test_unresolvable_filter_id_is_rejected(admin_client, url, param):
    CategoryFactory()
    ProductFactory()
    StockItemFactory(variant=ProductVariantFactory())
    StockLedgerEntryFactory()
    ShippingRateFactory(zone=ShippingZoneFactory(), carrier=CarrierFactory())

    response = admin_client.get(url, {param: str(uuid4())})

    assert response.status_code == 400


def test_public_product_list_rejects_unresolvable_category(api_client):
    ProductFactory()

    response = api_client.get("/api/v1/public/catalog/products/", {"category_id": str(uuid4())})

    assert response.status_code == 400
