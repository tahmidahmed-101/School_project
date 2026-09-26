from __future__ import annotations

from django.db import transaction

from apps.catalog.models import Product, ProductReview
from apps.common.exceptions import BusinessRuleViolationError


def _has_verified_purchase(customer, product: Product) -> bool:
    from apps.orders.models import SalesOrder, SalesOrderLine

    return SalesOrderLine.objects.filter(
        order__customer=customer,
        order__status__in=[SalesOrder.Status.DELIVERED, SalesOrder.Status.CLOSED],
        variant__product=product,
    ).exists()


@transaction.atomic
def create_review(*, customer, product: Product, rating: int, comment: str = "") -> ProductReview:
    if ProductReview.objects.filter(customer=customer, product=product).exists():
        raise BusinessRuleViolationError(
            "You have already reviewed this product.", code="already_reviewed"
        )
    if not _has_verified_purchase(customer, product):
        raise BusinessRuleViolationError(
            "You can only review products you have purchased and received.",
            code="purchase_required",
        )
    return ProductReview.objects.create(
        customer=customer,
        product=product,
        rating=rating,
        comment=comment,
        is_verified_purchase=True,
    )


@transaction.atomic
def update_review(*, review: ProductReview, **fields) -> ProductReview:
    for field, value in fields.items():
        setattr(review, field, value)
    review.save(update_fields=[*fields.keys(), "updated_at"])
    return review


def delete_review(*, review: ProductReview) -> None:
    review.delete()
