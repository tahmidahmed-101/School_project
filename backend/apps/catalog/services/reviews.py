from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.business.constants import ModuleKey
from apps.business.selectors.modules import is_feature_enabled
from apps.catalog.models import Product, ProductReview, ProductReviewImage
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.files import validate_image_upload

MAX_REVIEW_IMAGES = 5
REVIEW_APPROVAL = "review_approval"
MODERATION_STATUSES = (ProductReview.Status.PUBLISHED, ProductReview.Status.HIDDEN)


def reviews_need_approval() -> bool:
    return is_feature_enabled(ModuleKey.CATALOG, REVIEW_APPROVAL)


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
        status=(
            ProductReview.Status.PENDING
            if reviews_need_approval()
            else ProductReview.Status.PUBLISHED
        ),
    )
    for sort_order, image in enumerate(images):
        ProductReviewImage.objects.create(review=review, image=image, sort_order=sort_order)
    return review


@transaction.atomic
def update_review(*, review: ProductReview, **fields) -> ProductReview:
    """A customer's edit. Where reviews are approved first, changed wording or
    stars go back for approval, since what staff approved is no longer what
    shows. Otherwise a review staff hid stays hidden."""
    changed = [field for field, value in fields.items() if getattr(review, field) != value]
    for field in changed:
        setattr(review, field, fields[field])
    if changed and reviews_need_approval():
        review.status = ProductReview.Status.PENDING
        changed.append("status")
    if changed:
        review.save(update_fields=[*changed, "updated_at"])
    return review


@transaction.atomic
def moderate_review(
    *, review: ProductReview, status: str, note: str = "", actor=None
) -> ProductReview:
    """Staff publish a review or take it off the storefront. Hiding keeps the
    review, so the decision can be reversed; deleting is for spam."""
    if status not in MODERATION_STATUSES:
        raise BusinessRuleViolationError(
            "A review can be published or hidden.", code="invalid_review_status"
        )
    ProductReview.objects.select_for_update().filter(pk=review.pk).exists()
    review.refresh_from_db()
    previous = review.status
    review.status = status
    review.moderation_note = (note or "").strip()
    review.moderated_at = timezone.now()
    review.moderated_by = actor if getattr(actor, "pk", None) else None
    review.save(
        update_fields=[
            "status",
            "moderation_note",
            "moderated_at",
            "moderated_by",
            "updated_at",
        ]
    )
    log_action(
        actor=actor,
        action=f"review.{status}",
        target_type="ProductReview",
        target_id=review.id,
        metadata={"product_id": str(review.product_id), "from": previous, "to": status},
    )
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
