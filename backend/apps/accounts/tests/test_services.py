from __future__ import annotations

from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.models import StaffPermission, UserOTP
from apps.accounts.selectors.users import user_permissions
from apps.accounts.services.addresses import (
    create_address,
    delete_address,
    set_default_address,
    update_address,
)
from apps.accounts.services.authentication import (
    authenticate_user,
    change_password,
    create_otp,
    request_email_verification,
    request_password_reset,
    reset_password,
    verify_email,
)
from apps.accounts.services.staff_permissions import (
    replace_staff_permissions,
    set_staff_permission,
    set_staff_permissions,
)
from apps.accounts.services.users import (
    activate_user,
    admin_update_user,
    create_staff_user,
    create_user,
    deactivate_user,
    reset_user_password,
    set_user_role,
    soft_delete_user,
    update_user_profile,
    update_user_profile_image,
)
from apps.accounts.tests.helpers import create_address as make_address
from apps.accounts.tests.helpers import create_user as make_user
from apps.accounts.tests.helpers import extract_otp_code
from apps.common.exceptions import BusinessRuleViolationError

pytestmark = pytest.mark.django_db


def test_create_user_normalizes_email_and_rejects_duplicate_active_email():
    user = create_user(email="CUSTOMER@EXAMPLE.COM", password="StrongPass123!")

    assert user.email == "customer@example.com"
    assert user.role == UserRole.CUSTOMER
    assert user.check_password("StrongPass123!")

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_user(email="customer@example.com", password="StrongPass123!")

    assert exc.value.code == "duplicate_email"


def test_create_user_converts_a_db_level_duplicate_into_a_clean_error(admin_user):
    """The email column's unique constraint has no is_active/deleted_at exclusion, so a
    soft-deleted row still blocks a new insert — the pre-check alone misses it."""
    user = create_user(email="stale@example.com", password="StrongPass123!")
    soft_delete_user(actor=admin_user, target_user=user)

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_user(email="stale@example.com", password="StrongPass123!")

    assert exc.value.code == "duplicate_email"


def test_authenticate_user_rejects_invalid_inactive_and_soft_deleted_users():
    user = make_user(email="auth@example.com", password="StrongPass123!")

    assert authenticate_user(email=user.email, password="StrongPass123!") == user

    with pytest.raises(BusinessRuleViolationError) as invalid_exc:
        authenticate_user(email=user.email, password="WrongPass123!")
    assert invalid_exc.value.code == "auth_invalid_credentials"

    user.is_active = False
    user.save(update_fields=["is_active"])
    with pytest.raises(BusinessRuleViolationError):
        authenticate_user(email=user.email, password="StrongPass123!")

    user.is_active = True
    user.soft_delete()
    with pytest.raises(BusinessRuleViolationError):
        authenticate_user(email=user.email, password="StrongPass123!")


def test_change_password_requires_old_password_and_updates_hash():
    user = make_user(email="change@example.com", password="OldStrongPass123!")

    with pytest.raises(BusinessRuleViolationError) as exc:
        change_password(user=user, old_password="bad", new_password="NewStrongPass123!")
    assert exc.value.code == "invalid_old_password"

    change_password(
        user=user,
        old_password="OldStrongPass123!",
        new_password="NewStrongPass123!",
    )

    user.refresh_from_db()
    assert user.check_password("NewStrongPass123!")


def test_email_verification_consumes_only_valid_unexpired_otp():
    user = make_user(email="otp@example.com")
    otp, code = create_otp(user=user, purpose=UserOTP.Purpose.EMAIL_VERIFICATION)

    with pytest.raises(BusinessRuleViolationError) as invalid_exc:
        verify_email(user=user, code="000000")
    assert invalid_exc.value.code == "invalid_otp"

    verify_email(user=user, code=code)

    otp.refresh_from_db()
    user.refresh_from_db()
    assert otp.consumed_at is not None
    assert user.is_email_verified is True

    with pytest.raises(BusinessRuleViolationError):
        verify_email(user=user, code=code)


def test_expired_otp_cannot_verify_email():
    user = make_user(email="expired@example.com")
    otp, code = create_otp(user=user, purpose=UserOTP.Purpose.EMAIL_VERIFICATION)
    otp.expires_at = timezone.now() - timedelta(minutes=1)
    otp.save(update_fields=["expires_at"])

    with pytest.raises(BusinessRuleViolationError) as exc:
        verify_email(user=user, code=code)

    assert exc.value.code == "invalid_otp"


def test_request_email_verification_and_password_reset_send_mail_without_leaking_unknown_email():
    user = make_user(email="mail@example.com")

    request_email_verification(user)

    assert len(mail.outbox) == 1
    assert "Verify your email" in mail.outbox[0].subject

    request_password_reset("missing@example.com")

    assert len(mail.outbox) == 1

    request_password_reset(user.email)

    assert len(mail.outbox) == 2
    assert "Reset your password" in mail.outbox[1].subject


def test_reset_password_requires_valid_password_reset_otp():
    user = make_user(email="forgot@example.com", password="OldStrongPass123!")
    request_password_reset(user.email)
    code = extract_otp_code(mail.outbox[-1].body)

    with pytest.raises(BusinessRuleViolationError):
        reset_password(email=user.email, code="000000", new_password="NewStrongPass123!")

    reset_password(email=user.email, code=code, new_password="NewStrongPass123!")

    user.refresh_from_db()
    assert user.check_password("NewStrongPass123!")


def test_profile_services_only_update_allowed_customer_fields():
    user = make_user(email="profile-service@example.com")

    update_user_profile(
        user,
        {
            "first_name": "Jane",
            "role": UserRole.ADMIN,
            "profile_picture": "https://example.com/me.png",
        },
    )

    user.refresh_from_db()
    assert user.first_name == "Jane"
    assert user.role == UserRole.CUSTOMER
    assert user.profile_picture == "https://example.com/me.png"

    update_user_profile_image(user=user, profile_picture="avatars/customer.png")
    user.refresh_from_db()
    assert user.profile_picture == "avatars/customer.png"


def test_admin_update_user_requires_admin_and_only_updates_allowed_fields():
    customer = make_user(email="target@example.com")
    non_admin = make_user(email="not-admin@example.com")
    admin = make_user(email="admin-update@example.com", role=UserRole.ADMIN)

    with pytest.raises(BusinessRuleViolationError) as exc:
        admin_update_user(actor=non_admin, target_user=customer, data={"first_name": "Nope"})
    assert exc.value.code == "admin_required"

    admin_update_user(
        actor=admin,
        target_user=customer,
        data={"first_name": "Updated", "role": UserRole.ADMIN, "is_email_verified": True},
    )

    customer.refresh_from_db()
    assert customer.first_name == "Updated"
    assert customer.role == UserRole.CUSTOMER
    assert customer.is_email_verified is True


def test_admin_cannot_deactivate_or_soft_delete_self_or_last_admin():
    admin = make_user(email="only-admin@example.com", role=UserRole.ADMIN)

    with pytest.raises(BusinessRuleViolationError) as self_exc:
        deactivate_user(actor=admin, target_user=admin)
    assert self_exc.value.code == "self_disable"

    other_admin = make_user(email="other-admin@example.com", role=UserRole.ADMIN)
    deactivate_user(actor=admin, target_user=other_admin)
    other_admin.refresh_from_db()
    assert other_admin.is_active is False

    with pytest.raises(BusinessRuleViolationError) as last_exc:
        soft_delete_user(actor=other_admin, target_user=admin)
    assert last_exc.value.code == "last_admin"


def test_admin_can_activate_reset_password_and_change_role_with_guardrails():
    admin = make_user(email="role-admin@example.com", role=UserRole.ADMIN)
    target = make_user(email="role-target@example.com", is_active=False)

    activate_user(actor=admin, target_user=target)
    target.refresh_from_db()
    assert target.is_active is True

    reset_user_password(actor=admin, target_user=target, new_password="ResetStrongPass123!")
    target.refresh_from_db()
    assert target.check_password("ResetStrongPass123!")

    set_user_role(actor=admin, target_user=target, role=UserRole.STAFF)
    target.refresh_from_db()
    assert target.role == UserRole.STAFF

    with pytest.raises(BusinessRuleViolationError) as exc:
        set_user_role(actor=admin, target_user=admin, role=UserRole.CUSTOMER)
    assert exc.value.code == "self_role_change"


def test_create_staff_user_and_staff_permission_services_validate_role_and_codes():
    admin = make_user(email="staff-admin@example.com", role=UserRole.ADMIN)
    customer = make_user(email="permission-customer@example.com")

    with pytest.raises(BusinessRuleViolationError):
        create_staff_user(
            granted_by=customer,
            email="bad-staff@example.com",
            password="StrongPass123!",
        )

    staff = create_staff_user(
        granted_by=admin,
        email="service-staff@example.com",
        password="StrongPass123!",
        permissions=[StaffPermissionCode.USERS_VIEW],
    )

    assert staff.role == UserRole.STAFF
    assert user_permissions(staff) == [StaffPermissionCode.USERS_VIEW]

    with pytest.raises(BusinessRuleViolationError):
        set_staff_permission(
            staff_user=customer,
            permission_code=StaffPermissionCode.USERS_VIEW,
            is_enabled=True,
            granted_by=admin,
        )

    with pytest.raises(BusinessRuleViolationError) as invalid_exc:
        set_staff_permissions(
            staff_user=staff,
            permission_updates=[{"code": "bad.permission", "is_enabled": True}],
            granted_by=admin,
        )
    assert invalid_exc.value.code == "invalid_permission"

    set_staff_permissions(
        staff_user=staff,
        permission_updates=[{"code": StaffPermissionCode.USERS_VIEW, "is_enabled": False}],
        granted_by=admin,
    )
    assert (
        StaffPermission.objects.get(
            user=staff,
            permission_code=StaffPermissionCode.USERS_VIEW,
        ).is_enabled
        is False
    )


def test_replace_staff_permissions_enables_only_the_requested_codes():
    admin = make_user(email="replace-perm-admin@example.com", role=UserRole.ADMIN)
    customer = make_user(email="replace-perm-customer@example.com")
    staff = create_staff_user(
        granted_by=admin,
        email="replace-perm-staff@example.com",
        password="StrongPass123!",
        permissions=[StaffPermissionCode.USERS_VIEW, StaffPermissionCode.REPORTS_VIEW],
    )

    with pytest.raises(BusinessRuleViolationError):
        replace_staff_permissions(
            staff_user=customer,
            permission_codes=[StaffPermissionCode.USERS_VIEW],
            granted_by=admin,
        )

    with pytest.raises(BusinessRuleViolationError) as invalid_exc:
        replace_staff_permissions(
            staff_user=staff,
            permission_codes=["bad.permission"],
            granted_by=admin,
        )
    assert invalid_exc.value.code == "invalid_permission"

    replace_staff_permissions(
        staff_user=staff,
        permission_codes=[StaffPermissionCode.REPORTS_VIEW, StaffPermissionCode.CATALOG_VIEW],
        granted_by=admin,
    )

    assert sorted(user_permissions(staff)) == sorted(
        [StaffPermissionCode.REPORTS_VIEW, StaffPermissionCode.CATALOG_VIEW]
    )


def test_address_services_create_update_default_and_soft_delete():
    user = make_user(email="address-service@example.com")
    first = make_address(user=user, is_default=True)

    second = create_address(
        user=user,
        data={
            "full_name": "Jane Doe",
            "phone": "123",
            "line1": "Line 2",
            "city": "Oakland",
            "postal_code": "94607",
            "country": "US",
            "is_default": True,
        },
    )

    first.refresh_from_db()
    assert first.is_default is False
    assert second.is_default is True

    update_address(user=user, address=second, data={"city": "Berkeley", "is_default": False})
    second.refresh_from_db()
    assert second.city == "Berkeley"
    assert second.is_default is False

    set_default_address(user=user, address=first)
    first.refresh_from_db()
    assert first.is_default is True

    delete_address(address=first)
    first.refresh_from_db()
    assert first.deleted_at is not None
