from __future__ import annotations

from unittest.mock import patch

import pytest
from django.core import mail

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.models import Address, StaffPermission, User, UserOTP
from apps.accounts.tests.helpers import create_user, extract_otp_code

pytestmark = pytest.mark.django_db


def test_customer_register_login_and_me(api_client):
    response = api_client.post(
        "/api/v1/customer/auth/register/",
        {
            "email": "customer@example.com",
            "password": "StrongPass123!",
            "first_name": "Jane",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["role"] == UserRole.CUSTOMER

    response = api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": "customer@example.com", "password": "StrongPass123!"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['data']['access']}")

    response = api_client.get("/api/v1/customer/auth/me/")

    assert response.status_code == 200
    assert response.data["data"]["email"] == "customer@example.com"


def test_email_verification_uses_otp(api_client):
    user = create_user(email="verify@example.com")
    api_client.force_authenticate(user=user)

    response = api_client.post("/api/v1/customer/auth/request-email-verification/")

    assert response.status_code == 200
    assert len(mail.outbox) == 1

    code = extract_otp_code(mail.outbox[0].body)
    response = api_client.post("/api/v1/customer/auth/verify-email/", {"code": code}, format="json")

    assert response.status_code == 200
    user.refresh_from_db()
    assert user.is_email_verified is True


def test_forgot_password_resets_password(api_client):
    user = create_user(email="reset@example.com", password="OldStrongPass123!")

    response = api_client.post(
        "/api/v1/customer/auth/forgot-password/",
        {"email": user.email},
        format="json",
    )

    assert response.status_code == 200
    code = extract_otp_code(mail.outbox[0].body)

    response = api_client.post(
        "/api/v1/customer/auth/reset-password/",
        {"email": user.email, "code": code, "new_password": "NewStrongPass123!"},
        format="json",
    )

    assert response.status_code == 200
    user.refresh_from_db()
    assert user.check_password("NewStrongPass123!")


def test_profile_image_update(api_client):
    user = create_user(email="profile@example.com")
    api_client.force_authenticate(user=user)

    response = api_client.patch(
        "/api/v1/customer/profile/image/",
        {"profile_picture": "https://example.com/avatar.png"},
        format="json",
    )

    assert response.status_code == 200
    user.refresh_from_db()
    assert user.profile_picture == "https://example.com/avatar.png"


def test_customer_addresses_are_owned_and_defaulted(api_client):
    user = create_user(email="address@example.com")
    other = create_user(email="other@example.com")
    api_client.force_authenticate(user=user)

    first = Address.objects.create(
        user=user,
        full_name="Jane",
        phone="123",
        line1="Line 1",
        city="San Francisco",
        postal_code="94105",
        country="US",
        is_default=True,
    )
    other_address = Address.objects.create(
        user=other,
        full_name="Other",
        phone="123",
        line1="Line 1",
        city="San Francisco",
        postal_code="94105",
        country="US",
    )

    response = api_client.post(
        "/api/v1/customer/addresses/",
        {
            "full_name": "Jane Doe",
            "phone": "123",
            "line1": "Line 2",
            "city": "San Francisco",
            "postal_code": "94105",
            "country": "US",
            "is_default": True,
        },
        format="json",
    )

    assert response.status_code == 201
    first.refresh_from_db()
    assert first.is_default is False

    response = api_client.get(f"/api/v1/customer/addresses/{other_address.id}/")

    assert response.status_code == 404


def test_admin_and_superuser_can_manage_users_but_customer_cannot(api_client):
    customer = create_user(email="customer-admin-test@example.com")
    admin = create_user(email="admin@example.com", role=UserRole.ADMIN)
    superuser = create_user(email="root@example.com", is_superuser=True)

    api_client.force_authenticate(user=customer)
    response = api_client.get("/api/v1/admin/users/")
    assert response.status_code == 403

    api_client.force_authenticate(user=admin)
    response = api_client.get("/api/v1/admin/users/")
    assert response.status_code == 200

    api_client.force_authenticate(user=superuser)
    response = api_client.post(
        "/api/v1/admin/users/",
        {
            "email": "created@example.com",
            "password": "StrongPass123!",
            "role": UserRole.CUSTOMER,
        },
        format="json",
    )
    assert response.status_code == 201


def test_admin_can_delete_and_restore_a_user(api_client):
    admin = create_user(email="user-delete-restore-admin@example.com", role=UserRole.ADMIN)
    target = create_user(email="user-delete-restore-target@example.com")
    api_client.force_authenticate(user=admin)

    delete_response = api_client.delete(f"/api/v1/admin/users/{target.id}/")
    assert delete_response.status_code == 200
    assert api_client.get(f"/api/v1/admin/users/{target.id}/").status_code == 404

    listing = api_client.get("/api/v1/admin/users/?include_deleted=true")
    assert str(target.id) in {r["id"] for r in listing.data["data"]["results"]}

    restore_response = api_client.post(f"/api/v1/admin/users/{target.id}/restore/")
    assert restore_response.status_code == 200
    assert api_client.get(f"/api/v1/admin/users/{target.id}/").status_code == 200


def test_admin_cannot_delete_self_or_last_admin(api_client):
    admin = create_user(email="user-delete-self@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.delete(f"/api/v1/admin/users/{admin.id}/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "self_disable"


def test_admin_creates_staff_and_updates_permissions(api_client):
    admin = create_user(email="permission-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.post(
        "/api/v1/admin/staff/",
        {
            "email": "staff@example.com",
            "password": "StrongPass123!",
            "permissions": [StaffPermissionCode.USERS_VIEW],
        },
        format="json",
    )

    assert response.status_code == 201
    staff = User.objects.get(email="staff@example.com")
    assert staff.role == UserRole.STAFF
    assert StaffPermission.objects.filter(
        user=staff,
        permission_code=StaffPermissionCode.USERS_VIEW,
        is_enabled=True,
    ).exists()

    response = api_client.patch(
        f"/api/v1/admin/staff/{staff.id}/permissions/",
        {"permissions": [StaffPermissionCode.REPORTS_VIEW]},
        format="json",
    )

    assert response.status_code == 200
    assert (
        StaffPermission.objects.get(
            user=staff,
            permission_code=StaffPermissionCode.USERS_VIEW,
        ).is_enabled
        is False
    )
    assert (
        StaffPermission.objects.get(
            user=staff,
            permission_code=StaffPermissionCode.REPORTS_VIEW,
        ).is_enabled
        is True
    )


def test_admin_can_delete_and_restore_staff(api_client):
    admin = create_user(email="staff-delete-restore-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    create_response = api_client.post(
        "/api/v1/admin/staff/",
        {"email": "staff-delete-restore@example.com", "password": "StrongPass123!"},
        format="json",
    )
    staff_id = create_response.data["data"]["id"]

    delete_response = api_client.delete(f"/api/v1/admin/staff/{staff_id}/")
    assert delete_response.status_code == 200
    assert api_client.get(f"/api/v1/admin/staff/{staff_id}/").status_code == 404

    restore_response = api_client.post(f"/api/v1/admin/staff/{staff_id}/restore/")
    assert restore_response.status_code == 200
    assert api_client.get(f"/api/v1/admin/staff/{staff_id}/").status_code == 200


def test_phone_verification_flow(api_client):
    user = create_user(email="phone-verify@example.com")
    api_client.force_authenticate(user=user)

    with patch(
        "apps.accounts.services.phone_verification.send_sms",
        return_value=True,
    ):
        response = api_client.post("/api/v1/customer/auth/request-phone-verification/")

    assert response.status_code == 200
    assert response.data["message"] == "Verification code sent to your phone."

    otp = UserOTP.objects.get(user=user, purpose=UserOTP.Purpose.PHONE_VERIFICATION)
    from apps.accounts.services.authentication import _hash_code

    otp.code_hash = _hash_code("654321")
    otp.save(update_fields=["code_hash"])

    response = api_client.post(
        "/api/v1/customer/auth/verify-phone/",
        {"code": "654321"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["is_phone_verified"] is True
    user.refresh_from_db()
    assert user.is_phone_verified is True


def test_phone_change_flow(api_client):
    user = create_user(email="phone-change@example.com")
    api_client.force_authenticate(user=user)

    with patch(
        "apps.accounts.services.phone_verification.send_sms",
        return_value=True,
    ):
        response = api_client.post(
            "/api/v1/customer/auth/request-phone-change/",
            {"new_phone": "+15551111111"},
            format="json",
        )

    assert response.status_code == 200

    otp = UserOTP.objects.get(user=user, purpose=UserOTP.Purpose.PHONE_CHANGE)
    from apps.accounts.services.authentication import _hash_code

    otp.code_hash = _hash_code("123456")
    otp.save(update_fields=["code_hash"])

    response = api_client.post(
        "/api/v1/customer/auth/confirm-phone-change/",
        {"code": "123456", "new_phone": "+15551111111"},
        format="json",
    )

    assert response.status_code == 200
    user.refresh_from_db()
    assert user.phone == "+15551111111"
    assert user.is_phone_verified is True


def test_admin_user_and_staff_lists_are_paginated(api_client):
    admin = create_user(email="pagination-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    for endpoint in ("/api/v1/admin/users/", "/api/v1/admin/staff/"):
        response = api_client.get(endpoint, {"page_size": 1})

        assert response.status_code == 200, endpoint
        data = response.data["data"]
        assert set(data) == {"results", "count", "next", "previous"}, endpoint
        assert len(data["results"]) <= 1, endpoint


def test_admin_user_list_rejects_an_unknown_role_filter(api_client):
    admin = create_user(email="role-filter-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/users/", {"role": "wizard"})

    assert response.status_code == 400
    assert "role" in response.data["error"]["fields"]


def test_admin_can_bulk_deactivate_users(api_client):
    admin = create_user(email="bulk-deactivate-admin@example.com", role=UserRole.ADMIN)
    first = create_user(email="bulk-deactivate-1@example.com")
    second = create_user(email="bulk-deactivate-2@example.com")
    untouched = create_user(email="bulk-deactivate-3@example.com")
    api_client.force_authenticate(user=admin)

    response = api_client.post(
        "/api/v1/admin/users/bulk-deactivate/",
        {"ids": [str(first.id), str(second.id)]},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"] == {"affected": 2}
    first.refresh_from_db()
    second.refresh_from_db()
    untouched.refresh_from_db()
    assert first.is_active is False
    assert second.is_active is False
    assert untouched.is_active is True


def test_bulk_deactivate_still_enforces_the_self_disable_guard(api_client):
    admin = create_user(email="bulk-deactivate-self@example.com", role=UserRole.ADMIN)
    other = create_user(email="bulk-deactivate-other@example.com")
    api_client.force_authenticate(user=admin)

    response = api_client.post(
        "/api/v1/admin/users/bulk-deactivate/",
        {"ids": [str(admin.id), str(other.id)]},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "self_disable"
    admin.refresh_from_db()
    other.refresh_from_db()
    assert admin.is_active is True
    assert other.is_active is True


def test_bulk_deactivate_requires_a_non_empty_id_list(api_client):
    admin = create_user(email="bulk-deactivate-empty@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.post("/api/v1/admin/users/bulk-deactivate/", {"ids": []}, format="json")

    assert response.status_code == 400


def test_customer_cannot_bulk_deactivate_users(api_client):
    customer = create_user(email="bulk-deactivate-customer@example.com")
    target = create_user(email="bulk-deactivate-target@example.com")
    api_client.force_authenticate(user=customer)

    response = api_client.post(
        "/api/v1/admin/users/bulk-deactivate/",
        {"ids": [str(target.id)]},
        format="json",
    )

    assert response.status_code == 403
    target.refresh_from_db()
    assert target.is_active is True


def test_admin_can_list_staff_permission_codes(api_client):
    admin = create_user(email="permission-codes-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/staff/permission-codes/")

    assert response.status_code == 200
    served = response.data["data"]
    assert {item["code"] for item in served} == set(StaffPermissionCode.values)
    assert all(item["id"] == item["code"] for item in served)
    for item in served:
        assert item["label"]
        assert item["domain_label"]
        assert item["code"].startswith(f"{item['domain']}.")


def test_staff_cannot_list_permission_codes(api_client):
    staff = create_user(email="permission-codes-staff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/staff/permission-codes/")

    assert response.status_code == 403


def test_admin_user_list_identifies_guest_checkout_customer_by_name_and_phone(api_client):
    admin = create_user(email="identity-admin@example.com", role=UserRole.ADMIN)
    guest = create_user(email="guest.01712345678@guest.checkout.local")
    User.objects.filter(pk=guest.pk).update(phone="")
    Address.objects.create(
        user=guest,
        full_name="Sadia Karim",
        phone="+8801712345678",
        line1="House 42, Road 11, Banani",
        city="Dhaka",
        state="Gulshan",
        postal_code="1212",
        country="Bangladesh",
        is_default=True,
    )
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/users/", {"search": "Sadia"})

    assert response.status_code == 200
    row = next(r for r in response.data["data"]["results"] if r["id"] == str(guest.id))
    assert row["display_name"] == "Sadia Karim"
    assert row["contact_phone"] == "+8801712345678"


def test_admin_can_list_a_customers_addresses(api_client):
    admin = create_user(email="address-picker-admin@example.com", role=UserRole.ADMIN)
    customer = create_user(email="address-picker-customer@example.com")
    Address.objects.create(
        user=customer,
        full_name="Imran Sarker",
        phone="+8801811223344",
        line1="Sonadanga R/A, Block B",
        line2="Ring the bell twice",
        city="Khulna",
        state="Sonadanga",
        postal_code="9100",
        country="Bangladesh",
        is_default=True,
    )
    api_client.force_authenticate(user=admin)

    response = api_client.get(f"/api/v1/admin/users/{customer.id}/addresses/")

    assert response.status_code == 200
    row = response.data["data"][0]
    assert row["line1"] == "Sonadanga R/A, Block B"
    assert row["delivery_note"] == "Ring the bell twice"
    assert row["is_default"] is True


def test_admin_can_create_a_customers_billing_and_shipping_addresses(api_client):
    admin = create_user(email="address-create-admin@example.com", role=UserRole.ADMIN)
    customer = create_user(email="address-create-customer@example.com")
    api_client.force_authenticate(user=admin)

    shipping_response = api_client.post(
        f"/api/v1/admin/users/{customer.id}/addresses/",
        {
            "address_type": "shipping",
            "full_name": "Nadia Rahman",
            "phone": "+8801711111111",
            "line1": "House 10, Road 7",
            "city": "Dhaka",
            "state": "Dhanmondi",
            "postal_code": "1209",
            "country": "Bangladesh",
            "is_default": True,
        },
        format="json",
    )
    billing_response = api_client.post(
        f"/api/v1/admin/users/{customer.id}/addresses/",
        {
            "address_type": "billing",
            "full_name": "Nadia Rahman",
            "phone": "+8801711111111",
            "line1": "Flat B2, Billing Road",
            "country": "Bangladesh",
        },
        format="json",
    )

    assert shipping_response.status_code == 201
    assert billing_response.status_code == 201
    assert shipping_response.data["data"]["address_type"] == "shipping"
    assert billing_response.data["data"]["address_type"] == "billing"

    addresses = Address.objects.filter(user=customer, deleted_at__isnull=True).order_by(
        "address_type"
    )
    assert [address.address_type for address in addresses] == ["billing", "shipping"]
