from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.business.models import ModuleSetting
from apps.business.services.modules import seed_modules, set_module_config, set_module_enabled
from apps.common.exceptions import BusinessRuleViolationError

DISABLED_MODULES = ("procurement",)
DISABLED_SUB_FEATURES = {
    "catalog": {"product_variations": False},
    "accounting": {"tax": False},
}


class Command(BaseCommand):
    help = (
        "Switch the business config to a simple storefront: variations, procurement " "and tax off."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Skip the in-use guard and write the config directly when existing rows block it.",
        )

    def handle(self, *args, **options):
        force = options["force"]
        seed_modules()
        for key in DISABLED_MODULES:
            try:
                state = set_module_enabled(key=key, is_enabled=False)
                self.stdout.write(f"{key}: enabled={state['is_enabled']}")
            except BusinessRuleViolationError as exc:
                self.stderr.write(f"{key}: BLOCKED — {exc}")
        for key, config in DISABLED_SUB_FEATURES.items():
            try:
                state = set_module_config(key=key, config=config)
                fields = {f["key"]: f["value"] for f in state["config_fields"]}
                self.stdout.write(f"{key}: config={fields}")
            except BusinessRuleViolationError as exc:
                if not force:
                    self.stderr.write(f"{key}: BLOCKED — {exc} (rerun with --force to override)")
                    continue
                setting, _ = ModuleSetting.objects.get_or_create(key=key)
                setting.config = {**setting.config, **config}
                setting.save(update_fields=["config"])
                self.stdout.write(f"{key}: config={setting.config} (forced, guard bypassed)")
