from django import forms
from django.contrib import admin, messages

from apps.common.exceptions import BusinessRuleViolationError

from .constants import MODULES_BY_KEY
from .models import BusinessProfile, ModuleSetting
from .services.modules import set_module_config, set_module_enabled


@admin.register(BusinessProfile)
class BusinessProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "email", "updated_at")

    def has_add_permission(self, request) -> bool:
        return not BusinessProfile.objects.exists()

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


class ModuleSettingForm(forms.ModelForm):
    bundles = forms.BooleanField(required=False)
    product_variations = forms.BooleanField(required=False)
    returns = forms.BooleanField(required=False)
    tax = forms.BooleanField(required=False)
    chart_of_accounts_picker = forms.BooleanField(required=False)

    class Meta:
        model = ModuleSetting
        fields = ("key", "is_licensed", "is_enabled", "config")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        spec = MODULES_BY_KEY.get(self.instance.key) if self.instance else None
        stored = (self.instance.config or {}) if self.instance else {}
        for field in spec.config_fields if spec else ():
            self.fields[field.key].label = field.label
            self.fields[field.key].help_text = field.description
            self.fields[field.key].initial = stored.get(field.key, field.default)

    def clean_is_licensed(self) -> bool:
        is_licensed = self.cleaned_data["is_licensed"]
        spec = MODULES_BY_KEY.get(self.instance.key)
        if spec is not None and not spec.can_disable and not is_licensed:
            raise forms.ValidationError(
                f"{spec.label} cannot be un-licensed — {spec.locked_reason}"
            )
        return is_licensed

    def clean_is_enabled(self) -> bool:
        is_enabled = self.cleaned_data["is_enabled"]
        spec = MODULES_BY_KEY.get(self.instance.key)
        if spec is not None and not spec.can_disable and not is_enabled:
            raise forms.ValidationError(
                f"{spec.label} cannot be switched off — {spec.locked_reason}"
            )
        return is_enabled


@admin.register(ModuleSetting)
class ModuleSettingAdmin(admin.ModelAdmin):
    """The vendor's control plane: which modules this install is sold, and —
    same as the operator's dashboard toggle — whether a sellable one is on."""

    form = ModuleSettingForm
    list_display = ("label", "key", "is_licensed", "is_enabled", "sellable", "updated_at")
    list_display_links = ("label",)
    list_editable = ("is_licensed", "is_enabled")
    list_filter = ("is_licensed", "is_enabled")
    readonly_fields = ("key", "config")
    ordering = ("key",)
    actions = ("license_selected", "unlicense_selected")

    @admin.display(description="Module")
    def label(self, obj) -> str:
        spec = MODULES_BY_KEY.get(obj.key)
        return spec.label if spec else obj.key

    @admin.display(boolean=True, description="Sellable")
    def sellable(self, obj) -> bool:
        spec = MODULES_BY_KEY.get(obj.key)
        return bool(spec and spec.can_disable)

    def get_readonly_fields(self, request, obj=None):
        fields = list(self.readonly_fields)
        spec = MODULES_BY_KEY.get(obj.key) if obj else None
        if spec is not None and not spec.can_disable:
            fields.append("is_licensed")
            fields.append("is_enabled")
        return fields

    def get_fields(self, request, obj=None):
        fields = ["key", "is_licensed", "is_enabled"]
        spec = MODULES_BY_KEY.get(obj.key) if obj else None
        if spec is not None:
            fields.extend(field.key for field in spec.config_fields)
        fields.append("config")
        return fields

    def save_model(self, request, obj, form, change):
        if "is_licensed" in form.changed_data:
            ModuleSetting.objects.filter(pk=obj.pk).update(is_licensed=obj.is_licensed)
        if "is_enabled" in form.changed_data:
            try:
                set_module_enabled(key=obj.key, is_enabled=obj.is_enabled)
            except BusinessRuleViolationError as exc:
                self.message_user(request, str(exc), level=messages.ERROR)

        spec = MODULES_BY_KEY.get(obj.key)
        if spec is not None:
            changed_config = {
                field.key: form.cleaned_data[field.key]
                for field in spec.config_fields
                if field.key in form.changed_data
            }
            if changed_config:
                try:
                    set_module_config(key=obj.key, config=changed_config)
                except BusinessRuleViolationError as exc:
                    self.message_user(request, str(exc), level=messages.ERROR)

        obj.refresh_from_db()

    def _set_licensed(self, request, queryset, is_licensed: bool) -> None:
        sellable = [
            obj.pk
            for obj in queryset
            if (MODULES_BY_KEY.get(obj.key) or None) and MODULES_BY_KEY[obj.key].can_disable
        ]
        skipped = queryset.count() - len(sellable)
        changed = ModuleSetting.objects.filter(pk__in=sellable).update(is_licensed=is_licensed)
        verb = "Licensed" if is_licensed else "Un-licensed"
        message = f"{verb} {changed} module(s)."
        if skipped:
            message += f" Skipped {skipped} core module(s), which cannot be un-licensed."
        self.message_user(request, message)

    @admin.action(description="License selected modules")
    def license_selected(self, request, queryset) -> None:
        self._set_licensed(request, queryset, True)

    @admin.action(description="Un-license selected modules")
    def unlicense_selected(self, request, queryset) -> None:
        self._set_licensed(request, queryset, False)

    def has_add_permission(self, request) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
