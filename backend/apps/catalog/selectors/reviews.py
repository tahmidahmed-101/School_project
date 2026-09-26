from __future__ import annotations

from uuid import UUID

from django.db.models import Avg, Count, QuerySet

from apps.catalog.models import Product, ProductReview


def reviews_for_product(product: Product) -> QuerySet[ProductReview]:
    return (
        ProductReview.objects.filter(product=product)
        .select_related("customer")
        .order_by("-created_at")
    )


def get_review_for_customer(customer, product: Product) -> ProductReview | None:
    return ProductReview.objects.filter(customer=customer, product=product).first()


def get_review_by_id(review_id: str | UUID) -> ProductReview | None:
    return ProductReview.objects.select_related("customer", "product").filter(id=review_id).first()


def product_review_summary(product: Product) -> dict:
    result = ProductReview.objects.filter(product=product).aggregate(
        average_rating=Avg("rating"), review_count=Count("id")
    )
    return {
        "average_rating": (
            round(result["average_rating"], 2) if result["average_rating"] is not None else None
        ),
        "review_count": result["review_count"] or 0,
    }
