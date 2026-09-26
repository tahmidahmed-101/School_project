from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from pillow_heif import register_heif_opener

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductFactory

register_heif_opener()

pytestmark = pytest.mark.django_db

UPLOAD_URL = "/api/v1/admin/media/uploads/"


def png() -> SimpleUploadedFile:
    """A fresh file per call — an upload consumes the pointer, so a shared one
    would post an empty body to every test after the first."""
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), "black").save(buffer, format="PNG")
    return SimpleUploadedFile("shot.png", buffer.getvalue(), content_type="image/png")


def _admin(api_client):
    api_client.force_authenticate(user=create_user(email="media@example.com", role=UserRole.ADMIN))
    return api_client


def test_upload_returns_a_servable_url(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    response = _admin(api_client).post(UPLOAD_URL, {"file": png()}, format="multipart")

    assert response.status_code == 201
    url = response.data["data"]["url"]
    assert "/media/uploads/" in url and url.endswith(".png")


def test_uploaded_url_fits_the_product_image_column(api_client, settings, tmp_path):
    """The admin panel used to inline images as base64 data URLs, which blew past
    ProductImage.url's 500 characters and 500'd on save."""
    settings.MEDIA_ROOT = tmp_path
    client = _admin(api_client)
    url = client.post(UPLOAD_URL, {"file": png()}, format="multipart").data["data"]["url"]

    product = ProductFactory()
    response = client.post(f"/api/v1/admin/catalog/products/{product.id}/images/", {"url": url})

    assert response.status_code == 201
    assert len(url) <= 500


def test_a_non_image_wearing_an_image_name_is_rejected(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    payload = SimpleUploadedFile("payload.png", b"<script>alert(1)</script>", "image/png")

    response = _admin(api_client).post(UPLOAD_URL, {"file": payload}, format="multipart")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_image"


def test_non_image_upload_is_rejected(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    payload = SimpleUploadedFile("notes.txt", b"hello", content_type="text/plain")

    response = _admin(api_client).post(UPLOAD_URL, {"file": payload}, format="multipart")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_image"


@pytest.mark.parametrize(
    ("name", "content_type"),
    [
        ("photo.jfif", "image/jpeg"),
        ("photo", ""),
        ("photo.png", ""),
        ("photo.png", "application/octet-stream"),
        ("PHOTO.PNG", "image/png"),
    ],
)
def test_honest_image_survives_a_misleading_name_or_type(
    api_client, settings, tmp_path, name, content_type
):
    """Filename and Content-Type are caller-supplied; Windows writes ".jfif" and
    some browsers send no type at all. The decoded bytes decide."""
    settings.MEDIA_ROOT = tmp_path
    upload = SimpleUploadedFile(name, png().read(), content_type=content_type)

    response = _admin(api_client).post(UPLOAD_URL, {"file": upload}, format="multipart")

    assert response.status_code == 201
    assert response.data["data"]["url"].endswith(".png")


def test_extension_comes_from_the_bytes_not_the_name(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    upload = SimpleUploadedFile("actually_a_png.webp", png().read(), content_type="image/webp")

    response = _admin(api_client).post(UPLOAD_URL, {"file": upload}, format="multipart")

    assert response.status_code == 201
    assert response.data["data"]["url"].endswith(".png")


def test_svg_is_rejected(api_client, settings, tmp_path):
    """SVG passes the browser's image/* guard but is a script host, and Pillow
    cannot decode it — it must never reach the media directory."""
    settings.MEDIA_ROOT = tmp_path
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    upload = SimpleUploadedFile("logo.svg", svg, content_type="image/svg+xml")

    response = _admin(api_client).post(UPLOAD_URL, {"file": upload}, format="multipart")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_image"


def test_heic_from_a_phone_is_accepted(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), "green").save(buffer, format="HEIF")
    upload = SimpleUploadedFile("IMG_0001.HEIC", buffer.getvalue(), content_type="image/heic")

    response = _admin(api_client).post(UPLOAD_URL, {"file": upload}, format="multipart")

    assert response.status_code == 201
    assert response.data["data"]["url"].endswith(".heic")


def test_over_long_image_url_is_a_bad_request_not_a_crash(api_client):
    product = ProductFactory()
    response = _admin(api_client).post(
        f"/api/v1/admin/catalog/products/{product.id}/images/",
        {"url": "data:image/png;base64," + "A" * 600},
    )

    assert response.status_code == 400
