from __future__ import annotations

import factory

from apps.accounts.factories import CustomerUserFactory
from apps.audit.models import AuditLog, LoginHistory


class AuditLogFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = AuditLog

    actor = factory.SubFactory(CustomerUserFactory)
    action = "user.updated"
    target_type = "User"
    target_id = factory.LazyAttribute(lambda o: str(o.actor.id))
    ip_address = "127.0.0.1"
    user_agent = "pytest"
    metadata = factory.LazyFunction(dict)


class LoginHistoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = LoginHistory

    user = factory.SubFactory(CustomerUserFactory)
    email = factory.SelfAttribute("user.email")
    ip_address = "127.0.0.1"
    user_agent = "pytest"
    was_successful = True
