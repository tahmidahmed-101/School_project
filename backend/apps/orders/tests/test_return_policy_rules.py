"""Return eligibility comes only from published return-policy versions, each
governing deliveries from its effective date (inclusive, project timezone).
A delivery before every published version keeps the legacy behaviour; all
RMA paths go through `create_rma`. Policy text here is test data.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.accounts.factories import CustomerUserFactory
from apps.business.constants import ModuleKey
from apps.business.models import PolicyKind, StorePolicy
from apps.business.selectors.policies import return_rule_versions
from apps.business.services.modules import set_module_config
from apps.business.services.policies import update_store_policy
from apps.catalog.factories import CategoryFactory, ProductFactory, ProductVariantFactory
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import MovementType
from apps.inventory.services.stock import record_movement
from apps.orders.models import ReturnRMA, Shipment
from apps.orders.services import returns as returns_service
from apps.orders.services.carts import add_line, get_or_create_cart
from apps.orders.services.checkout import checkout
from apps.orders.services.payments import capture_payment
from apps.orders.services.returns import create_rma
from apps.orders.services.shipments import create_shipment, update_shipment_status

pytestmark = pytest.mark.django_db

CONTENT = {
    "title": {"en": "Test return policy", "bn": "Test return policy bn"},
    "sections": [{"heading": {"en": "H", "bn": "H"}, "body": {"en": "B", "bn": "B"}}],
}
FIXED_NOW = timezone.now().replace(microsecond=500)
TODAY = timezone.localtime(FIXED_NOW, timezone.get_default_timezone()).date()
V1_DATE = TODAY - timedelta(days=60)
V2_DATE = TODAY - timedelta(days=20)


def _start_of(day) -> datetime:
    """Midnight of `day` in the project timezone — the first moment a version
    effective that day governs."""
    return timezone.make_aware(datetime.combine(day, time.min), timezone.get_default_timezone())


def _publish_returns(*, effective_date=V1_DATE, **rules) -> StorePolicy:
    policy = StorePolicy.objects.get(kind=PolicyKind.RETURNS)
    return update_store_policy(
        policy=policy,
        actor=None,
        data={"content": CONTENT, "effective_date": effective_date, "is_published": True, **rules},
    )


def _order(quantity: int = 2, category=None, lines: int = 1):
    customer = CustomerUserFactory()
    order = get_or_create_cart(customer)
    for _ in range(lines):
        product = ProductFactory(**({"category": category} if category else {}))
        variant = ProductVariantFactory(product=product)
        record_movement(
            variant=variant,
            movement_type=MovementType.PURCHASE_IN,
            quantity=50,
            unit_cost=Decimal("5"),
        )
        add_line(order=order, variant=variant, quantity=quantity)
    checkout(order=order)
    capture_payment(order=order, amount=order.grand_total)
    order.refresh_from_db()
    return order


def _ship(order, quantity, *, delivered_at=None) -> Shipment:
    shipment = create_shipment(
        order=order,
        lines=[{"order_line": line, "quantity": quantity} for line in order.lines.all()],
    )
    if delivered_at is not None:
        update_shipment_status(shipment=shipment, status=Shipment.Status.DELIVERED)
        Shipment.objects.filter(pk=shipment.pk).update(delivered_at=delivered_at)
    return shipment


def _delivered_order(*, delivered_at, quantity: int = 2, category=None):
    order = _order(quantity=quantity, category=category)
    _ship(order, quantity, delivered_at=delivered_at)
    order.refresh_from_db()
    return order


def _return_one(order):
    return create_rma(order=order, lines=[{"order_line": order.lines.get(), "quantity": 1}])


def _refused(order) -> str:
    with pytest.raises(BusinessRuleViolationError) as exc:
        _return_one(order)
    return exc.value.code


@pytest.fixture
def frozen_now(monkeypatch):
    monkeypatch.setattr(returns_service, "timezone", SimpleNamespace(now=lambda: FIXED_NOW))
    return FIXED_NOW


@pytest.fixture
def two_versions():
    """v1 (from V1_DATE): 30-day window, everything returnable.
    v2 (from V2_DATE): 7-day window, pre-orders and one category excluded."""
    excluded = CategoryFactory()
    _publish_returns(effective_date=V1_DATE, return_window_days=30)
    _publish_returns(
        effective_date=V2_DATE,
        return_window_days=7,
        preorder_returns_allowed=False,
        non_returnable_category_ids=[excluded.id],
    )
    return excluded


# --- No published policy: unchanged behaviour ---------------------------------


def test_without_a_published_policy_old_deliveries_are_still_returnable():
    order = _delivered_order(delivered_at=timezone.now() - timedelta(days=400))

    assert _return_one(order).status == ReturnRMA.Status.REQUESTED


def test_draft_rules_are_not_enforced():
    policy = StorePolicy.objects.get(kind=PolicyKind.RETURNS)
    update_store_policy(
        policy=policy,
        actor=None,
        data={"return_window_days": 1, "preorder_returns_allowed": False},
    )
    order = _delivered_order(delivered_at=timezone.now() - timedelta(days=30))

    _return_one(order)


def test_unpublishing_withdraws_every_version():
    _publish_returns(return_window_days=1)
    update_store_policy(
        policy=StorePolicy.objects.get(kind=PolicyKind.RETURNS),
        actor=None,
        data={"is_published": False},
    )
    order = _delivered_order(delivered_at=_start_of(V1_DATE) + timedelta(days=5))

    _return_one(order)


# --- Effective date ------------------------------------------------------------


def test_delivery_before_the_first_effective_date_keeps_legacy_behaviour(frozen_now):
    _publish_returns(effective_date=V1_DATE, return_window_days=1)
    order = _delivered_order(delivered_at=_start_of(V1_DATE) - timedelta(microseconds=1))

    _return_one(order)


def test_delivery_on_the_effective_date_is_governed_by_it(frozen_now):
    _publish_returns(effective_date=V1_DATE, return_window_days=1)
    order = _delivered_order(delivered_at=_start_of(V1_DATE))

    assert _refused(order) == "return_window_expired"


def test_delivery_after_the_effective_date_is_governed_by_it(frozen_now):
    _publish_returns(effective_date=V1_DATE, return_window_days=1)
    order = _delivered_order(delivered_at=_start_of(V1_DATE) + timedelta(days=3))

    assert _refused(order) == "return_window_expired"


def test_newer_version_does_not_change_eligibility_under_an_earlier_one(two_versions):
    excluded = two_versions
    governed_by_v1 = _delivered_order(
        delivered_at=_start_of(V2_DATE) - timedelta(microseconds=1), category=excluded
    )
    governed_by_v2 = _delivered_order(delivered_at=_start_of(V2_DATE), category=excluded)

    _return_one(governed_by_v1)
    with pytest.raises(BusinessRuleViolationError) as exc:
        _return_one(governed_by_v2)
    assert exc.value.code == "category_not_returnable"


def test_preorder_exclusion_applies_only_from_its_version(two_versions):
    governed_by_v1 = _delivered_order(delivered_at=_start_of(V2_DATE) - timedelta(days=1))
    governed_by_v2 = _delivered_order(delivered_at=timezone.now())
    for order in (governed_by_v1, governed_by_v2):
        order.lines.update(is_preorder=True)

    _return_one(governed_by_v1)
    assert _refused(governed_by_v2) == "preorder_not_returnable"


def test_same_day_correction_supersedes_the_version_it_corrects(frozen_now):
    _publish_returns(effective_date=V1_DATE, return_window_days=1)
    _publish_returns(effective_date=V1_DATE, return_window_days=90)
    order = _delivered_order(delivered_at=_start_of(V1_DATE) + timedelta(days=1))

    _return_one(order)


# --- Return window under the applicable version --------------------------------


def test_window_boundary_uses_the_governing_versions_window(frozen_now, two_versions):
    # Delivered 30 days ago: after V1_DATE, before V2_DATE -> v1's 30 days.
    on_boundary = _delivered_order(delivered_at=frozen_now - timedelta(days=30))
    past_boundary = _delivered_order(delivered_at=frozen_now - timedelta(days=30, microseconds=1))

    _return_one(on_boundary)
    assert _refused(past_boundary) == "return_window_expired"


def test_window_boundary_under_the_newer_version(frozen_now, two_versions):
    on_boundary = _delivered_order(delivered_at=frozen_now - timedelta(days=7))
    past_boundary = _delivered_order(delivered_at=frozen_now - timedelta(days=7, microseconds=1))

    _return_one(on_boundary)
    assert _refused(past_boundary) == "return_window_expired"


def test_window_runs_from_delivery_not_order_creation(frozen_now):
    _publish_returns(return_window_days=3)
    order = _delivered_order(delivered_at=frozen_now - timedelta(days=1))
    type(order).objects.filter(pk=order.pk).update(created_at=frozen_now - timedelta(days=60))

    _return_one(order)


def test_undelivered_units_fall_under_todays_version_with_no_window_started(frozen_now):
    _publish_returns(return_window_days=3, preorder_returns_allowed=False)
    order = _order(quantity=2)
    shipment = _ship(order, 2)
    Shipment.objects.filter(pk=shipment.pk).update(shipped_at=frozen_now - timedelta(days=30))
    order.refresh_from_db()

    order.lines.update(is_preorder=False)
    _return_one(order)
    order.lines.update(is_preorder=True)
    assert _refused(order) == "preorder_not_returnable"


# --- Split shipments: the latest delivery governs (existing window semantics) ---


def test_split_shipment_window_runs_from_the_last_delivery(frozen_now):
    _publish_returns(return_window_days=3)
    order = _order(quantity=2)
    _ship(order, 1, delivered_at=frozen_now - timedelta(days=10))
    _ship(order, 1, delivered_at=frozen_now - timedelta(days=1))
    order.refresh_from_db()

    _return_one(order)


def test_split_shipment_across_a_version_boundary_follows_the_last_delivery(two_versions):
    excluded = two_versions
    order = _order(quantity=2, category=excluded)
    _ship(order, 1, delivered_at=_start_of(V2_DATE) - timedelta(days=2))  # v1 period
    _ship(order, 1, delivered_at=_start_of(V2_DATE) + timedelta(days=1))  # v2 period
    order.refresh_from_db()

    with pytest.raises(BusinessRuleViolationError) as exc:
        _return_one(order)
    assert exc.value.code == "category_not_returnable"


def test_split_shipment_straddling_the_first_version_is_governed_by_it(frozen_now):
    _publish_returns(effective_date=V1_DATE, return_window_days=1)
    order = _order(quantity=2)
    _ship(order, 1, delivered_at=_start_of(V1_DATE) - timedelta(days=3))  # legacy period
    _ship(order, 1, delivered_at=_start_of(V1_DATE) + timedelta(days=1))  # v1 period
    order.refresh_from_db()

    assert _refused(order) == "return_window_expired"


# --- Existing invariants still hold under a published policy ---------------------


def test_excluded_category_is_refused_and_claims_nothing():
    excluded = CategoryFactory()
    _publish_returns(non_returnable_category_ids=[excluded.id])
    order = _delivered_order(delivered_at=timezone.now(), category=excluded)

    assert _refused(order) == "category_not_returnable"
    assert order.lines.get().returned_quantity == 0
    assert not ReturnRMA.objects.exists()


def test_allowed_return_still_claims_the_units():
    _publish_returns(non_returnable_category_ids=[CategoryFactory().id])
    order = _delivered_order(delivered_at=timezone.now())

    _return_one(order)

    assert order.lines.get().returned_quantity == 1


def test_feature_toggle_still_wins_over_policy():
    _publish_returns(return_window_days=30)
    order = _delivered_order(delivered_at=timezone.now())
    set_module_config(key=ModuleKey.ORDERS, config={"returns": False})

    assert _refused(order) == "feature_disabled"


def test_quantity_limits_still_apply_under_a_policy():
    _publish_returns(return_window_days=30)
    order = _delivered_order(delivered_at=timezone.now(), quantity=2)

    with pytest.raises(BusinessRuleViolationError) as exc:
        create_rma(order=order, lines=[{"order_line": order.lines.get(), "quantity": 3}])
    assert exc.value.code == "over_return"


# --- Query behaviour -------------------------------------------------------------


def test_version_lookup_and_enforcement_do_not_grow_with_lines_or_revisions(two_versions):
    small = _order(quantity=1, lines=1)
    _ship(small, 1, delivered_at=timezone.now())
    large = _order(quantity=1, lines=6)
    _ship(large, 1, delivered_at=timezone.now())

    with CaptureQueriesContext(connection) as one_line:
        returns_service._enforce_return_policy(return_rule_versions(), list(small.lines.all()))
    for days in (10, 5):
        _publish_returns(effective_date=TODAY - timedelta(days=days), return_window_days=7)
    with CaptureQueriesContext(connection) as many_lines:
        returns_service._enforce_return_policy(return_rule_versions(), list(large.lines.all()))

    assert len(many_lines) == len(one_line)


# --- Every API path that creates an RMA -----------------------------------------


def _post_return(api_client, user, order, path: str):
    api_client.force_authenticate(user=user)
    url = (
        f"/api/v1/customer/orders/{order.id}/returns/"
        if path == "customer"
        else f"/api/v1/admin/orders/{order.id}/returns/"
    )
    return api_client.post(
        url,
        {"lines": [{"order_line_id": str(order.lines.get().id), "quantity": 1}]},
        format="json",
    )


@pytest.mark.parametrize("path", ["customer", "staff"])
def test_both_api_paths_apply_the_same_governing_version(
    api_client, admin_user, two_versions, path
):
    excluded = two_versions
    governed_by_v1 = _delivered_order(
        delivered_at=_start_of(V2_DATE) - timedelta(days=1), category=excluded
    )
    governed_by_v2 = _delivered_order(delivered_at=timezone.now(), category=excluded)

    allowed = _post_return(
        api_client,
        governed_by_v1.customer if path == "customer" else admin_user,
        governed_by_v1,
        path,
    )
    refused = _post_return(
        api_client,
        governed_by_v2.customer if path == "customer" else admin_user,
        governed_by_v2,
        path,
    )

    assert allowed.status_code == 201, allowed.data
    assert refused.status_code == 400
    assert refused.data["error"]["code"] == "category_not_returnable"


@pytest.mark.parametrize("path", ["customer", "staff"])
def test_both_api_paths_enforce_the_window(api_client, admin_user, path):
    _publish_returns(return_window_days=3)
    order = _delivered_order(delivered_at=timezone.now() - timedelta(days=5))

    response = _post_return(
        api_client, order.customer if path == "customer" else admin_user, order, path
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "return_window_expired"
