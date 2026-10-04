from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.catalog.models import Product, ProductQuestion


def published_questions_for_product(product: Product) -> QuerySet[ProductQuestion]:
    """Only what staff have answered *and* published. An answer alone is not
    enough — staff may draft one before deciding the question is fit to show."""
    return (
        ProductQuestion.objects.filter(product=product, is_published=True)
        .exclude(answer="")
        .select_related("customer")
        .order_by("-answered_at")
    )


def questions_for_customer(customer) -> QuerySet[ProductQuestion]:
    return ProductQuestion.objects.filter(customer=customer).select_related("product")


STATUS_PENDING = "pending"
STATUS_ANSWERED = "answered"
STATUS_PUBLISHED = "published"
QUESTION_STATUSES = (STATUS_PENDING, STATUS_ANSWERED, STATUS_PUBLISHED)


def questions_list(*, product=None, status: str | None = None) -> QuerySet[ProductQuestion]:
    """Every question, for the admin moderation queue. `answered` means
    answered but not yet published."""
    queryset = ProductQuestion.objects.select_related("customer", "product", "answered_by")
    if product is not None:
        queryset = queryset.filter(product=product)
    if status == STATUS_PENDING:
        queryset = queryset.filter(answer="")
    elif status == STATUS_ANSWERED:
        queryset = queryset.exclude(answer="").filter(is_published=False)
    elif status == STATUS_PUBLISHED:
        queryset = queryset.filter(is_published=True)
    return queryset


def get_question_by_id(question_id: str | UUID) -> ProductQuestion | None:
    return (
        ProductQuestion.objects.select_related("customer", "product", "answered_by")
        .filter(id=question_id)
        .first()
    )
