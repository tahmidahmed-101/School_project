import os
from typing import cast

# base.py has no SECRET_KEY fallback by design, so the test settings supply a
# throwaway one before importing it. Never reuse this value anywhere else.
os.environ.setdefault("SECRET_KEY", "insecure-test-only-key-not-for-any-deployment")

from .base import *  # noqa: F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# base.py points at a database cache table that `createcachetable` builds at
# deploy time; tests never run that, so keep the counters in memory.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# WhiteNoise serves the `collectstatic` output, which only the Docker image
# builds. No test serves static files, and initialising it against the missing
# STATIC_ROOT warns on every test client request.
_WHITENOISE = "whitenoise.middleware.WhiteNoiseMiddleware"
MIDDLEWARE = [m for m in MIDDLEWARE if m != _WHITENOISE]  # noqa: F405

# Throttle counters live in the cache, which outlives any single test. Left on,
# a test that logs in a few times would start failing purely because of what
# ran before it. Tests that assert throttling re-enable the rates they need
# with @override_settings (see apps/common/tests/test_throttling.py).
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_RATES": dict.fromkeys(
        cast(dict, REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"])  # noqa: F405
    ),
}
