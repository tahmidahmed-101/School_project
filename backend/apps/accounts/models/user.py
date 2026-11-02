from __future__ import annotations

from typing import ClassVar

from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models

from apps.accounts.constants import UserRole
from apps.common.models.base import SoftDeleteModel


class UserManager(DjangoUserManager):
    def create_user(self, username=None, email=None, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        if not username:
            username = email.split("@")[0]
        return super().create_user(username, email, password, **extra_fields)

    def create_superuser(self, username=None, email=None, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        if not username:
            username = email.split("@")[0]

        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", UserRole.ADMIN)

        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser, SoftDeleteModel):
    username = models.CharField(max_length=150, blank=True, default="")
    # Nullable for phone-only customers (guest checkout without an email).
    # NULLs never collide on the unique constraint; "" would, so save() maps
    # a blank email to NULL.
    email = models.EmailField(unique=True, null=True, blank=True)  # type: ignore[assignment]
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.CUSTOMER)
    phone = models.CharField(max_length=32, blank=True)
    profile_picture = models.URLField(blank=True)
    is_email_verified = models.BooleanField(default=False)
    is_phone_verified = models.BooleanField(default=False)
    # A guest-checkout identity, not an account: no email, no usable password,
    # one per normalised phone. Anonymous checkouts only ever attach orders to
    # these, never to a registered user found by a typed email or phone.
    is_guest = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    objects: ClassVar[UserManager] = UserManager()

    class Meta:
        indexes: ClassVar[list] = [
            models.Index(fields=["role"]),
            models.Index(fields=["is_active"]),
            models.Index(fields=["deleted_at", "is_active"], name="user_deleted_active_idx"),
        ]
        constraints: ClassVar[list] = [
            # Makes concurrent first checkouts from one phone race-safe: the
            # loser's insert fails here and it reuses the winner's row.
            models.UniqueConstraint(
                fields=["phone"],
                condition=models.Q(is_guest=True, deleted_at__isnull=True),
                name="user_unique_live_guest_phone",
            ),
        ]

    def __str__(self) -> str:
        # AbstractBaseUser.__str__ returns the email, which is None for
        # phone-only customers — and __str__ must return a str.
        return self.email or self.phone or str(self.pk)

    def save(self, *args, **kwargs):
        # AbstractUser.clean() normalises a missing email to "".
        self.email = self.email or None
        if self.is_superuser and self.role != UserRole.ADMIN:
            self.role = UserRole.ADMIN
        super().save(*args, **kwargs)

    @property
    def is_admin_role(self) -> bool:
        return self.role == UserRole.ADMIN

    @property
    def is_staff_role(self) -> bool:
        return self.role == UserRole.STAFF

    @property
    def is_customer_role(self) -> bool:
        return self.role == UserRole.CUSTOMER
