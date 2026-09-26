from __future__ import annotations

import factory

from apps.marketing.models import NewsletterSubscriber


class NewsletterSubscriberFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = NewsletterSubscriber

    email = factory.Sequence(lambda n: f"subscriber{n}@example.com")
    is_active = True
    unsubscribed_at = None
