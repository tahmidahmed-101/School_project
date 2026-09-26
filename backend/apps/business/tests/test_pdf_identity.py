from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from django.conf import settings
from django.template.loader import render_to_string
from django.test import override_settings

from apps.accounts.constants import UserRole
from apps.accounts.factories import AddressFactory
from apps.accounts.tests.helpers import create_user
from apps.business.selectors import get_business_profile
from apps.business.services import update_business_profile
from apps.catalog.factories import ProductVariantFactory
from apps.common.pdf.render import business_identity
from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory

pytestmark = pytest.mark.django_db


def test_pdf_identity_prefers_the_saved_profile():
    update_business_profile(
        profile=get_business_profile(),
        data={
            "name": "Renamed Park",
            "address_line": "Boro Bazar",
            "district": "Khulna",
            "tax_id": "004488119900",
        },
    )

    identity = business_identity()

    assert identity["name"] == "Renamed Park"
    assert identity["address"] == "Boro Bazar, Khulna"
    assert identity["tax_id"] == "004488119900"


def test_blank_profile_fields_fall_back_to_settings():
    update_business_profile(
        profile=get_business_profile(), data={"phone": "", "email": "", "legal_name": ""}
    )

    identity = business_identity()

    assert identity["phone"] == settings.BUSINESS_IDENTITY["phone"]
    assert identity["email"] == settings.BUSINESS_IDENTITY["email"]


@override_settings(BUSINESS_IDENTITY={"name": "Fallback Co", "tax_id": ""})
def test_blank_on_both_sides_is_dropped_rather_than_printed():
    update_business_profile(profile=get_business_profile(), data={"tax_id": ""})

    assert "tax_id" not in business_identity()


def test_pdf_header_renders_the_saved_business_details():
    update_business_profile(
        profile=get_business_profile(),
        data={"name": "Renamed Park", "address_line": "Boro Bazar", "district": "Khulna"},
    )

    html = render_to_string(
        "pdf/base.html",
        {"business": business_identity(), "currency": settings.CURRENCY_SYMBOL},
    )

    assert "Renamed Park" in html
    assert "Boro Bazar, Khulna" in html


def test_invoice_pdf_still_renders_after_the_profile_is_edited(api_client):
    update_business_profile(profile=get_business_profile(), data={"name": "Renamed Park"})
    admin = create_user(email="business-invoice-pdf@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    customer = create_user(email=f"business-buyer-{uuid4().hex[:8]}@example.com")
    order = SalesOrderFactory(customer=customer, shipping_address=AddressFactory(user=customer))
    SalesOrderLineFactory(
        order=order,
        variant=ProductVariantFactory(),
        quantity=2,
        unit_price=Decimal("1250.00"),
    )
    order.recalculate_totals()

    response = api_client.get(f"/api/v1/admin/orders/{order.id}/invoice/")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF-")
    assert len(response.content) > 1000
    assert settings.CURRENCY_SYMBOL == "৳"


def test_money_filter_follows_the_configured_currency_symbol():
    from apps.common.templatetags.pdf_format import money

    update_business_profile(profile=get_business_profile(), data={"currency_symbol": "₹"})

    assert money("1234.5") == "₹1,234.50"


def test_changing_the_symbol_again_is_not_served_from_the_cache():
    from apps.common.templatetags.pdf_format import money

    update_business_profile(profile=get_business_profile(), data={"currency_symbol": "₹"})
    assert money("1") == "₹1.00"

    update_business_profile(profile=get_business_profile(), data={"currency_symbol": "$"})

    assert money("1") == "$1.00"
