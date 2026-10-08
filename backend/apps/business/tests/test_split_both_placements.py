from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from PIL import Image

from apps.business.models import HeroSlide, PromoLine

pytestmark = pytest.mark.django_db

ENDPOINT = "/api/v1/public/storefront-content/"


def _png() -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), "blue").save(buffer, format="PNG")
    return SimpleUploadedFile("slide.png", buffer.getvalue(), content_type="image/png")


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def rows():
    HeroSlide.objects.create(image=_png(), title_en="Shared", placement="both", sort_order=2)
    HeroSlide.objects.create(image=_png(), title_en="Home only", placement="home", sort_order=1)
    PromoLine.objects.create(text_en="Shared line", placement="both", is_active=False)
    PromoLine.objects.create(text_en="Pre-order line", placement="preorder")


def _run(*args) -> str:
    out = io.StringIO()
    call_command("split_both_placements", *args, stdout=out)
    return out.getvalue()


def _shown_on(api_client, page: str) -> tuple[list[str], list[str]]:
    """What the storefront shows on a page: its own rows plus any old `both` row."""
    data = api_client.get(ENDPOINT).data["data"]
    return (
        [s["title"]["en"] for s in data["hero_slides"] if s["placement"] in (page, "both")],
        [line["text"]["en"] for line in data["promo_lines"] if line["placement"] in (page, "both")],
    )


def test_dry_run_writes_nothing(rows):
    output = _run()

    assert "2 row(s) would be split" in output
    assert HeroSlide.objects.filter(placement="both").count() == 1
    assert PromoLine.objects.filter(placement="both").count() == 1
    assert HeroSlide.objects.count() == 2


def test_apply_leaves_one_row_per_shop_and_can_run_twice(rows):
    shared = HeroSlide.objects.get(placement="both")

    assert "2 row(s) split" in _run("--apply")

    assert not HeroSlide.objects.filter(placement="both").exists()
    assert not PromoLine.objects.filter(placement="both").exists()
    home, preorder = HeroSlide.objects.filter(title_en="Shared").order_by("placement")
    assert (home.pk, home.placement, preorder.placement) == (shared.pk, "home", "preorder")
    assert preorder.image.name == shared.image.name
    assert preorder.sort_order == 2
    assert sorted(
        PromoLine.objects.filter(text_en="Shared line").values_list("placement", "is_active")
    ) == [("home", False), ("preorder", False)]

    assert "0 row(s) split" in _run("--apply")
    assert HeroSlide.objects.count() == 3


def test_each_storefront_page_shows_the_same_rows_before_and_after(api_client, rows):
    PromoLine.objects.filter(text_en="Shared line").update(is_active=True)
    before = {page: _shown_on(api_client, page) for page in ("home", "preorder")}

    _run("--apply")

    assert {page: _shown_on(api_client, page) for page in ("home", "preorder")} == before
    assert before["home"] == (["Home only", "Shared"], ["Shared line"])
    assert before["preorder"] == (["Shared"], ["Shared line", "Pre-order line"])
