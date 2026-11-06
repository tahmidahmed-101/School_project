"""Admin list endpoints must not run a query per row: the count with 5 more
rows equals the count with 1."""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounting.factories import JournalEntryFactory, JournalEntryLineFactory
from apps.accounts.factories import AdminUserFactory, CustomerUserFactory
from apps.audit.factories import AuditLogFactory
from apps.logistics.factories import ShippingRateFactory, ShippingZoneFactory
from apps.orders.factories import (
    ReturnRMAFactory,
    ReturnRMALineFactory,
    SalesOrderFactory,
    SalesOrderLineFactory,
)

pytestmark = pytest.mark.django_db


def _journal_entry():
    entry = JournalEntryFactory()
    JournalEntryLineFactory(journal_entry=entry)
    JournalEntryLineFactory(journal_entry=entry)


def _customer():
    CustomerUserFactory()


def _zone():
    ShippingRateFactory(zone=ShippingZoneFactory())


def _audit_log():
    AuditLogFactory()


def _rma():
    rma = ReturnRMAFactory(order=SalesOrderFactory())
    ReturnRMALineFactory(rma=rma, order_line=SalesOrderLineFactory(order=rma.order))


ENDPOINTS = [
    ("/api/v1/admin/accounting/journal-entries/", _journal_entry),
    ("/api/v1/admin/users/", _customer),
    ("/api/v1/admin/logistics/zones/", _zone),
    ("/api/v1/admin/audit/", _audit_log),
    ("/api/v1/admin/orders/returns/", _rma),
]


@pytest.mark.parametrize(("url", "make_row"), ENDPOINTS, ids=[url for url, _ in ENDPOINTS])
def test_list_query_count_does_not_grow_with_rows(api_client, url, make_row):
    api_client.force_authenticate(user=AdminUserFactory())
    make_row()
    with CaptureQueriesContext(connection) as small:
        assert api_client.get(url).status_code == 200

    for _ in range(5):
        make_row()
    with CaptureQueriesContext(connection) as large:
        response = api_client.get(url)
        assert response.status_code == 200

    assert len(large) == len(small), [q["sql"][:120] for q in large.captured_queries]
