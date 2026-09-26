from typing import cast

import dj_database_url
from decouple import Csv, config

from .base import *  # noqa: F403

DEBUG = False

# base.py already requires SECRET_KEY with no fallback; restated here so the
# production module is explicit about it rather than relying on the import.
SECRET_KEY = config("SECRET_KEY")

ALLOWED_HOSTS = cast(list[str], config("ALLOWED_HOSTS", default=".railway.app", cast=Csv()))

# Required, with no SQLite fallback. A container's filesystem is ephemeral, so
# falling back would silently run production on a database that is wiped on
# every deploy — and as a non-root image the write would fail with a confusing
# permission error anyway. Failing at startup names the actual problem.
DATABASES = {
    "default": cast(
        dict[str, object],
        dj_database_url.parse(
            config("DATABASE_URL"),
            conn_max_age=600,
            conn_health_checks=True,
        ),
    )
}

# Security
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
# Docker's own healthcheck hits this over plain HTTP; without the exemption
# it gets redirected to https on a port that has none, and stays "unhealthy".
SECURE_REDIRECT_EXEMPT = [r"^health/$"]
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# HSTS
SECURE_HSTS_SECONDS = config("SECURE_HSTS_SECONDS", default=31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Extra Security Headers
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"

# CSRF Trusted Origins
CSRF_TRUSTED_ORIGINS: list[str] = cast(
    list[str],
    config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv()),
)

# Logging override for production
LOGGING["handlers"]["console"]["level"] = "INFO"  # noqa: F405
LOGGING["loggers"]["django"]["level"] = "INFO"  # noqa: F405

# Static files storage
# For production, we usually use WhiteNoise or a CDN.
# Using Django's default for now, but configured for manifest-based cache busting.
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Don't throw ValueError if a referenced static file is missing in the manifest
WHITENOISE_MANIFEST_STRICT = False

