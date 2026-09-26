from __future__ import annotations

import pytest
from django.core import mail

from apps.accounts.tests.helpers import extract_otp_code

pytestmark = pytest.mark.django_db


def test_customer_end_to_end_account_flow(api_client):
    register_response = api_client.post(
        "/api/v1/customer/auth/register/",
        {
            "email": "flow@example.com",
            "password": "StrongPass123!",
            "first_name": "Flow",
            "last_name": "User",
        },
        format="json",
    )

    assert register_response.status_code == 201

    login_response = api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": "flow@example.com", "password": "StrongPass123!"},
        format="json",
    )

    assert login_response.status_code == 200
    access_token = login_response.data["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    verify_request_response = api_client.post("/api/v1/customer/auth/request-email-verification/")

    assert verify_request_response.status_code == 200

    code = extract_otp_code(mail.outbox[-1].body)
    verify_response = api_client.post(
        "/api/v1/customer/auth/verify-email/",
        {"code": code},
        format="json",
    )

    assert verify_response.status_code == 200
    assert verify_response.data["data"]["is_email_verified"] is True

    profile_response = api_client.patch(
        "/api/v1/customer/profile/",
        {"phone": "+15550001111", "profile_picture": "avatars/flow.png"},
        format="json",
    )

    assert profile_response.status_code == 200
    assert profile_response.data["data"]["phone"] == "+15550001111"
    assert profile_response.data["data"]["profile_picture"] == "avatars/flow.png"

    address_response = api_client.post(
        "/api/v1/customer/addresses/",
        {
            "full_name": "Flow User",
            "phone": "+15550001111",
            "line1": "123 Market Street",
            "postal_code": "94105",
            "country": "US",
            "is_default": True,
        },
        format="json",
    )

    assert address_response.status_code == 201
    assert address_response.data["data"]["is_default"] is True

    address_id = address_response.data["data"]["id"]
    address_detail_response = api_client.get(f"/api/v1/customer/addresses/{address_id}/")

    assert address_detail_response.status_code == 200
    assert address_detail_response.data["data"]["line1"] == "123 Market Street"

    change_password_response = api_client.post(
        "/api/v1/customer/profile/change-password/",
        {
            "old_password": "StrongPass123!",
            "new_password": "StrongerPass123!",
        },
        format="json",
    )

    assert change_password_response.status_code == 200

    api_client.credentials()
    old_login_response = api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": "flow@example.com", "password": "StrongPass123!"},
        format="json",
    )
    new_login_response = api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": "flow@example.com", "password": "StrongerPass123!"},
        format="json",
    )

    assert old_login_response.status_code == 401
    assert new_login_response.status_code == 200
