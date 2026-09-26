from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.catalog.models import Product, ProductImage
from apps.common.services.demo_seed.constants import SLUG_PREFIX

pytestmark = pytest.mark.django_db


def _seeded_image_rows() -> list[tuple[str, str, str, int]]:
    return sorted(
        ProductImage.objects.filter(product__slug__startswith=SLUG_PREFIX).values_list(
            "product__slug", "url", "alt_text", "sort_order"
        )
    )


def _seed(fresh: bool = False) -> None:
    call_command("seed_demo", orders=4, days=10, customers=3, fresh=fresh, verbosity=0)


def test_seed_demo_gives_every_demo_product_between_one_and_three_images():
    _seed()

    products = Product.objects.filter(slug__startswith=SLUG_PREFIX)
    assert products.exists()
    for product in products:
        urls = list(product.images.order_by("sort_order").values_list("url", flat=True))
        assert 1 <= len(urls) <= 3
        assert urls[0] == f"https://picsum.photos/seed/{product.slug}/600/600"
        assert len(set(urls)) == len(urls)
        assert all(image.alt_text for image in product.images.all())
        assert [image.sort_order for image in product.images.order_by("sort_order")] == list(
            range(len(urls))
        )


def test_seed_demo_images_are_idempotent_across_reruns():
    _seed(fresh=True)
    first = _seeded_image_rows()

    _seed(fresh=True)
    assert _seeded_image_rows() == first

    _seed()
    assert _seeded_image_rows() == first


def test_fresh_wipe_removes_seeded_images():
    _seed(fresh=True)
    assert _seeded_image_rows()

    from apps.common.services.demo_seed.wipe import wipe_demo_data

    removed = wipe_demo_data()

    assert removed["product_images"] > 0
    assert ProductImage.objects.filter(product__slug__startswith=SLUG_PREFIX).count() == 0
