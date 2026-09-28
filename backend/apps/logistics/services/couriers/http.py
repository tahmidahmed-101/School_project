from __future__ import annotations

import ipaddress
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import TYPE_CHECKING, Any

from django.utils import timezone

from .base import CourierGateway
from .exceptions import (
    CourierAuthError,
    CourierNotConfiguredError,
    CourierRateLimitedError,
    CourierRejectedError,
    CourierUnavailableError,
)

if TYPE_CHECKING:
    from apps.orders.models import Shipment

DEFAULT_TIMEOUT = 15

ALLOWED_SCHEMES = {"https"}


def parse_courier_datetime(value: Any) -> datetime | None:
    """Best-effort ISO-ish datetime parse for webhook timestamps. None rather
    than raising: a courier sending a format we don't recognise must not stop
    the event from being recorded, only leave `occurred_at` to fall back to
    "now"."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).strip().replace(" ", "T"))
    except ValueError:
        return None
    return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed


def _assert_safe_base_url(url: str, *, carrier_name: str) -> None:
    """Reject a base URL that would make urlopen read local resources.

    `api_base_url` is admin-editable, and urllib happily honours `file://` and
    plain `http://` — turning a courier record into a reader of arbitrary
    local files and an unencrypted channel for the API key.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES or not parsed.hostname:
        raise CourierNotConfiguredError(
            f"{carrier_name} has an invalid API base URL — it must be an https:// address."
        )
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        return
    if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
        raise CourierNotConfiguredError(
            f"{carrier_name} has an API base URL pointing at a private address."
        )


class HttpCourierGateway(CourierGateway):
    """Shared HTTP plumbing for the live provider integrations: request
    execution, timeouts and a uniform mapping from transport/HTTP failures onto
    the courier exception hierarchy. Auth is deliberately not implemented here —
    the three providers use three different schemes."""

    default_base_url = ""
    timeout = DEFAULT_TIMEOUT
    requires_api_secret = False

    def _require_configured(self) -> None:
        if not self.carrier.is_integration_enabled:
            raise CourierNotConfiguredError(
                f"{self.carrier.name} integration is disabled — enable it and "
                "add API credentials before dispatching shipments to it.",
            )
        if not self.carrier.api_key:
            raise CourierNotConfiguredError(f"{self.carrier.name} is missing an API key.")
        if self.requires_api_secret and not self.carrier.api_secret:
            raise CourierNotConfiguredError(f"{self.carrier.name} is missing an API secret.")

    @property
    def base_url(self) -> str:
        url = (self.carrier.api_base_url or self.default_base_url).rstrip("/")
        _assert_safe_base_url(url, carrier_name=self.carrier.name)
        return url

    def config(self, key: str, default: Any = None) -> Any:
        settings = self.carrier.config or {}
        return settings.get(key, default) if isinstance(settings, dict) else default

    def _auth_headers(self) -> dict[str, str]:
        """Per-provider auth. Empty by default: there is no scheme that is
        correct for every courier, and guessing one silently sends credentials
        the provider ignores."""
        return {}

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | list[Any] | None = None,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        authenticated: bool = True,
    ) -> Any:
        url = self.base_url + path
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"

        request_headers = {"Accept": "application/json"}
        if authenticated:
            request_headers.update(self._auth_headers())
        if headers:
            request_headers.update(headers)

        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")

        request = urllib.request.Request(url, data=data, method=method)  # noqa: S310
        for name, value in request_headers.items():
            request.add_header(name, value)

        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310
                return self._decode(response.read())
        except urllib.error.HTTPError as exc:
            raise self._error_for_status(exc.code, self._safe_read(exc)) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise CourierUnavailableError(
                f"{self.carrier.name} could not be reached: {exc}."
            ) from exc

    def _decode(self, body: bytes) -> Any:
        if not body:
            return {}
        try:
            return json.loads(body)
        except ValueError:
            return {"raw": body.decode("utf-8", errors="replace")}

    def _safe_read(self, exc: urllib.error.HTTPError) -> Any:
        try:
            return self._decode(exc.read())
        except Exception:
            return {}

    def _error_for_status(self, status_code: int, body: Any) -> Exception:
        detail = self._error_message(body) or f"HTTP {status_code}"
        name = self.carrier.name
        if status_code in (401, 403):
            return CourierAuthError(f"{name} rejected the API credentials: {detail}.")
        if status_code == 429:
            return CourierRateLimitedError(f"{name} rate limit hit: {detail}.")
        if 400 <= status_code < 500:
            return CourierRejectedError(f"{name} rejected the request: {detail}.")
        return CourierUnavailableError(f"{name} returned a server error: {detail}.")

    def _error_message(self, body: Any) -> str:
        if not isinstance(body, dict):
            return ""
        parts = [str(body[key]) for key in ("message", "error") if body.get(key)]
        errors = body.get("errors")
        if isinstance(errors, dict):
            parts += [
                (
                    f"{field}: {'; '.join(str(m) for m in messages)}"
                    if isinstance(messages, list)
                    else f"{field}: {messages}"
                )
                for field, messages in errors.items()
            ]
        return " ".join(parts)

    def create_consignment(self, shipment: Shipment) -> dict[str, Any]:
        raise NotImplementedError

    def get_tracking_status(self, consignment_id: str) -> dict[str, Any]:
        raise NotImplementedError

    def cancel_consignment(self, consignment_id: str) -> bool:
        raise NotImplementedError
