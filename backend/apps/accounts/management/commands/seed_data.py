from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.models import Address, User
from apps.accounts.services.staff_permissions import set_staff_permissions
from apps.accounts.services.users import create_user


class Command(BaseCommand):
    help = "Seed development/demo users, staff, admins, and addresses."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--customers", type=int, default=5)
        parser.add_argument("--staff", type=int, default=2)
        parser.add_argument("--admins", type=int, default=1)
        parser.add_argument("--superusers", type=int, default=0)
        parser.add_argument("--addresses-per-customer", type=int, default=1)
        parser.add_argument("--password", default="SeedPass123!")
        parser.add_argument("--prefix", default="seed")

    def handle(self, *args: Any, **options: Any) -> None:
        password = options["password"]
        prefix = options["prefix"]

        admin_users = self._seed_users(
            count=options["admins"],
            role=UserRole.ADMIN,
            prefix=prefix,
            kind="admin",
            password=password,
        )
        superusers = self._seed_superusers(
            count=options["superusers"],
            prefix=prefix,
            password=password,
        )
        actor = superusers[0] if superusers else admin_users[0] if admin_users else None

        customers = self._seed_users(
            count=options["customers"],
            role=UserRole.CUSTOMER,
            prefix=prefix,
            kind="customer",
            password=password,
        )
        self._seed_addresses(
            customers=customers,
            per_customer=options["addresses_per_customer"],
        )

        self._seed_staff(
            count=options["staff"],
            prefix=prefix,
            password=password,
            granted_by=actor,
        )

        self.stdout.write(self.style.SUCCESS("Seed data ready."))

    def _seed_users(
        self,
        *,
        count: int,
        role: str,
        prefix: str,
        kind: str,
        password: str,
    ) -> list[User]:
        users: list[User] = []
        for index in range(1, count + 1):
            email = f"{prefix}-{kind}-{index}@example.com"
            user = User.objects.filter(email=email).first()
            if user is None:
                user = create_user(
                    email=email,
                    password=password,
                    role=role,
                    first_name=kind.title(),
                    last_name=str(index),
                    phone=f"+1555000{index:04d}",
                    is_active=True,
                )
            users.append(user)
        return users

    def _seed_superusers(self, *, count: int, prefix: str, password: str) -> list[User]:
        users: list[User] = []
        for index in range(1, count + 1):
            email = f"{prefix}-superuser-{index}@example.com"
            user = User.objects.filter(email=email).first()
            if user is None:
                user = create_user(
                    email=email,
                    password=password,
                    role=UserRole.ADMIN,
                    first_name="Super",
                    last_name=str(index),
                    is_active=True,
                )
                user.is_staff = True
                user.is_superuser = True
                user.save(update_fields=["is_staff", "is_superuser"])
            users.append(user)
        return users

    def _seed_staff(
        self,
        *,
        count: int,
        prefix: str,
        password: str,
        granted_by: User | None,
    ) -> list[User]:
        staff_users = self._seed_users(
            count=count,
            role=UserRole.STAFF,
            prefix=prefix,
            kind="staff",
            password=password,
        )
        if granted_by is not None:
            for user in staff_users:
                set_staff_permissions(
                    staff_user=user,
                    permission_updates=[
                        {"code": StaffPermissionCode.USERS_VIEW, "is_enabled": True},
                        {"code": StaffPermissionCode.REPORTS_VIEW, "is_enabled": True},
                    ],
                    granted_by=granted_by,
                )
        return staff_users

    def _seed_addresses(self, *, customers: list[User], per_customer: int) -> None:
        for user in customers:
            for index in range(1, per_customer + 1):
                line1 = f"Seed House {index}"
                if Address.objects.filter(user=user, line1=line1, deleted_at__isnull=True).exists():
                    continue
                Address.objects.create(
                    user=user,
                    full_name=f"{user.first_name} {user.last_name}".strip() or user.email,
                    phone=user.phone or "+15550000000",
                    line1=line1,
                    city="San Francisco",
                    state="CA",
                    postal_code="94105",
                    country="US",
                    is_default=index == 1,
                )
