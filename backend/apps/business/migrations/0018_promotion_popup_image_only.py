import apps.business.models.storefront_content
from django.db import migrations, models


def drop_popups_without_image(apps, schema_editor):
    """A popup is now only its image; one without an image has nothing to show."""
    apps.get_model("business", "PromotionPopup").objects.filter(image="").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("business", "0017_preorder_promotion_popup"),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name="promotionpopup",
            name="promotion_popup_live_idx",
        ),
        migrations.RemoveConstraint(
            model_name="promotionpopup",
            name="promotion_popup_window_valid",
        ),
        migrations.DeleteModel(
            name="PromotionPopupProduct",
        ),
        migrations.RenameField(
            model_name="promotionpopup",
            old_name="cta_url",
            new_name="link_url",
        ),
        migrations.RemoveField(model_name="promotionpopup", name="name"),
        migrations.RemoveField(model_name="promotionpopup", name="title_en"),
        migrations.RemoveField(model_name="promotionpopup", name="title_bn"),
        migrations.RemoveField(model_name="promotionpopup", name="body_en"),
        migrations.RemoveField(model_name="promotionpopup", name="body_bn"),
        migrations.RemoveField(model_name="promotionpopup", name="cta_label_en"),
        migrations.RemoveField(model_name="promotionpopup", name="cta_label_bn"),
        migrations.RemoveField(model_name="promotionpopup", name="starts_at"),
        migrations.RemoveField(model_name="promotionpopup", name="ends_at"),
        migrations.RemoveField(model_name="promotionpopup", name="priority"),
        migrations.RunPython(drop_popups_without_image, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="promotionpopup",
            name="image",
            field=models.ImageField(
                upload_to=apps.business.models.storefront_content._promotion_image_path
            ),
        ),
        migrations.AlterModelOptions(
            name="promotionpopup",
            options={"ordering": ["-created_at", "-id"]},
        ),
        migrations.AddIndex(
            model_name="promotionpopup",
            index=models.Index(fields=["placement", "is_active"], name="promotion_popup_live_idx"),
        ),
    ]
