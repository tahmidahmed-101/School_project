from __future__ import annotations

from rest_framework.settings import api_settings
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle

# The project-wide defaults (`anon`, `user`) are a blunt instrument: a single
# rate cannot be both tight enough to slow credential stuffing and loose
# enough for a storefront that fires several catalog requests per page view.
# These scopes let each kind of endpoint carry the limit it actually needs;
# rates live in settings under DEFAULT_THROTTLE_RATES.


class SettingsRateMixin:
    """Resolve the scope's rate from settings on every instantiation.

    DRF snapshots `SimpleRateThrottle.THROTTLE_RATES` into a class attribute
    when the module is first imported, so a rate changed afterwards — by
    `override_settings` in a test, or any runtime reconfiguration — is
    silently ignored and the throttle keeps using the import-time value.
    Reading `api_settings` here keeps the configured rate authoritative.
    """

    def get_rate(self):
        return api_settings.DEFAULT_THROTTLE_RATES.get(self.scope)


class AuthRateThrottle(SettingsRateMixin, AnonRateThrottle):
    """Deliberately tight — guards credential-guessing endpoints (login,
    registration, password reset, OTP issuance) against brute force."""

    scope = "auth"


class LoginRateThrottle(SettingsRateMixin, SimpleRateThrottle):
    """Per-account counterpart to `AuthRateThrottle`.

    IP-based limits alone don't stop a distributed attempt at one account, and
    tightening the IP limit far enough to stop it would lock out everyone
    behind a shared NAT. Keying on the submitted email caps guesses per
    account no matter how many addresses they come from.
    """

    scope = "login_account"

    def get_cache_key(self, request, view):
        email = (request.data or {}).get("email") if hasattr(request, "data") else None
        if not email:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": str(email).strip().lower(),
        }


class MediaUploadRateThrottle(SettingsRateMixin, UserRateThrottle):
    """Tight — every accepted upload consumes disk that nothing reclaims."""

    scope = "media_upload"


class PublicReadRateThrottle(SettingsRateMixin, AnonRateThrottle):
    """Loose — anonymous storefront browsing. A product page can easily issue
    several requests, so the default anon rate would throttle ordinary use."""

    scope = "public_read"


class OtpRateThrottle(SettingsRateMixin, UserRateThrottle):
    """Per-user cap on OTP issuance.

    Each request sends an SMS or email to an address the caller supplies, so
    the generic `user` rate would let one account bill thousands of Twilio
    messages an hour to arbitrary numbers.
    """

    scope = "otp"


class CouponRateThrottle(SettingsRateMixin, UserRateThrottle):
    """Caps coupon-code guesses per customer, or per IP for a guest — a
    valid/invalid answer on every submission makes this brute-forceable at
    the generic `user` rate."""

    scope = "coupon"


class GuestCheckoutRateThrottle(SettingsRateMixin, AnonRateThrottle):
    """Guest checkout creates a user, an address and reserves stock per
    request — an anonymous cost the default anon rate is too loose to bound."""

    scope = "guest_checkout"


class TrackingRateThrottle(SettingsRateMixin, AnonRateThrottle):
    """Order tracking answers found/not-found per (order_number, phone)
    guess, so it needs a brute-force-guarding rate rather than the generic
    public-read one."""

    scope = "tracking"


class ProductQuestionRateThrottle(SettingsRateMixin, UserRateThrottle):
    """Every question lands in a staff moderation queue, so one account at
    the generic `user` rate could bury real questions under thousands."""

    scope = "product_question"


class PriceReportRateThrottle(SettingsRateMixin, UserRateThrottle):
    """Same reasoning as `ProductQuestionRateThrottle`: each report is staff
    work, and the open-report dedupe alone does not stop one account sweeping
    the whole catalog."""

    scope = "price_report"
