from django.db import migrations, models


def status_to_switch(apps, schema_editor):
    """Active stays on; draft and paused become off."""
    PromotionPopup = apps.get_model("business", "PromotionPopup")
    PromotionPopup.objects.exclude(status="active").update(is_active=False)


def switch_to_status(apps, schema_editor):
    PromotionPopup = apps.get_model("business", "PromotionPopup")
    PromotionPopup.objects.filter(is_active=False).update(status="paused")


class Migration(migrations.Migration):
    dependencies = [
        ("business", "0022_promotion_popup_optional_destination"),
    ]

    operations = [
        migrations.RemoveIndex(model_name="promotionpopup", name="promotion_popup_live_idx"),
        migrations.AddField(
            model_name="promotionpopup",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
        migrations.RunPython(status_to_switch, switch_to_status),
        migrations.RemoveField(model_name="promotionpopup", name="status"),
        migrations.AddIndex(
            model_name="promotionpopup",
            index=models.Index(
                fields=["is_active", "starts_at", "ends_at"], name="promotion_popup_live_idx"
            ),
        ),
    ]
