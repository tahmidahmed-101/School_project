from __future__ import annotations


def variant_image_url(variant) -> str | None:
    """Variant's own first image, falling back to the parent product's. Callers
    listing rows must prefetch `variant__images` and `variant__product__images`."""
    if variant is None:
        return None
    image = next(iter(variant.images.all()), None)
    if image is None and variant.product_id:
        image = next(iter(variant.product.images.all()), None)
    return image.url if image else None
