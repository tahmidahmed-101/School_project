from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.logistics.factories import CarrierFactory, ShippingRateFactory, ShippingZoneFactory
from apps.logistics.models import ShippingRate
from apps.orders.factories import SalesOrderFactory
from apps.orders.models import Shipment

pytestmark = pytest.mark.django_db


def test_staff_without_permission_cannot_list_carriers(api_client):
    staff = create_user(email="logi-staff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/logistics/carriers/")

    assert response.status_code == 403


def test_staff_with_view_permission_can_list_carriers(api_client):
    staff = create_user(email="logi-staff-view@example.com", role=UserRole.STAFF)
    admin = create_user(email="logi-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.SHIPMENTS_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)
    baseline = api_client.get("/api/v1/admin/logistics/carriers/").data["data"]["count"]
    CarrierFactory()

    response = api_client.get("/api/v1/admin/logistics/carriers/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == baseline + 1


def test_view_only_staff_cannot_create_carrier(api_client):
    staff = create_user(email="logi-staff-view-only@example.com", role=UserRole.STAFF)
    admin = create_user(email="logi-grantor-2@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.SHIPMENTS_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    response = api_client.post("/api/v1/admin/logistics/carriers/", {"name": "DHL"})

    assert response.status_code == 403


def _admin(api_client, email):
    admin = create_user(email=email, role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    return admin


def test_carrier_delete_soft_deletes_instead_of_deactivating(api_client):
    _admin(api_client, "logi-carrier-delete@example.com")
    baseline = api_client.get("/api/v1/admin/logistics/carriers/").data["data"]["count"]
    carrier = CarrierFactory()

    response = api_client.delete(f"/api/v1/admin/logistics/carriers/{carrier.id}/")

    assert response.status_code == 200
    carrier.refresh_from_db()
    assert carrier.deleted_at is not None
    assert carrier.is_active is True

    listing = api_client.get("/api/v1/admin/logistics/carriers/")
    assert listing.data["data"]["count"] == baseline


def test_carrier_delete_blocked_while_shipment_in_flight(api_client):
    _admin(api_client, "logi-carrier-in-use@example.com")
    carrier = CarrierFactory()
    order = SalesOrderFactory()
    Shipment.objects.create(order=order, carrier=carrier, status=Shipment.Status.IN_TRANSIT)

    response = api_client.delete(f"/api/v1/admin/logistics/carriers/{carrier.id}/")

    assert response.status_code == 409
    assert response.data["error"]["code"] == "carrier_in_use"


def test_carrier_delete_returns_404_for_unknown_id(api_client):
    _admin(api_client, "logi-carrier-delete-404@example.com")

    response = api_client.delete(f"/api/v1/admin/logistics/carriers/{uuid4()}/")

    assert response.status_code == 404


def test_carrier_restore_and_include_deleted(api_client):
    _admin(api_client, "logi-carrier-restore@example.com")
    baseline = api_client.get("/api/v1/admin/logistics/carriers/?include_deleted=true").data[
        "data"
    ]["count"]
    carrier = CarrierFactory()
    api_client.delete(f"/api/v1/admin/logistics/carriers/{carrier.id}/")

    listing = api_client.get("/api/v1/admin/logistics/carriers/?include_deleted=true")
    assert listing.data["data"]["count"] == baseline + 1

    response = api_client.post(f"/api/v1/admin/logistics/carriers/{carrier.id}/restore/")

    assert response.status_code == 200
    carrier.refresh_from_db()
    assert carrier.deleted_at is None


def test_carrier_list_marks_deleted_rows(api_client):
    _admin(api_client, "logi-carrier-deleted-at@example.com")
    live = CarrierFactory()
    deleted = CarrierFactory()
    api_client.delete(f"/api/v1/admin/logistics/carriers/{deleted.id}/")

    listing = api_client.get("/api/v1/admin/logistics/carriers/?include_deleted=true")

    by_id = {row["id"]: row for row in listing.data["data"]["results"]}
    assert by_id[str(live.id)]["deleted_at"] is None
    assert by_id[str(deleted.id)]["deleted_at"] is not None


def test_carrier_include_deleted_denied_for_view_only_staff(api_client):
    staff = create_user(email="logi-incl-denied@example.com", role=UserRole.STAFF)
    admin = create_user(email="logi-incl-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.SHIPMENTS_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)

    assert api_client.get("/api/v1/admin/logistics/carriers/").status_code == 200
    assert (
        api_client.get("/api/v1/admin/logistics/carriers/?include_deleted=true").status_code == 403
    )


def test_carrier_restore_denied_for_view_only_staff(api_client):
    staff = create_user(email="logi-restore-denied@example.com", role=UserRole.STAFF)
    admin = create_user(email="logi-restore-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.SHIPMENTS_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)
    carrier = CarrierFactory()

    response = api_client.post(f"/api/v1/admin/logistics/carriers/{carrier.id}/restore/")

    assert response.status_code == 403


def test_zone_delete_soft_deletes_and_restores(api_client):
    _admin(api_client, "logi-zone-delete@example.com")
    baseline = api_client.get("/api/v1/admin/logistics/zones/").data["data"]["count"]
    baseline_with_deleted = api_client.get(
        "/api/v1/admin/logistics/zones/?include_deleted=true"
    ).data["data"]["count"]
    zone = ShippingZoneFactory()

    response = api_client.delete(f"/api/v1/admin/logistics/zones/{zone.id}/")

    assert response.status_code == 200
    zone.refresh_from_db()
    assert zone.deleted_at is not None
    assert zone.is_active is True
    assert api_client.get("/api/v1/admin/logistics/zones/").data["data"]["count"] == baseline
    assert (
        api_client.get("/api/v1/admin/logistics/zones/?include_deleted=true").data["data"]["count"]
        == baseline_with_deleted + 1
    )

    restore = api_client.post(f"/api/v1/admin/logistics/zones/{zone.id}/restore/")

    assert restore.status_code == 200
    zone.refresh_from_db()
    assert zone.deleted_at is None


def test_rate_list_filters_by_zone_and_carrier(api_client):
    _admin(api_client, "logi-rate-list@example.com")
    baseline = api_client.get("/api/v1/admin/logistics/rates/").data["data"]["count"]
    zone = ShippingZoneFactory()
    other_zone = ShippingZoneFactory()
    carrier = CarrierFactory()
    ShippingRateFactory(zone=zone, carrier=carrier)
    ShippingRateFactory(zone=other_zone, carrier=carrier)

    assert api_client.get("/api/v1/admin/logistics/rates/").data["data"]["count"] == baseline + 2
    filtered = api_client.get(f"/api/v1/admin/logistics/rates/?zone_id={zone.id}")
    assert filtered.data["data"]["count"] == 1
    by_carrier = api_client.get(f"/api/v1/admin/logistics/rates/?carrier_id={carrier.id}")
    assert by_carrier.data["data"]["count"] == 2


def test_rate_list_hides_rates_of_deleted_zone(api_client):
    _admin(api_client, "logi-rate-list-deleted@example.com")
    baseline = api_client.get("/api/v1/admin/logistics/rates/").data["data"]["count"]
    zone = ShippingZoneFactory()
    ShippingRateFactory(zone=zone)
    api_client.delete(f"/api/v1/admin/logistics/zones/{zone.id}/")

    assert api_client.get("/api/v1/admin/logistics/rates/").data["data"]["count"] == baseline


def test_rate_detail_get(api_client):
    _admin(api_client, "logi-rate-detail@example.com")
    rate = ShippingRateFactory()

    response = api_client.get(f"/api/v1/admin/logistics/rates/{rate.id}/")

    assert response.status_code == 200
    assert response.data["data"]["id"] == str(rate.id)
    assert response.data["data"]["zone_id"] == str(rate.zone_id)


def test_rate_detail_returns_404_for_unknown_id(api_client):
    _admin(api_client, "logi-rate-detail-404@example.com")

    response = api_client.get(f"/api/v1/admin/logistics/rates/{uuid4()}/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "rate_not_found"


def test_rate_delete_hard_deletes(api_client):
    _admin(api_client, "logi-rate-delete@example.com")
    rate = ShippingRateFactory()

    response = api_client.delete(f"/api/v1/admin/logistics/rates/{rate.id}/")

    assert response.status_code == 200
    assert not ShippingRate.objects.filter(id=rate.id).exists()


def test_rate_list_denied_without_permission(api_client):
    staff = create_user(email="logi-rate-list-denied@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    assert api_client.get("/api/v1/admin/logistics/rates/").status_code == 403


def test_add_rate_to_zone_uses_base_and_increment_fields(api_client):
    _admin(api_client, "logi-add-rate@example.com")
    zone = ShippingZoneFactory()
    carrier = CarrierFactory()

    response = api_client.post(
        f"/api/v1/admin/logistics/zones/{zone.id}/rates/",
        {
            "carrier_id": str(carrier.id),
            "base_weight": "1.000",
            "base_charge": "60.00",
            "increment_weight": "1.000",
            "increment_charge": "15.00",
        },
        format="json",
    )

    assert response.status_code == 201
    rate = ShippingRate.objects.get(zone=zone, carrier=carrier)
    assert rate.base_charge == Decimal("60.00")
    assert rate.increment_charge == Decimal("15.00")


def test_add_rate_rejects_a_second_rate_for_the_same_zone_and_carrier(api_client):
    _admin(api_client, "logi-add-rate-dup@example.com")
    rate = ShippingRateFactory()

    response = api_client.post(
        f"/api/v1/admin/logistics/zones/{rate.zone_id}/rates/",
        {
            "carrier_id": str(rate.carrier_id),
            "base_weight": "0",
            "base_charge": "10.00",
            "increment_weight": "1",
            "increment_charge": "5.00",
        },
        format="json",
    )

    assert response.status_code == 409
    assert response.data["error"]["code"] == "rate_exists"
