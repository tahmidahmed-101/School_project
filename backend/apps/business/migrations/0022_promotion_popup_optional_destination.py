from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("business", "0021_promotion_popup_shop"),
    ]

    # Every popup now opens after two seconds on desktop and mobile alike, and
    # the destination is optional (`none`: the image alone).
    operations = [
        migrations.RemoveField(model_name="promotionpopup", name="delay_seconds"),
        migrations.RemoveField(model_name="promotionpopup", name="devices"),
        migrations.AlterField(
            model_name="promotionpopup",
            name="destination_type",
            field=models.CharField(
                choices=[
                    ("none", "No link"),
                    ("product", "Product"),
                    ("category", "Category"),
                    ("campaign", "Campaign page"),
                    ("url", "Custom URL"),
                ],
                default="none",
                max_length=10,
            ),
        ),
    ]
