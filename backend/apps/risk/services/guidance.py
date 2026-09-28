"""Turning a recommendation into an instruction.

``RiskAssessment.recommended_action`` is a route code -- approve, review,
block -- written for the code path that reads it next. An agent looking at an
order card is not that code path: "review" does not tell anyone what to do
with a customer who is on the phone right now.
"""

from __future__ import annotations

ACTION_APPROVE = "approve"
ACTION_REVIEW = "review"
ACTION_BLOCK = "block"

# (risk_level, recommended_action) -> what to do about it.
_GUIDANCE: dict[tuple[str, str], str] = {
    ("low", ACTION_APPROVE): "Low risk - confirm and dispatch as usual.",
    ("low", ACTION_REVIEW): (
        "Low risk, but flagged for a look - a quick check of the address is enough."
    ),
    ("medium", ACTION_APPROVE): (
        "Moderate risk - dispatch is reasonable, but a confirmation call costs less "
        "than a failed delivery."
    ),
    ("medium", ACTION_REVIEW): (
        "Moderate risk - consider taking payment in advance, or call to confirm before shipping."
    ),
    ("medium", ACTION_BLOCK): (
        "Moderate risk with a standing block on this customer - do not dispatch "
        "without a supervisor."
    ),
    ("high", ACTION_REVIEW): (
        "High risk - ask for payment in advance. Do not send this one cash on "
        "delivery without confirming by phone first."
    ),
    ("high", ACTION_BLOCK): (
        "High risk - refuse cash on delivery. Advance payment only, or cancel."
    ),
}

# Fallback when the pair is unknown but the level is not.
_BY_LEVEL: dict[str, str] = {
    "low": "Low risk - confirm and dispatch as usual.",
    "medium": "Moderate risk - a confirmation call before shipping is worth the minute.",
    "high": "High risk - ask for payment in advance before dispatching.",
}


def describe(risk_level: str, recommended_action: str) -> str:
    """One sentence an agent can act on, for a scored order.

    Never returns an empty string: a blank panel reads as "nothing found"
    rather than "the code did not recognise this".
    """
    level = (risk_level or "").strip().lower()
    action = (recommended_action or "").strip().lower()

    specific = _GUIDANCE.get((level, action))
    if specific is not None:
        return specific

    by_level = _BY_LEVEL.get(level)
    if by_level is not None:
        return by_level

    return (
        "This order was scored but the result is not one this version recognises - "
        "check it by hand before dispatching."
    )
