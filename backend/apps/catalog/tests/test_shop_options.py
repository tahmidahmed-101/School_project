from __future__ import annotations

import pytest

from apps.catalog.factories import ProductFactory, make_options
from apps.catalog.models import ProductOption
from apps.catalog.selectors.options import product_options
from apps.catalog.services.options import create_shop_option, set_product_options

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/catalog/"


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def test_admin_creates_lists_and_reads_a_shop_option(admin_client):
    response = admin_client.post(
        f"{BASE}options/", {"name": "  Size ", "values": ["S", " M ", "L"]}, format="json"
    )
    assert response.status_code == 201
    created = response.data["data"]
    assert created["name"] == "Size"
    assert created["values"] == ["S", "M", "L"]

    listed = admin_client.get(f"{BASE}options/").data["data"]["results"]
    assert [row["name"] for row in listed] == ["Size"]
    assert admin_client.get(f"{BASE}options/{created['id']}/").data["data"] == created


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "size", "values": ["XL"]},
        {"name": "Fit", "values": []},
        {"name": "Fit", "values": ["Slim", "slim"]},
    ],
)
def test_admin_shop_option_refuses_a_taken_name_and_bad_values(admin_client, payload):
    create_shop_option(name="Size", values=["S"])
    response = admin_client.post(f"{BASE}options/", payload, format="json")
    assert response.status_code == 400
    assert ProductOption.objects.count() == 1


def test_admin_updates_and_deletes_a_shop_option(admin_client):
    option = create_shop_option(name="Size", values=["S", "M"])
    url = f"{BASE}options/{option.id}/"

    response = admin_client.patch(url, {"name": "Sizes", "values": ["M", "L", "XL"]}, format="json")
    assert response.status_code == 200
    assert response.data["data"]["name"] == "Sizes"
    assert response.data["data"]["values"] == ["M", "L", "XL"]

    assert admin_client.delete(url).status_code == 200
    assert admin_client.get(url).status_code == 404


def test_shop_option_endpoints_do_not_reach_a_products_option(admin_client):
    product = ProductFactory()
    make_options(product, {"Size": ["S", "M"]})
    owned = product.options.get()

    assert admin_client.get(f"{BASE}options/").data["data"]["results"] == []
    assert admin_client.delete(f"{BASE}options/{owned.id}/").status_code == 404
    assert product.options.count() == 1


def test_a_product_takes_its_own_copy_of_a_shop_option(admin_client):
    shop = create_shop_option(name="Size", values=["S", "M"])
    product = ProductFactory()
    set_product_options(
        product=product, options=[{"name": "Size", "values": [{"value": "S"}, {"value": "M"}]}]
    )

    admin_client.delete(f"{BASE}options/{shop.id}/")

    assert [option["name"] for option in product_options(product)] == ["Size"]


def test_shop_options_need_a_login(api_client):
    assert api_client.get(f"{BASE}options/").status_code in (401, 403)


def test_option_suggestions_offer_shop_options_before_used_text(admin_client):
    create_shop_option(name="Material", values=["Cotton", "Linen"])
    create_shop_option(name="Size", values=["S", "M", "L"])
    make_options(ProductFactory(), {"Colour": ["Red"], "size": ["M", "XXL"]})

    names = admin_client.get(f"{BASE}option-suggestions/").data["data"]["names"]
    assert names == ["Material", "Size", "Colour"]

    # A shop option no product uses yet still offers its values, in the order typed.
    unused = admin_client.get(f"{BASE}option-suggestions/", {"name": "material"}).data["data"]
    assert unused["values"] == ["Cotton", "Linen"]

    mixed = admin_client.get(f"{BASE}option-suggestions/", {"name": "Size"}).data["data"]
    assert mixed["values"] == ["S", "M", "L", "XXL"]


def test_an_inactive_shop_option_is_listed_but_no_longer_offered(admin_client):
    size = create_shop_option(name="Size", values=["S", "M"])
    create_shop_option(name="Colour", values=["Red"])

    response = admin_client.patch(f"{BASE}options/{size.id}/", {"is_active": False}, format="json")
    assert response.status_code == 200
    assert response.data["data"]["is_active"] is False
    assert response.data["data"]["values"] == ["S", "M"]

    every = admin_client.get(f"{BASE}options/").data["data"]["results"]
    assert [(row["name"], row["is_active"]) for row in every] == [("Colour", True), ("Size", False)]
    active = admin_client.get(f"{BASE}options/", {"is_active": "true"}).data["data"]["results"]
    assert [row["name"] for row in active] == ["Colour"]

    suggestions = admin_client.get(f"{BASE}option-suggestions/", {"name": "Size"}).data["data"]
    assert suggestions == {"names": ["Colour"], "values": []}
