import django.db.models.deletion
from django.db import migrations, models


def to_campaigns(apps, schema_editor):
    """Old popups keep showing where and while they did: a switched-on one
    becomes active, a switched-off one paused, its page becomes its only page,
    and its link (or its sale, or the pre-order page) becomes its destination."""
    PromotionPopup = apps.get_model("business", "PromotionPopup")
    for popup in PromotionPopup.objects.select_related("sale"):
        popup.status = "active" if popup.is_active else "paused"
        popup.pages = [popup.placement]
        if popup.link_url:
            popup.destination_type = "url"
            popup.sale = None
        elif popup.sale_id:
            popup.destination_type = "campaign"
        else:
            popup.destination_type = "url"
            popup.link_url = "/pre-order"
        if popup.sale_id:
            popup.name = popup.sale.name[:120]
        else:
            popup.name = "Pre-order popup" if popup.placement == "preorder" else "Home popup"
        popup.save()


def to_placements(apps, schema_editor):
    PromotionPopup = apps.get_model("business", "PromotionPopup")
    for popup in PromotionPopup.objects.all():
        popup.is_active = popup.status == "active"
        popup.placement = "preorder" if popup.pages == ["preorder"] else "home"
        popup.save()


class Migration(migrations.Migration):
    dependencies = [
        ("business", "0019_preorder_checkout_policy"),
        ("catalog", "0033_product_show_questions_price_report"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="promotionpopup", name="promotion_popup_sale_matches_placement"
        ),
        migrations.RemoveIndex(model_name="promotionpopup", name="promotion_popup_live_idx"),
        migrations.AddField(
            model_name="promotionpopup",
            name="name",
            field=models.CharField(default="", max_length=120),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="status",
            field=models.CharField(
                choices=[("draft", "Draft"), ("active", "Active"), ("paused", "Paused")],
                default="draft",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="priority",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="starts_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="ends_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="delay_seconds",
            field=models.PositiveSmallIntegerField(default=2),
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="pages",
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="devices",
            field=models.CharField(
                choices=[
                    ("all", "Desktop and mobile"),
                    ("desktop", "Desktop only"),
                    ("mobile", "Mobile only"),
                ],
                default="all",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="destination_type",
            field=models.CharField(
                choices=[
                    ("product", "Product"),
                    ("category", "Category"),
                    ("campaign", "Campaign page"),
                    ("url", "Custom URL"),
                ],
                default="url",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="product",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="promotion_popups",
                to="catalog.product",
            ),
        ),
        migrations.AddField(
            model_name="promotionpopup",
            name="category",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="promotion_popups",
                to="catalog.category",
            ),
        ),
        migrations.AlterField(
            model_name="promotionpopup",
            name="sale",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="promotion_popups",
                to="catalog.sale",
            ),
        ),
        migrations.RunPython(to_campaigns, to_placements),
        migrations.RemoveField(model_name="promotionpopup", name="placement"),
        migrations.RemoveField(model_name="promotionpopup", name="is_active"),
        migrations.AlterModelOptions(
            name="promotionpopup",
            options={"ordering": ["-priority", "-created_at", "-id"]},
        ),
        migrations.AddIndex(
            model_name="promotionpopup",
            index=models.Index(
                fields=["status", "starts_at", "ends_at"], name="promotion_popup_live_idx"
            ),
        ),
    ]
