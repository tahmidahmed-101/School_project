from __future__ import annotations

import ipaddress
import logging

from django.db import transaction

from apps.marketing.models import OrderTrackingContext

logger = logging.getLogger("apps")

_TEXT_FIELDS = ("fbp", "fbc", "ga_client_id", "ttp", "ttclid", "source_url")


def _valid_ip(value: str) -> str | None:
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def save_tracking_context(
    *, order, tracking: dict | None, user_agent: str, ip_address: str
) -> None:
    """Never fails the checkout: the context only improves ad matching."""
    values = {name: (tracking or {}).get(name, "") for name in _TEXT_FIELDS}
    try:
        with transaction.atomic():
            OrderTrackingContext.objects.update_or_create(
                order=order,
                defaults={
                    **values,
                    "user_agent": (user_agent or "")[:500],
                    "ip_address": _valid_ip(ip_address or ""),
                },
            )
    except Exception:
        logger.exception("Saving the tracking context failed for order %s", order.id)
