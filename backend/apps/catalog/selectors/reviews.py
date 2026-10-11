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


def reviews_list(
    *, product=None, rating: int | None = None, kind: str | None = None
) -> QuerySet[ProductReview]:
    """Every review, for the admin moderation list."""
    queryset = ProductReview.objects.select_related("customer", "product")
    if product is not None:
        queryset = queryset.filter(product=product)
    if rating is not None:
        queryset = queryset.filter(rating=rating)
    if kind:
        queryset = queryset.filter(product__category__category_type=kind)
    return queryset


def get_review_for_customer(customer, product: Product) -> ProductReview | None:
    return ProductReview.objects.filter(customer=customer, product=product).first()


def get_review_by_id(review_id: str | UUID) -> ProductReview | None:
    return ProductReview.objects.select_related("customer", "product").filter(id=review_id).first()


def product_review_summary(product: Product) -> dict:
    reviews = ProductReview.objects.filter(product=product)
    result = reviews.aggregate(average_rating=Avg("rating"), review_count=Count("id"))
    # Reviews per star, every star present: {"5": 3, "4": 0, ...}.
    counts = dict(reviews.values_list("rating").annotate(total=Count("id")))
    return {
        "average_rating": (
            round(result["average_rating"], 2) if result["average_rating"] is not None else None
        ),
        "review_count": result["review_count"] or 0,
        "rating_counts": {str(star): counts.get(star, 0) for star in range(5, 0, -1)},
    }
