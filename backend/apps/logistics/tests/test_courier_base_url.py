"""`Carrier.api_base_url` is admin-editable and feeds straight into urlopen,
which honours `file://` and will happily reach internal addresses."""

from __future__ import annotations

import pytest

from apps.logistics.services.couriers.exceptions import CourierNotConfiguredError
from apps.logistics.services.couriers.http import HttpCourierGateway

pytestmark = pytest.mark.django_db


class _Carrier:
    name = "Test Courier"

    def __init__(self, api_base_url: str) -> None:
        self.api_base_url = api_base_url


def _gateway(url: str) -> HttpCourierGateway:
    gateway = HttpCourierGateway.__new__(HttpCourierGateway)
    gateway.carrier = _Carrier(url)
    return gateway


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "http://api.courier.test",
        "gopher://api.courier.test",
        "https://127.0.0.1/api",
        "https://10.0.0.5/api",
        "https://169.254.169.254/latest/meta-data",
        "not-a-url",
    ],
)
def test_unsafe_base_urls_are_rejected(url):
    with pytest.raises(CourierNotConfiguredError):
        assert _gateway(url).base_url


def test_a_public_https_base_url_is_accepted():
    assert _gateway("https://api.courier.test/v1/").base_url == "https://api.courier.test/v1"
