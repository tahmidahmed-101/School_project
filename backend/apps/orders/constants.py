from __future__ import annotations

from dataclasses import dataclass

from django.db import models


class PaymentMethodKey(models.TextChoices):
    CASH = "cash", "Cash"
    COD = "cod", "Cash on delivery"
    CARD = "card", "Card"
    BKASH = "bkash", "bKash"
    NAGAD = "nagad", "Nagad"
    ROCKET = "rocket", "Rocket"
    BANK_TRANSFER = "bank_transfer", "Bank transfer"
    MANUAL = "manual", "Manual / other"


@dataclass(frozen=True)
class PaymentMethodSpec:
    key: str
    label: str
    description: str
    can_disable: bool = True
    locked_reason: str = ""


# Source of truth for what a payment method is. `PaymentMethodSetting` records
# only whether the operator offers it.
PAYMENT_METHOD_REGISTRY: tuple[PaymentMethodSpec, ...] = (
    PaymentMethodSpec(
        key=PaymentMethodKey.CASH,
        label="Cash",
        description="Handed over at the counter.",
    ),
    PaymentMethodSpec(
        key=PaymentMethodKey.COD,
        label="Cash on delivery",
        description="Collected by the courier and remitted later.",
    ),
    PaymentMethodSpec(
        key=PaymentMethodKey.CARD,
        label="Card",
        description="Debit or credit card, taken on a terminal or gateway.",
    ),
    PaymentMethodSpec(
        key=PaymentMethodKey.BKASH,
        label="bKash",
        description="Mobile financial service.",
    ),
    PaymentMethodSpec(
        key=PaymentMethodKey.NAGAD,
        label="Nagad",
        description="Mobile financial service.",
    ),
    PaymentMethodSpec(
        key=PaymentMethodKey.ROCKET,
        label="Rocket",
        description="Mobile financial service.",
    ),
    PaymentMethodSpec(
        key=PaymentMethodKey.BANK_TRANSFER,
        label="Bank transfer",
        description="Direct deposit or online transfer.",
    ),
    PaymentMethodSpec(
        key=PaymentMethodKey.MANUAL,
        label="Manual / other",
        description=(
            "Anything recorded by hand — an adjustment, or a channel with no entry of its own."
        ),
        can_disable=False,
        locked_reason="Staff need somewhere to record a payment that fits no other method.",
    ),
)

PAYMENT_METHODS_BY_KEY: dict[str, PaymentMethodSpec] = {
    spec.key: spec for spec in PAYMENT_METHOD_REGISTRY
}

# Free text written before the registry existed, mapped onto it once.
LEGACY_PAYMENT_METHOD_ALIASES: dict[str, str] = {
    "": PaymentMethodKey.MANUAL,
    "cash on delivery": PaymentMethodKey.COD,
    "cash_on_delivery": PaymentMethodKey.COD,
    "credit card": PaymentMethodKey.CARD,
    "debit card": PaymentMethodKey.CARD,
    "bank": PaymentMethodKey.BANK_TRANSFER,
}


def normalize_payment_method(raw: str) -> str:
    """Best-effort match of a legacy value onto a registry key. Anything still
    unrecognised becomes MANUAL rather than being dropped — a payment that
    happened is not erased by a naming cleanup."""
    value = (raw or "").strip().lower().replace(" ", "_")
    if value in PAYMENT_METHODS_BY_KEY:
        return value
    plain = (raw or "").strip().lower()
    return LEGACY_PAYMENT_METHOD_ALIASES.get(plain) or LEGACY_PAYMENT_METHOD_ALIASES.get(
        value, PaymentMethodKey.MANUAL
    )
