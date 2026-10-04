from __future__ import annotations

from datetime import date

from django.db import transaction
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.business.models import PolicyKind, StorePolicy, StorePolicyRevision
from apps.business.policy_content import missing_policy_fields, normalize_policy_content
from apps.business.selectors.policies import policy_date
from apps.common.exceptions import BusinessRuleViolationError

RULE_FIELDS = ("return_window_days", "preorder_returns_allowed", "non_returnable_category_ids")
MAX_RETURN_WINDOW_DAYS = 365
# Keys of a snapshot that are the policy's terms, as opposed to its date and
# publication state.
_TERM_KEYS = ("content", *RULE_FIELDS)


def _snapshot(policy: StorePolicy, category_ids: list[str]) -> dict:
    snapshot = {
        "content": policy.content,
        "effective_date": policy.effective_date.isoformat() if policy.effective_date else None,
        "is_published": policy.is_published,
    }
    if policy.kind == PolicyKind.RETURNS:
        snapshot.update(
            return_window_days=policy.return_window_days,
            preorder_returns_allowed=policy.preorder_returns_allowed,
            non_returnable_category_ids=category_ids,
        )
    return snapshot


def _resolve_categories(category_ids) -> list:
    from apps.catalog.models import Category

    ids = list(dict.fromkeys(str(category_id) for category_id in category_ids))
    categories = list(Category.objects.filter(id__in=ids, deleted_at__isnull=True))
    if len(categories) != len(ids):
        raise BusinessRuleViolationError(
            "One or more categories do not exist.", code="category_not_found"
        )
    return categories


def _apply_rules(policy: StorePolicy, data: dict) -> None:
    if "return_window_days" in data:
        days = data["return_window_days"]
        if days is not None and not 1 <= days <= MAX_RETURN_WINDOW_DAYS:
            raise BusinessRuleViolationError(
                f"Return window must be between 1 and {MAX_RETURN_WINDOW_DAYS} days.",
                code="invalid_return_window",
            )
        policy.return_window_days = days
    if "preorder_returns_allowed" in data:
        policy.preorder_returns_allowed = bool(data["preorder_returns_allowed"])


def _validate_publication(policy: StorePolicy, before: dict, after: dict, data: dict) -> None:
    """A published policy is a promise to customers, so it must be complete in
    every locale, carry a date that has already arrived, and never quietly
    change its terms under an old date."""
    if not policy.is_published:
        return
    missing = missing_policy_fields(policy.content)
    if missing:
        shown = ", ".join(missing[:5]) + (" ..." if len(missing) > 5 else "")
        raise BusinessRuleViolationError(
            f"Complete the policy before publishing it. Missing: {shown}.",
            code="policy_incomplete",
        )
    if policy.effective_date is None:
        raise BusinessRuleViolationError(
            "Set an effective date before publishing.", code="effective_date_required"
        )
    if policy.effective_date > policy_date(timezone.now()):
        # One row holds one version: publishing a future date would replace
        # the terms in force today with ones that are not yet in force.
        raise BusinessRuleViolationError(
            "The effective date cannot be in the future. Publish on or after that date.",
            code="effective_date_in_future",
        )
    if not before["is_published"]:
        return
    terms_changed = any(before.get(key) != after.get(key) for key in _TERM_KEYS)
    if terms_changed and "effective_date" not in data:
        raise BusinessRuleViolationError(
            "Changing published terms needs the effective date of the new version.",
            code="effective_date_required",
        )
    previous = before["effective_date"]
    if previous and policy.effective_date < date.fromisoformat(previous):
        raise BusinessRuleViolationError(
            "The effective date cannot move earlier than the published version's.",
            code="effective_date_backwards",
        )


@transaction.atomic
def update_store_policy(*, policy: StorePolicy, actor, data: dict) -> StorePolicy:
    """The only write path for policies: validates, publishes, and records an
    immutable revision plus an audit entry. A request that changes nothing
    records nothing."""
    policy = StorePolicy.objects.select_for_update().get(pk=policy.pk)
    if policy.kind != PolicyKind.RETURNS and any(field in data for field in RULE_FIELDS):
        raise BusinessRuleViolationError(
            "Return eligibility rules only apply to the return policy.",
            code="rules_not_applicable",
        )

    before_category_ids = sorted(
        str(category_id)
        for category_id in policy.non_returnable_categories.values_list("id", flat=True)
    )
    before = _snapshot(policy, before_category_ids)

    if "content" in data:
        policy.content = normalize_policy_content(data["content"])
    if "effective_date" in data:
        policy.effective_date = data["effective_date"]
    if "is_published" in data:
        policy.is_published = bool(data["is_published"])
    _apply_rules(policy, data)
    categories = None
    after_category_ids = before_category_ids
    if "non_returnable_category_ids" in data:
        categories = _resolve_categories(data["non_returnable_category_ids"])
        after_category_ids = sorted(str(category.id) for category in categories)

    after = _snapshot(policy, after_category_ids)
    if after == before:
        return policy
    _validate_publication(policy, before, after, data)

    policy.save(
        update_fields=[
            "content",
            "effective_date",
            "is_published",
            "return_window_days",
            "preorder_returns_allowed",
        ]
    )
    if categories is not None:
        policy.non_returnable_categories.set(categories)
    revision = StorePolicyRevision.objects.create(
        policy=policy,
        changed_by=actor,
        previous=before,
        current=after,
        effective_date=policy.effective_date,
    )
    log_action(
        actor=actor,
        action="store_policy.updated",
        target_type="StorePolicy",
        target_id=policy.id,
        metadata={
            "kind": policy.kind,
            "revision_id": str(revision.id),
            "is_published": policy.is_published,
            "effective_date": after["effective_date"],
        },
    )
    return policy
