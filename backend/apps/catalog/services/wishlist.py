from __future__ import annotations

from django.db import transaction

from apps.catalog.models import Product, WishlistItem
from apps.common.exceptions import BusinessRuleViolationError


@transaction.atomic
def add_to_wishlist(*, customer, product: Product) -> WishlistItem:
    if WishlistItem.objects.filter(customer=customer, product=product).exists():
        raise BusinessRuleViolationError(
            "This product is already in your wishlist.", code="already_in_wishlist"
        )
    return WishlistItem.objects.create(customer=customer, product=product)


def remove_from_wishlist(*, item: WishlistItem) -> None:
    item.delete()
