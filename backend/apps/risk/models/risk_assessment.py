from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class RiskAssessment(TimeStampedModel):
    """Rule-based fraud score for one order, computed at checkout/payment time."""

    class RiskLevel(models.TextChoices):
        LOW = "low", "Low Risk"
        MEDIUM = "medium", "Medium Risk"
        HIGH = "high", "High Risk"

    class RecommendedAction(models.TextChoices):
        APPROVE = "approve", "Approve"
        REVIEW = "review", "Review"
        BLOCK = "block", "Block"

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="risk_assessments",
    )
    order = models.ForeignKey(
        "orders.SalesOrder",
        on_delete=models.CASCADE,
        related_name="risk_assessments",
    )
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices)
    risk_score = models.DecimalField(
        max_digits=5, decimal_places=2, help_text="0.00 to 100.00"
    )
    risk_reasons = models.JSONField(default=list, blank=True)
    features_used = models.JSONField(default=dict, blank=True)
    recommended_action = models.CharField(
        max_length=10, choices=RecommendedAction.choices
    )
    auto_blocked = models.BooleanField(default=False)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["order", "-created_at"]),
            models.Index(fields=["risk_level", "-created_at"]),
        ]
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=models.Q(risk_score__gte=0, risk_score__lte=100),
                name="risk_assessment_score_in_range",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"Risk assessment for {self.order.order_number} - "
            f"{self.risk_level} ({self.risk_score}%)"
        )
