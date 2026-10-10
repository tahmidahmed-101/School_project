from __future__ import annotations

import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.models import TelegramLink, User, UserOTP
from apps.accounts.selectors.telegram_links import telegram_recipient_ids
from apps.audit.services.audit import log_action
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.services.telegram import send_telegram
from apps.common.utils.codes import hash_code

LINK_CODE_EXPIRY_MINUTES = 10
# The bot cannot know who is typing, so the code is looked up by its hash
# alone and has to be unguessable on its own: 10 characters of a 32-letter
# alphabet (no 0/O or 1/I) is 2**50 possibilities.
LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
LINK_CODE_LENGTH = 10


def create_telegram_link_code(*, user: User) -> str:
    """A fresh single-use code for `user`; any earlier one stops working. Only
    the hash is stored."""
    purpose = UserOTP.Purpose.TELEGRAM_LINK
    UserOTP.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )
    code = "".join(secrets.choice(LINK_CODE_ALPHABET) for _ in range(LINK_CODE_LENGTH))
    UserOTP.objects.create(
        user=user,
        purpose=purpose,
        code_hash=hash_code(code),
        expires_at=timezone.now() + timedelta(minutes=LINK_CODE_EXPIRY_MINUTES),
    )
    return code


@transaction.atomic
def link_telegram_account(*, code: str, telegram_user_id: int) -> User:
    """Bind a Telegram account to the staff member who generated `code`. The
    code row is locked and consumed in the same transaction, so two messages
    carrying the same code cannot both link."""
    invalid = BusinessRuleViolationError(
        "That code is not valid or has expired. Generate a new one in the dashboard.",
        code="invalid_link_code",
    )
    otp = (
        UserOTP.objects.select_for_update()
        .select_related("user")
        .filter(
            purpose=UserOTP.Purpose.TELEGRAM_LINK,
            code_hash=hash_code(code.strip().upper()),
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .first()
    )
    if otp is None:
        raise invalid
    user = otp.user
    if (
        not user.is_active
        or user.deleted_at is not None
        or user.role not in (UserRole.ADMIN, UserRole.STAFF)
    ):
        raise invalid
    if TelegramLink.objects.filter(telegram_user_id=telegram_user_id).exclude(user=user).exists():
        raise BusinessRuleViolationError(
            "This Telegram account is already linked to another staff account.",
            code="telegram_already_linked",
        )
    otp.consume()
    TelegramLink.objects.update_or_create(
        user=user, defaults={"telegram_user_id": telegram_user_id}
    )
    log_action(actor=user, action="telegram.linked", target_type="User", target_id=user.id)
    return user


def unlink_telegram_account(*, user: User) -> None:
    deleted, _ = TelegramLink.objects.filter(user=user).delete()
    if deleted:
        log_action(actor=user, action="telegram.unlinked", target_type="User", target_id=user.id)


def send_to_staff(text: str, *, permissions, reply_markup: dict | None = None) -> None:
    """Message every linked staff member holding one of `permissions`, each in
    their own private chat."""
    for telegram_user_id in telegram_recipient_ids(permissions):
        send_telegram(chat_id=telegram_user_id, text=text, reply_markup=reply_markup)


def alert_staff(text: str, *, permissions, reply_markup: dict | None = None) -> None:
    """`send_to_staff` once the surrounding transaction has committed, so a
    rolled-back order is never announced and no row lock is held while
    Telegram answers. A failed send never fails the request."""
    transaction.on_commit(
        lambda: send_to_staff(text, permissions=permissions, reply_markup=reply_markup),
        robust=True,
    )
