from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Product, ProductQuestion
from apps.common.exceptions import BusinessRuleViolationError


def ask_question(*, customer, product: Product, question: str) -> ProductQuestion:
    question = question.strip()
    # A double-submitted form would otherwise queue the same question twice
    # for staff to answer twice.
    if ProductQuestion.objects.filter(
        customer=customer, product=product, question=question, answer=""
    ).exists():
        raise BusinessRuleViolationError(
            "You have already asked this question.", code="duplicate_question"
        )
    return ProductQuestion.objects.create(customer=customer, product=product, question=question)


_UNSET = object()


@transaction.atomic
def moderate_question(
    *, question: ProductQuestion, actor, answer=_UNSET, is_published=_UNSET
) -> ProductQuestion:
    """Answer and/or publish. A question can only be public with an answer, so
    clearing the answer also unpublishes it rather than leaving a bare
    question on the product page."""
    changed: set[str] = set()
    if answer is not _UNSET:
        answer = answer.strip()
        question.answer = answer
        question.answered_by = actor if answer else None
        question.answered_at = timezone.now() if answer else None
        changed |= {"answer", "answered_by", "answered_at"}
        if not answer and question.is_published:
            question.is_published = False
            changed.add("is_published")
    if is_published is not _UNSET:
        if is_published and not question.answer:
            raise BusinessRuleViolationError(
                "Answer the question before publishing it.", code="answer_required"
            )
        question.is_published = is_published
        changed.add("is_published")
    if changed:
        question.save(update_fields=changed)
    return question


def delete_question(*, question: ProductQuestion) -> None:
    question.delete()
