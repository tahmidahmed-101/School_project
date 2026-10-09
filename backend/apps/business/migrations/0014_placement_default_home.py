from django.db import migrations, models

PLACEMENTS = [("home", "Home"), ("preorder", "Pre-order"), ("both", "Both")]


class Migration(migrations.Migration):
    """Default only. Rows already placed on both shops are left alone;
    `manage.py split_both_placements` splits them."""

    dependencies = [
        ("business", "0013_preorder_deposit_percent"),
    ]

    operations = [
        migrations.AlterField(
            model_name="heroslide",
            name="placement",
            field=models.CharField(choices=PLACEMENTS, default="home", max_length=20),
        ),
        migrations.AlterField(
            model_name="promoline",
            name="placement",
            field=models.CharField(choices=PLACEMENTS, default="home", max_length=20),
        ),
    ]
