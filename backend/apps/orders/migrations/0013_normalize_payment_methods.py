from __future__ import annotations

from django.db import migrations

from apps.orders.constants import normalize_payment_method


def forwards(apps, schema_editor):
    Payment = apps.get_model("orders", "Payment")
    seen = set(Payment.objects.values_list("method", flat=True).distinct())
    for raw in seen:
        normalized = normalize_payment_method(raw)
        if normalized != raw:
            Payment.objects.filter(method=raw).update(method=normalized)


class Migration(migrations.Migration):
    """Free text written before the registry existed is mapped onto it. There is
    no reverse: the original spelling is not recoverable, and the keys are a
    superset of what the old values meant."""

    dependencies = [("orders", "0012_paymentmethodsetting_alter_payment_method")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
