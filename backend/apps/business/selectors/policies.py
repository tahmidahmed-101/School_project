from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from django.db.models import QuerySet
from django.utils import timezone

from apps.business.constants import ModuleKey
from apps.business.models import PolicyKind, StorePolicy, StorePolicyRevision
from apps.business.policy_content import missing_policy_fields
from apps.business.selectors.modules import is_feature_enabled


def store_policies_list() -> QuerySet[StorePolicy]:
    """Every policy row, drafts included, for the settings screen."""
    return (
        StorePolicy.objects.filter(kind__in=PolicyKind.values)
        .prefetch_related("non_returnable_categories")
        .order_by("kind")
    )


def get_store_policy(kind: str) -> StorePolicy | None:
    return store_policies_list().filter(kind=kind).first()


def get_published_policy(kind: str) -> StorePolicy | None:
    """The policy as the storefront may show it, or None. Completeness is
    re-checked here rather than trusted from `is_published`, so a row edited
    around the service can never publish blank text under a real date."""
    policy = get_store_policy(kind)
    if policy is None or not policy.is_published or policy.effective_date is None:
        return None
    if missing_policy_fields(policy.content):
        return None
    return policy


def returns_enabled() -> bool:
    """The same `orders.returns` flag `create_rma` enforces."""
    return is_feature_enabled(ModuleKey.ORDERS, "returns")


def policy_revisions(policy: StorePolicy) -> QuerySet[StorePolicyRevision]:
    return StorePolicyRevision.objects.filter(policy=policy).select_related("changed_by")


def policy_date(moment: datetime) -> date:
    """The calendar date of `moment` in the project's configured timezone, the
    one calendar every policy effective date is compared on."""
    return timezone.localtime(moment, timezone.get_default_timezone()).date()


@dataclass(frozen=True)
class ReturnRules:
    """One published version of the return policy's eligibility terms."""

    effective_date: date
    window_days: int | None
    non_returnable_category_ids: frozenset[str]


def _rules_from_snapshot(snapshot: dict) -> ReturnRules:
    return ReturnRules(
        effective_date=date.fromisoformat(snapshot["effective_date"]),
        window_days=snapshot.get("return_window_days"),
        non_returnable_category_ids=frozenset(
            str(category_id) for category_id in snapshot.get("non_returnable_category_ids", [])
        ),
    )


def return_rule_versions() -> list[ReturnRules]:
    """Every published version of the return terms, oldest publication first,
    rebuilt from the revision history in one query.

    Empty while the return policy is not currently published: withdrawing the
    policy withdraws all of its versions, as an unpublished policy binds no
    one. The live row is appended as the newest version so a row changed
    without a revision still governs from its own effective date.
    """
    policy = get_published_policy(PolicyKind.RETURNS)
    # get_published_policy already refuses an undated row; restated for the type checker.
    if policy is None or policy.effective_date is None:
        return []
    snapshots = (
        StorePolicyRevision.objects.filter(policy=policy, current__is_published=True)
        .order_by("created_at")
        .values_list("current", flat=True)
    )
    versions = [
        _rules_from_snapshot(snapshot) for snapshot in snapshots if snapshot.get("effective_date")
    ]
    versions.append(
        ReturnRules(
            effective_date=policy.effective_date,
            window_days=policy.return_window_days,
            non_returnable_category_ids=frozenset(
                str(category.id) for category in policy.non_returnable_categories.all()
            ),
        )
    )
    return versions


def governing_return_rules(versions: list[ReturnRules], on: date) -> ReturnRules | None:
    """The version in force on `on`: the most recently published version whose
    effective date is on or before it (inclusive). A later publication
    supersedes an earlier one from its own effective date onward, so a
    same-day correction replaces the version it corrects. None means `on`
    precedes every published version — legacy behaviour, no policy rules."""
    for version in reversed(versions):
        if version.effective_date <= on:
            return version
    return None


def active_return_rules() -> ReturnRules | None:
    """The version in force today, or None when no published version is yet."""
    return governing_return_rules(return_rule_versions(), policy_date(timezone.now()))
