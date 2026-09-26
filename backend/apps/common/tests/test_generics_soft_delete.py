from __future__ import annotations

from typing import ClassVar

import pytest
from django.test import RequestFactory
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.common.generics import IncludeDeletedMixin, RestoreAPIView
from apps.logistics.factories import CarrierFactory
from apps.logistics.selectors.rates import get_carrier_by_id

pytestmark = pytest.mark.django_db


class _AlwaysAllowed(BasePermission):
    def has_permission(self, request, view) -> bool:
        return True


class _ManageOnly(BasePermission):
    def has_permission(self, request, view) -> bool:
        return False


class _ListView(IncludeDeletedMixin, APIView):
    permission_classes: ClassVar[list] = [_AlwaysAllowed]
    include_deleted_permission = _ManageOnly


def _view(query: str = ""):
    view = _ListView()
    view.request = Request(RequestFactory().get(f"/?{query}"))
    return view


def test_include_deleted_defaults_to_false_and_does_not_escalate():
    view = _view()

    assert view.include_deleted() is False
    assert [type(p) for p in view.get_permissions()] == [_AlwaysAllowed]


def test_include_deleted_true_escalates_to_the_manage_permission():
    view = _view("include_deleted=true")

    assert view.include_deleted() is True
    assert [type(p) for p in view.get_permissions()] == [_AlwaysAllowed, _ManageOnly]


def test_include_deleted_rejects_a_non_boolean_value():
    with pytest.raises(ValidationError):
        _view("include_deleted=maybe").include_deleted()


def test_include_deleted_without_a_configured_permission_never_escalates():
    class _Open(IncludeDeletedMixin, APIView):
        permission_classes: ClassVar[list] = [_AlwaysAllowed]

    view = _Open()
    view.request = Request(RequestFactory().get("/?include_deleted=true"))

    assert [type(p) for p in view.get_permissions()] == [_AlwaysAllowed]


class _CarrierRestoreView(RestoreAPIView):
    permission_classes: ClassVar[list] = [_AlwaysAllowed]
    get_object_fn = staticmethod(get_carrier_by_id)
    serializer_class = None
    not_found_code = "carrier_not_found"
    not_found_message = "Carrier not found."


def test_restore_view_404s_for_an_unknown_id():
    import uuid

    response = _CarrierRestoreView().post(RequestFactory().post("/"), carrier_id=uuid.uuid4())

    assert response.status_code == 404
    assert response.data["error"]["code"] == "carrier_not_found"


def test_restore_view_rejects_a_record_that_is_not_deleted():
    carrier = CarrierFactory()

    response = _CarrierRestoreView().post(RequestFactory().post("/"), carrier_id=carrier.id)

    assert response.status_code == 400
    assert response.data["error"]["code"] == "not_deleted"
