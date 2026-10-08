from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.business.models import HeroSlide, PromoLine
from apps.business.selectors import get_business_profile

pytestmark = pytest.mark.django_db

ENDPOINT = "/api/v1/public/storefront-content/"


def png(name: str = "slide.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), "blue").save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def test_empty_store_answers_empty_lists_without_auth(api_client):
    response = api_client.get(ENDPOINT)

    assert response.status_code == 200
    assert response.data["message"] == "Success"
    assert response.data["data"] == {"hero_slides": [], "promo_lines": []}


def test_only_active_rows_are_listed_in_sort_order(api_client):
    HeroSlide.objects.create(image=png(), title_en="Second", sort_order=2)
    HeroSlide.objects.create(image=png(), title_en="Hidden", sort_order=0, is_active=False)
    HeroSlide.objects.create(image=png(), title_en="First", sort_order=1)
    PromoLine.objects.create(text_en="Later", sort_order=5)
    PromoLine.objects.create(text_en="Hidden", sort_order=0, is_active=False)
    PromoLine.objects.create(text_en="Sooner", sort_order=1)

    data = api_client.get(ENDPOINT).data["data"]

    assert [slide["title"]["en"] for slide in data["hero_slides"]] == ["First", "Second"]
    assert [line["text"]["en"] for line in data["promo_lines"]] == ["Sooner", "Later"]


def test_rows_sharing_a_sort_order_keep_creation_order(api_client):
    PromoLine.objects.create(text_en="Older")
    PromoLine.objects.create(text_en="Newer")

    lines = api_client.get(ENDPOINT).data["data"]["promo_lines"]

    assert [line["text"]["en"] for line in lines] == ["Older", "Newer"]


def test_rows_are_bilingual_and_the_image_url_is_absolute(api_client):
    slide = HeroSlide.objects.create(
        image=png(),
        alt_text="Eid sale banner",
        tag_en="New",
        tag_bn="নতুন",
        title_en="Eid collection",
        title_bn="ঈদ কালেকশন",
        link_url="/shop?type=normal",
        placement="home",
    )
    line = PromoLine.objects.create(text_en="Free delivery", text_bn="ফ্রি ডেলিভারি")

    data = api_client.get(ENDPOINT).data["data"]

    assert data["hero_slides"] == [
        {
            "id": str(slide.id),
            "image": f"http://testserver{slide.image.url}",
            "alt": "Eid sale banner",
            "tag": {"en": "New", "bn": "নতুন"},
            "title": {"en": "Eid collection", "bn": "ঈদ কালেকশন"},
            "link_url": "/shop?type=normal",
            "placement": "home",
        }
    ]
    assert data["promo_lines"] == [
        {"id": str(line.id), "text": {"en": "Free delivery", "bn": "ফ্রি ডেলিভারি"}}
    ]


def test_public_business_profile_carries_the_about_text(api_client):
    profile = get_business_profile()
    profile.about_en = "A family shop in Khulna."
    profile.about_bn = "খুলনার একটি পারিবারিক দোকান।"
    profile.save(update_fields=["about_en", "about_bn"])

    response = api_client.get("/api/v1/public/business-profile/")

    assert response.status_code == 200
    assert response.data["data"]["about"] == {
        "en": "A family shop in Khulna.",
        "bn": "খুলনার একটি পারিবারিক দোকান।",
    }


def test_about_is_blank_until_the_owner_writes_it(api_client):
    response = api_client.get("/api/v1/public/business-profile/")

    assert response.data["data"]["about"] == {"en": "", "bn": ""}
