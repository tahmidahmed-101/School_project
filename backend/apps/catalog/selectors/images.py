from __future__ import annotations


def _picked_for_variant(variant, product_images: list) -> list:
    """Product photos set for this variant's option values, else the ones set for every
    choice. The values count only when they were prefetched (`option_values`)."""
    prefetched = getattr(variant, "_prefetched_objects_cache", {})
    value_ids = (
        {value.id for value in variant.option_values.all()}
        if "option_values" in prefetched
        else set()
    )
    picked = [image for image in product_images if image.option_value_id in value_ids]
    return picked or [image for image in product_images if image.option_value_id is None]


def variant_image_url(variant) -> str | None:
    """Variant's own first image, else the product photo for its option values, else the
    parent product's first. Callers listing rows must prefetch `variant__images` and
    `variant__product__images`, and `variant__option_values` to get the per-value photo."""
    if variant is None:
        return None
    image = next(iter(variant.images.all()), None)
    if image is None and variant.product_id:
        product_images = list(variant.product.images.all())
        image = next(iter(_picked_for_variant(variant, product_images) or product_images), None)
    return image.url if image else None
