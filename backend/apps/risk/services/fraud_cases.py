from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.risk.models import FraudCase


@transaction.atomic
def resolve_fraud_case(*, case: FraudCase, resolution: str, notes: str = "") -> FraudCase:
    case.status = FraudCase.Status.RESOLVED
    case.resolution = resolution
    case.resolution_notes = notes
    case.resolved_at = timezone.now()
    case.save(
        update_fields=["status", "resolution", "resolution_notes", "resolved_at", "updated_at"]
    )
    return case
