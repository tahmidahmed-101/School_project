# Module toggles

Runtime on/off state for whole feature areas, distinct from the two switches
that already existed.

## Three tiers, deliberately separate

| Tier | What it answers | Where it lives |
| --- | --- | --- |
| Capability | Does this business run this feature at all? | `ModuleSetting` + `MODULE_REGISTRY` |
| Instance | Is this particular row usable? | `is_active`, `Carrier.is_integration_enabled` |
| Actor | May this person touch it? | `StaffPermission` |

A module toggle is not a permission. Switching a module off hides it from
everyone, admins included, and the API refuses it.

**A flag never changes schema shape.** No toggle makes a column nullable or
relaxes a constraint. "Single-warehouse mode" means a resolver fills the FK,
not that the FK becomes optional. Once a flag can relax a constraint, every
query downstream has to defend against both worlds forever.

## Where the truth lives

`apps/business/constants.py` holds `MODULE_REGISTRY` — the list of modules,
their labels, and `depends_on`. The `ModuleSetting` table records only the
operator's choice; it never defines what a module is. A module the registry
does not list is treated as enabled, so adding a route can never make it
unreachable by accident.

`depends_on` mirrors the hard cross-app foreign keys. A module can only be
switched off while nothing still enabled points into its tables, which is why
`catalog`, `inventory`, `orders`, `accounting` and `audit` carry
`can_disable=False` with a `locked_reason` the UI shows.

## Enforcement

`apps.business.middleware.ModuleEnabledMiddleware` maps the first path segment
under `/api/v1/admin/` to a module key and answers 403 `module_disabled` when
it is off. Middleware rather than per-view permissions so a route added later
is covered by default instead of by remembering to decorate it.
`apps.common.permissions.require_module(key)` exists for finer-grained cases.

Hiding the sidebar entry (`module` key in `frontend/src/config/nav.js`) is
presentation only. The middleware is the access control.

Checkout consults `is_module_enabled` before applying discounts and coupons,
so an order placed with those modules off simply carries no discount rather
than failing.

## Mode flags

Tier-2 settings live in `ModuleSetting.config`, declared as `config_fields` on
the module's `ModuleSpec`. The registry holds the default; the row holds only
what the operator changed, so a field added later reads as its default rather
than as missing.

`inventory.multi_warehouse` is the first one. Off, the warehouse picker is
hidden and movements resolve to `Warehouse.is_default`; the foreign keys stay
exactly as non-null as they were.

`PATCH /admin/settings/modules/<key>/` takes either `is_enabled` or `config`,
never both — they take different code paths, and mixing them hides which one
was refused.

## Adding a module

1. Add a `ModuleKey` member and a `ModuleSpec` to `MODULE_REGISTRY`.
2. If it owns an admin URL segment, add it to `ADMIN_SEGMENT_MODULES`.
3. Add `module: "<key>"` to its nav entries.
4. For a mode flag, add a `ConfigField` to the spec's `config_fields`.

No migration is needed — rows are created on demand by `set_module_enabled`,
and unlisted keys default to enabled.
