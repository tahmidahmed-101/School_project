from django.db import migrations, models


def pages_to_shop(apps, schema_editor):
    """A popup that showed only on the pre-order page belongs to the pre-order
    shop; every other one to the stock shop."""
    PromotionPopup = apps.get_model("business", "PromotionPopup")
    for popup in PromotionPopup.objects.all():
        if popup.pages == ["preorder"]:
            popup.shop = "preorder"
            popup.save(update_fields=["shop"])


def shop_to_pages(apps, schema_editor):
    PromotionPopup = apps.get_model("business", "PromotionPopup")
    for popup in PromotionPopup.objects.all():
        popup.pages = ["preorder"] if popup.shop == "preorder" else ["home"]
        popup.save(update_fields=["pages"])


class Migration(migrations.Migration):
    dependencies = [
        ("business", "0020_promotion_popup_campaign"),
    ]

    operations = [
        migrations.AddField(
            model_name="promotionpopup",
            name="shop",
            field=models.CharField(
                choices=[("stock", "Stock"), ("preorder", "Pre-order")],
                default="stock",
                max_length=10,
            ),
        ),
        migrations.RunPython(pages_to_shop, shop_to_pages),
        migrations.RemoveField(model_name="promotionpopup", name="pages"),
    ]
