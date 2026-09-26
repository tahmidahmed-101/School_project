from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import CategoryFactory, ProductFactory

pytestmark = pytest.mark.django_db


def png(name: str = "photo.png") -> SimpleUploadedFile:
    """A fresh file per call — an upload consumes the pointer, so a shared one
    would post an empty body to every test after the first."""
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), "blue").save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def _admin(api_client):
    api_client.force_authenticate(
        user=create_user(email="catalog-image-admin@example.com", role=UserRole.ADMIN)
    )
    return api_client


def test_category_has_no_image_by_default(api_client):
    category = CategoryFactory()
    response = _admin(api_client).get(f"/api/v1/admin/catalog/categories/{category.id}/")

    assert response.status_code == 200
    assert response.data["data"]["image"] is None


def test_category_image_can_be_uploaded_and_previewed(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    category = CategoryFactory()
    client = _admin(api_client)

    response = client.patch(
        f"/api/v1/admin/catalog/categories/{category.id}/",
        {"image": png()},
        format="multipart",
    )

    assert response.status_code == 200
    url = response.data["data"]["image"]
    assert url and url.endswith(".png")

    detail = client.get(f"/api/v1/admin/catalog/categories/{category.id}/")
    assert detail.data["data"]["image"] == url


def test_category_text_fields_still_update_without_an_image(api_client):
    category = CategoryFactory(name="Old Name")
    response = _admin(api_client).patch(
        f"/api/v1/admin/catalog/categories/{category.id}/", {"name": "New Name"}
    )

    assert response.status_code == 200
    assert response.data["data"]["name"] == "New Name"
    assert response.data["data"]["image"] is None


def test_product_has_no_image_by_default(api_client):
    product = ProductFactory()
    response = _admin(api_client).get(f"/api/v1/admin/catalog/products/{product.id}/")

    assert response.status_code == 200
    assert response.data["data"]["image"] is None


def test_product_image_can_be_uploaded_and_previewed(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    product = ProductFactory()
    client = _admin(api_client)

    response = client.patch(
        f"/api/v1/admin/catalog/products/{product.id}/",
        {"image": png()},
        format="multipart",
    )

    assert response.status_code == 200
    url = response.data["data"]["image"]
    assert url and url.endswith(".png")

    detail = client.get(f"/api/v1/admin/catalog/products/{product.id}/")
    assert detail.data["data"]["image"] == url


def test_product_text_fields_still_update_without_an_image(api_client):
    product = ProductFactory(name="Old Product")
    response = _admin(api_client).patch(
        f"/api/v1/admin/catalog/products/{product.id}/", {"name": "New Product"}
    )

    assert response.status_code == 200
    assert response.data["data"]["name"] == "New Product"
    assert response.data["data"]["image"] is None


def test_non_image_file_is_rejected_for_category_image(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    category = CategoryFactory()
    payload = SimpleUploadedFile("notes.txt", b"hello", content_type="text/plain")

    response = _admin(api_client).patch(
        f"/api/v1/admin/catalog/categories/{category.id}/",
        {"image": payload},
        format="multipart",
    )

    assert response.status_code == 400
