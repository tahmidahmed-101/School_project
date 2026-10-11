from __future__ import annotations

from django.db import transaction

from apps.catalog.models import Product, ProductReview, ProductReviewImage
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.files import validate_image_upload

MAX_REVIEW_IMAGES = 5


def _has_verified_purchase(customer, product: Product) -> bool:
    from apps.orders.models import SalesOrder, SalesOrderLine

    return SalesOrderLine.objects.filter(
        order__customer=customer,
        order__status__in=[SalesOrder.Status.DELIVERED, SalesOrder.Status.CLOSED],
        variant__product=product,
    ).exists()


@transaction.atomic
def create_review(
    *, customer, product: Product, rating: int, comment: str = "", images=()
) -> ProductReview:
    if ProductReview.objects.filter(customer=customer, product=product).exists():
        raise BusinessRuleViolationError(
            "You have already reviewed this product.", code="already_reviewed"
        )
    if not _has_verified_purchase(customer, product):
        raise BusinessRuleViolationError(
            "You can only review products you have purchased and received.",
            code="purchase_required",
        )
    if len(images) > MAX_REVIEW_IMAGES:
        raise BusinessRuleViolationError(
            f"A review can have at most {MAX_REVIEW_IMAGES} pictures.", code="too_many_images"
        )
    # Every file is checked before the first one is stored, so a bad picture
    # leaves nothing behind. The stored name takes the decoded format's
    # extension: the original filename is caller-supplied.
    for image in images:
        image.name = f"review{validate_image_upload(image)}"
    review = ProductReview.objects.create(
        customer=customer,
        product=product,
        rating=rating,
        comment=comment,
        is_verified_purchase=True,
    )
    for sort_order, image in enumerate(images):
        ProductReviewImage.objects.create(review=review, image=image, sort_order=sort_order)
    return review


@transaction.atomic
def update_review(*, review: ProductReview, **fields) -> ProductReview:
    for field, value in fields.items():
        setattr(review, field, value)
    review.save(update_fields=[*fields.keys(), "updated_at"])
    return review


@transaction.atomic
def delete_review(*, review: ProductReview) -> None:
    # Deleting the rows leaves the files in storage. They go only once the
    # delete has committed, so a rolled-back delete keeps its pictures.
    files = [item.image for item in review.images.all()]
    review.delete()

    def remove_files() -> None:
        for file in files:
            file.storage.delete(file.name)

    transaction.on_commit(remove_files)
