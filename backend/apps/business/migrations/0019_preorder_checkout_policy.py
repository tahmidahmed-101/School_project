from django.db import migrations, models


def create_empty_policy(apps, schema_editor):
    # An empty, unpublished row only, as in 0010: the wording must come from
    # the business owner, and an unpublished row answers `policy_unavailable`.
    StorePolicy = apps.get_model("business", "StorePolicy")
    StorePolicy.objects.get_or_create(kind="preorder_checkout")


def remove_empty_policy(apps, schema_editor):
    # Only an untouched row is removed; one staff have edited keeps its
    # revisions (PROTECT), so reversing fails loudly rather than losing them.
    StorePolicy = apps.get_model("business", "StorePolicy")
    StorePolicy.objects.filter(
        kind="preorder_checkout", content={}, is_published=False, revisions__isnull=True
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("business", "0018_promotion_popup_image_only"),
    ]

    operations = [
        migrations.AlterField(
            model_name="storepolicy",
            name="kind",
            field=models.CharField(
                choices=[
                    ("shipping", "Shipping policy"),
                    ("returns", "Return policy"),
                    ("refund", "Refund policy"),
                    ("preorder_checkout", "Pre-order checkout terms"),
                ],
                max_length=20,
                unique=True,
            ),
        ),
        migrations.RunPython(create_empty_policy, remove_empty_policy),
    ]
