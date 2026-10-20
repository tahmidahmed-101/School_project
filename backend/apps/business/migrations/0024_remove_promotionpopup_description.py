from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("business", "0023_promotion_popup_is_active"),
    ]

    operations = [
        migrations.RemoveField(model_name="promotionpopup", name="description"),
    ]
