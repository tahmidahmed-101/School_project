from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class PolicyKind(models.TextChoices):
    SHIPPING = "shipping", "Shipping policy"
    RETURNS = "returns", "Return policy"
    REFUND = "refund", "Refund policy"
    # Shown before a shopper places a pre-order. Prose only: it sets no
    # checkout rule, and pre-order return eligibility stays on `returns`.
    PREORDER_CHECKOUT = "preorder_checkout", "Pre-order checkout terms"


class StorePolicy(TimeStampedModel):
    """One row per storefront policy, written only through
    `apps.business.services.policies.update_store_policy`.

    `content` is sectioned, with each text in English and/or Bangla (see `POLICY_LOCALES`):
    `{"title": {"en", "bn"}, "intro": {...}, "sections": [{"heading": {...}, "body": {...}}]}`.
    Nothing is public until staff publish a complete version with an
    `effective_date` — the row's own `updated_at` is bookkeeping, not a
    policy date.
    """

    kind = models.CharField(max_length=20, choices=PolicyKind.choices, unique=True)
    content = models.JSONField(default=dict, blank=True)
    effective_date = models.DateField(null=True, blank=True)
    is_published = models.BooleanField(default=False)

    # Return eligibility. Only meaningful on the `returns` row, and enforced by
    # `create_rma` only while that policy is published — a draft rule binds no
    # one. Defaults impose nothing, so an unconfigured store keeps today's
    # behaviour.
    return_window_days = models.PositiveSmallIntegerField(null=True, blank=True)
    preorder_returns_allowed = models.BooleanField(default=True)
    non_returnable_categories = models.ManyToManyField(
        "catalog.Category", blank=True, related_name="+"
    )

    class Meta:
        ordering: ClassVar[list] = ["kind"]
        verbose_name_plural = "Store policies"

    def __str__(self) -> str:
        return self.get_kind_display()


class StorePolicyRevision(TimeStampedModel):
    """Append-only before/after record of every policy change. Snapshots are
    self-contained JSON so a revision still reads correctly after the policy,
    a category, or the staff member has changed."""

    policy = models.ForeignKey(StorePolicy, on_delete=models.PROTECT, related_name="revisions")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="store_policy_revisions",
    )
    previous = models.JSONField(default=dict, blank=True)
    current = models.JSONField(default=dict)
    effective_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["policy", "created_at"], name="policy_rev_policy_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.policy_id} @ {self.created_at:%Y-%m-%d %H:%M}"
