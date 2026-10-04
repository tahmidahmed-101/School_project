from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.factories import CustomerUserFactory
from apps.accounts.models import Notification
from apps.accounts.services.notifications import notify

pytestmark = pytest.mark.django_db

URL = "/api/v1/customer/notifications/"


def _notification(user, title="Hello", **kwargs):
    return notify(user=user, kind=Notification.Kind.ORDER, title=title, **kwargs)


# --- API ------------------------------------------------------------------------


def test_customer_lists_own_notifications_newest_first_with_unread_count(api_client):
    customer = CustomerUserFactory()
    _notification(customer, "First")
    read = _notification(customer, "Second")
    read.read_at = read.created_at
    read.save()
    _notification(CustomerUserFactory(), "Someone else's")
    api_client.force_authenticate(user=customer)

    response = api_client.get(URL)

    assert response.status_code == 200
    data = response.data["data"]
    assert [row["title"] for row in data["results"]] == ["Second", "First"]
    assert [row["is_read"] for row in data["results"]] == [True, False]
    assert data["unread_count"] == 1
    assert set(data["results"][0]) == {
        "id",
        "kind",
        "title",
        "message",
        "object_id",
        "is_read",
        "read_at",
        "created_at",
    }


def test_unread_filter(api_client):
    customer = CustomerUserFactory()
    unread = _notification(customer, "Unread")
    read = _notification(customer, "Read")
    read.read_at = read.created_at
    read.save()
    api_client.force_authenticate(user=customer)

    rows = api_client.get(URL, {"unread": "true"}).data["data"]["results"]

    assert [row["id"] for row in rows] == [str(unread.id)]


def test_mark_one_read(api_client):
    customer = CustomerUserFactory()
    notification = _notification(customer)
    api_client.force_authenticate(user=customer)

    response = api_client.post(f"{URL}{notification.id}/read/")

    assert response.status_code == 200
    assert response.data["data"]["is_read"] is True
    notification.refresh_from_db()
    assert notification.read_at is not None


def test_cannot_mark_someone_elses_notification(api_client):
    notification = _notification(CustomerUserFactory())
    api_client.force_authenticate(user=CustomerUserFactory())

    response = api_client.post(f"{URL}{notification.id}/read/")

    assert response.status_code == 404
    notification.refresh_from_db()
    assert notification.read_at is None


def test_mark_all_read_touches_only_own_unread(api_client):
    customer = CustomerUserFactory()
    other = _notification(CustomerUserFactory())
    for _ in range(3):
        _notification(customer)
    api_client.force_authenticate(user=customer)

    response = api_client.post(f"{URL}read-all/")

    assert response.data["data"] == {"updated": 3}
    assert not Notification.objects.filter(user=customer, read_at__isnull=True).exists()
    other.refresh_from_db()
    assert other.read_at is None


def test_anonymous_and_staff_are_refused(api_client, admin_user):
    assert api_client.get(URL).status_code == 401
    api_client.force_authenticate(user=admin_user)
    assert api_client.get(URL).status_code == 403


def test_list_query_count_does_not_grow(api_client):
    customer = CustomerUserFactory()
    _notification(customer)
    api_client.force_authenticate(user=customer)
    with CaptureQueriesContext(connection) as small:
        assert api_client.get(URL).status_code == 200

    for _ in range(10):
        _notification(customer)
    with CaptureQueriesContext(connection) as large:
        assert api_client.get(URL).status_code == 200

    assert len(large) == len(small)


def test_guests_are_not_notified():
    guest = CustomerUserFactory(is_guest=True)

    assert _notification(guest) is None
    assert not Notification.objects.exists()
