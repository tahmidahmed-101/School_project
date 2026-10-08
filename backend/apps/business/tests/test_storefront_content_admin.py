from __future__ import annotations

import io
import uuid

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.business.models import HeroSlide, PromoLine

pytestmark = pytest.mark.django_db

SLIDES = "/api/v1/admin/settings/hero-slides/"
LINES = "/api/v1/admin/settings/promo-lines/"
PROFILE = "/api/v1/admin/settings/business-profile/"


def png(name: str = "slide.png") -> SimpleUploadedFile:
    """A fresh file per call — an upload consumes the pointer."""
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), "blue").save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def test_hero_slide_is_created_from_a_multipart_upload(admin_client):
    response = admin_client.post(
        SLIDES,
        {
            "image": png(),
            "alt_text": "Eid sale banner",
            "title_en": "Eid collection",
            "title_bn": "ঈদ কালেকশন",
            "link_url": "/shop?type=normal",
            "placement": "home",
            "sort_order": 3,
        },
        format="multipart",
    )

    assert response.status_code == 201
    slide = HeroSlide.objects.get()
    assert response.data["data"] == {
        "id": str(slide.id),
        "image": f"http://testserver{slide.image.url}",
        "alt_text": "Eid sale banner",
        "tag_en": "",
        "tag_bn": "",
        "title_en": "Eid collection",
        "title_bn": "ঈদ কালেকশন",
        "link_url": "/shop?type=normal",
        "placement": "home",
        "sort_order": 3,
        "is_active": True,
    }
    assert slide.image.name.startswith("hero/")


def test_hero_slide_defaults_to_both_placements(admin_client):
    response = admin_client.post(SLIDES, {"image": png()}, format="multipart")

    assert response.status_code == 201
    assert response.data["data"]["placement"] == "both"


def test_hero_slide_needs_an_image_on_create(admin_client):
    response = admin_client.post(SLIDES, {"title_en": "No picture"}, format="multipart")

    assert response.status_code == 400
    assert "image" in response.data["error"]["fields"]
    assert not HeroSlide.objects.exists()


def test_hero_slide_rejects_an_unknown_placement_and_a_scripted_link(admin_client):
    bad_placement = admin_client.post(
        SLIDES, {"image": png(), "placement": "footer"}, format="multipart"
    )
    assert bad_placement.status_code == 400
    assert "placement" in bad_placement.data["error"]["fields"]

    bad_link = admin_client.post(
        SLIDES, {"image": png(), "link_url": "javascript:alert(1)"}, format="multipart"
    )
    assert bad_link.status_code == 400
    assert "link_url" in bad_link.data["error"]["fields"]


def test_hero_slide_list_includes_inactive_rows_in_order(admin_client):
    HeroSlide.objects.create(image=png(), title_en="Second", sort_order=2)
    HeroSlide.objects.create(image=png(), title_en="First", sort_order=1, is_active=False)

    response = admin_client.get(SLIDES)

    assert response.status_code == 200
    assert [row["title_en"] for row in response.data["data"]] == ["First", "Second"]
    assert response.data["data"][0]["is_active"] is False


def test_hero_slide_patch_as_json_keeps_the_image(admin_client):
    slide = HeroSlide.objects.create(image=png(), title_en="Old")
    original = slide.image.name

    response = admin_client.patch(
        f"{SLIDES}{slide.id}/", {"title_en": "New", "is_active": False}, format="json"
    )

    assert response.status_code == 200
    assert response.data["data"]["title_en"] == "New"
    assert response.data["data"]["is_active"] is False
    slide.refresh_from_db()
    assert slide.image.name == original


def test_hero_slide_patch_as_multipart_replaces_the_image(admin_client):
    slide = HeroSlide.objects.create(image=png())
    original = slide.image.name

    response = admin_client.patch(
        f"{SLIDES}{slide.id}/", {"image": png("next.png")}, format="multipart"
    )

    assert response.status_code == 200
    slide.refresh_from_db()
    assert slide.image.name != original
    assert response.data["data"]["image"] == f"http://testserver{slide.image.url}"


def test_hero_slide_delete(admin_client):
    slide = HeroSlide.objects.create(image=png())

    response = admin_client.delete(f"{SLIDES}{slide.id}/")

    assert response.status_code == 200
    assert not HeroSlide.objects.exists()


def test_unknown_ids_answer_404(admin_client):
    missing = uuid.uuid4()

    assert admin_client.patch(f"{SLIDES}{missing}/", {}, format="json").status_code == 404
    assert admin_client.delete(f"{SLIDES}{missing}/").status_code == 404
    assert admin_client.patch(f"{LINES}{missing}/", {}, format="json").status_code == 404
    assert admin_client.delete(f"{LINES}{missing}/").status_code == 404


def test_promo_line_crud(admin_client):
    created = admin_client.post(
        LINES, {"text_en": "Free delivery", "text_bn": "ফ্রি ডেলিভারি"}, format="json"
    )
    assert created.status_code == 201
    line = PromoLine.objects.get()
    assert created.data["data"] == {
        "id": str(line.id),
        "text_en": "Free delivery",
        "text_bn": "ফ্রি ডেলিভারি",
        "sort_order": 0,
        "is_active": True,
    }

    patched = admin_client.patch(
        f"{LINES}{line.id}/", {"sort_order": 4, "is_active": False}, format="json"
    )
    assert patched.status_code == 200
    assert patched.data["data"]["sort_order"] == 4
    assert patched.data["data"]["text_en"] == "Free delivery"

    listed = admin_client.get(LINES)
    assert [row["id"] for row in listed.data["data"]] == [str(line.id)]
    assert listed.data["data"][0]["is_active"] is False

    assert admin_client.delete(f"{LINES}{line.id}/").status_code == 200
    assert not PromoLine.objects.exists()


def test_promo_line_needs_english_text_but_not_bangla(admin_client):
    assert admin_client.post(LINES, {"text_bn": "শুধু বাংলা"}, format="json").status_code == 400
    assert admin_client.post(LINES, {"text_en": ""}, format="json").status_code == 400

    english_only = admin_client.post(LINES, {"text_en": "English only"}, format="json")
    assert english_only.status_code == 201
    assert english_only.data["data"]["text_bn"] == ""


def test_staff_without_settings_permission_is_forbidden(api_client):
    staff = create_user(email="content-nobody@example.com", role="staff")
    slide = HeroSlide.objects.create(image=png())
    line = PromoLine.objects.create(text_en="Keep")
    api_client.force_authenticate(user=staff)

    assert api_client.get(SLIDES).status_code == 403
    assert api_client.post(SLIDES, {"image": png()}, format="multipart").status_code == 403
    assert api_client.patch(f"{SLIDES}{slide.id}/", {}, format="json").status_code == 403
    assert api_client.delete(f"{SLIDES}{slide.id}/").status_code == 403
    assert api_client.get(LINES).status_code == 403
    assert api_client.post(LINES, {"text_en": "Hijack"}, format="json").status_code == 403
    assert api_client.patch(f"{LINES}{line.id}/", {}, format="json").status_code == 403
    assert api_client.delete(f"{LINES}{line.id}/").status_code == 403
    assert HeroSlide.objects.count() == 1
    assert PromoLine.objects.count() == 1


def test_settings_view_permission_reads_but_cannot_write(api_client):
    staff = create_user(email="content-viewer@example.com", role="staff")
    set_staff_permission(
        staff_user=staff, permission_code=StaffPermissionCode.SETTINGS_VIEW, is_enabled=True
    )
    line = PromoLine.objects.create(text_en="Keep")
    api_client.force_authenticate(user=staff)

    assert api_client.get(SLIDES).status_code == 200
    assert api_client.get(LINES).status_code == 200
    assert api_client.post(LINES, {"text_en": "Hijack"}, format="json").status_code == 403
    assert api_client.delete(f"{LINES}{line.id}/").status_code == 403


def test_anonymous_cannot_reach_the_admin_endpoints(api_client):
    assert api_client.get(SLIDES).status_code in (401, 403)
    assert api_client.post(LINES, {"text_en": "Hijack"}, format="json").status_code in (401, 403)


def test_admin_business_profile_reads_and_updates_the_about_text(admin_client):
    assert admin_client.get(PROFILE).data["data"]["about_en"] == ""

    response = admin_client.patch(
        PROFILE,
        {"about_en": "A family shop in Khulna.", "about_bn": "খুলনার একটি পারিবারিক দোকান।"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["about_en"] == "A family shop in Khulna."
    reread = admin_client.get(PROFILE)
    assert reread.data["data"]["about_bn"] == "খুলনার একটি পারিবারিক দোকান।"
