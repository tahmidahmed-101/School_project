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
    username: models.CharField = models.CharField(max_length=150, blank=True, default="")
    email: models.EmailField = models.EmailField(unique=True)
    role: models.CharField = models.CharField(
        max_length=20, choices=UserRole.choices, default=UserRole.CUSTOMER
    )
    phone: models.CharField = models.CharField(max_length=32, blank=True)
    profile_picture: models.URLField = models.URLField(blank=True)
    is_email_verified: models.BooleanField = models.BooleanField(default=False)
    is_phone_verified: models.BooleanField = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    objects: ClassVar[UserManager] = UserManager()

    class Meta:
        indexes: ClassVar[list] = [
            models.Index(fields=["role"]),
            models.Index(fields=["is_active"]),
            models.Index(fields=["deleted_at", "is_active"], name="user_deleted_active_idx"),
        ]

    def save(self, *args, **kwargs):
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
