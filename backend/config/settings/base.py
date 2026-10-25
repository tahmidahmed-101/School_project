from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from typing import Any, cast

from corsheaders.defaults import default_headers
from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent.parent
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)


def env_bool(name: str, *, default: bool = False) -> bool:
    value = str(config(name, default=str(default))).strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off", "release", "production"}:
        return False
    return default


# No default: a committed fallback key is a signing key an attacker can read
# straight out of the repository. Local and CI environments supply their own
# via .env / environment (see .env.example); `config.settings.test` sets a
# throwaway one. Generate with:
#   python -c "from django.core.management.utils import get_random_secret_key as k; print(k())"
SECRET_KEY = config("SECRET_KEY")
DEBUG = env_bool("DEBUG", default=False)
ALLOWED_HOSTS: list[str] = cast(
    list[str],
    config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv()),
)

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
]

LOCAL_APPS = [
    "apps.common",
    "apps.audit",
    "apps.accounts",
    "apps.catalog",
    "apps.inventory",
    "apps.procurement",
    "apps.orders",
    "apps.logistics",
    "apps.accounting",
    "apps.reporting",
    "apps.business",
    "apps.marketing",
    "apps.risk",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "apps.common.middleware.PutToPatchMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.audit.middleware.RequestMetadataMiddleware",
    "apps.business.middleware.ModuleEnabledMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "apps.reporting.context_processors.admin_dashboard_stats",
            ],
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Admin-uploaded images (product photos, logos, avatars). Kept on disk and served
# under MEDIA_URL; in production this path must be a persistent volume or every
# deploy drops the uploads.
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(config("MEDIA_ROOT", default=str(BASE_DIR / "media")))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGGING: dict[str, Any] = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
        "simple": {
            "format": "{levelname} {message}",
            "style": "{",
        },
    },
    "filters": {
        "require_debug_true": {
            "()": "django.utils.log.RequireDebugTrue",
        },
        "require_debug_false": {
            "()": "django.utils.log.RequireDebugFalse",
        },
    },
    "handlers": {
        "console": {
            "level": "INFO",
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        "debug_console": {
            "level": "DEBUG",
            "filters": ["require_debug_true"],
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
        "app_file": {
            "level": "INFO",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOGS_DIR / "app.log",
            "maxBytes": 5 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "verbose",
        },
        "security_file": {
            "level": "WARNING",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOGS_DIR / "security.log",
            "maxBytes": 5 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "verbose",
        },
        "audit_file": {
            "level": "INFO",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOGS_DIR / "audit.log",
            "maxBytes": 5 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "verbose",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": True,
        },
        "django.request": {
            "handlers": ["console", "app_file"],
            "level": "ERROR",
            "propagate": False,
        },
        "apps": {
            "handlers": ["console", "debug_console", "app_file"],
            "level": "DEBUG" if DEBUG else "INFO",
            "propagate": False,
        },
        # Authentication failures, permission denials, and other
        # security-relevant events. Use `logging.getLogger("security")`.
        "security": {
            "handlers": ["console", "security_file"],
            "level": "WARNING",
            "propagate": False,
        },
        # CRUD/admin actions and login history. Use `logging.getLogger("audit")`.
        "audit": {
            "handlers": ["console", "audit_file"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "DEFAULT_SCHEMA_CLASS": "apps.common.schema.ViewNamedAutoSchema",
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.DefaultPageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Fallbacks. An authenticated session is attributable and revocable, so
        # it earns more headroom than an anonymous one — but not the old 100x.
        "anon": "300/hour",
        "user": "2000/hour",
        # Credential-guessing endpoints, per IP (apps.common.throttling).
        "auth": "20/min",
        # ...and per submitted account, so a distributed attack on one login
        # is capped even when every attempt comes from a different address.
        "login_account": "10/min",
        # Anonymous storefront reads. A single product page issues several
        # requests, so the default anon rate would throttle normal browsing.
        "public_read": "1000/hour",
        # Image uploads. Nothing reaps orphaned files, so the generous "user"
        # rate would let one token fill the disk the database also lives on.
        "media_upload": "120/hour",
        # Coupon endpoints answer valid/invalid per guess, so the default user
        # rate would allow code guessing at 6000/hour.
        "coupon": "20/min",
        # The dashboard's "send a test email": each one opens an SMTP session
        # to a server staff typed in, so it is kept to a handful.
        "email_test": "5/hour",
        # OTP issuance costs real money per send (Twilio) and reaches a phone
        # the caller supplies, so it is capped far below the generic user rate.
        "otp": "5/hour",
        # Guest checkout creates a user, an address and reserves stock per
        # request — an anonymous cost the default anon rate (300/hour) is too
        # loose to bound.
        "guest_checkout": "20/hour",
        # Order tracking answers found/not-found per (order_number, phone)
        # guess, so it needs the same brute-force-guarding treatment as login.
        "tracking": "30/hour",
        # Product questions and price-issue reports each create a row staff
        # must triage, so they are capped per customer well below `user`.
        "product_question": "10/hour",
        "price_report": "10/hour",
    },
    "EXCEPTION_HANDLER": "apps.common.exception_handler.custom_exception_handler",
    # nginx appends to any client-supplied X-Forwarded-For, so without this DRF
    # keys throttles on the first entry — a value the caller chooses freely.
    "NUM_PROXIES": config("NUM_PROXIES", default=1, cast=int),
}

# Same count, read by apps.audit.middleware when resolving the client address.
TRUSTED_PROXY_COUNT: int = cast(int, REST_FRAMEWORK["NUM_PROXIES"])

# Shared, not per-process: gunicorn runs several workers, and the default
# LocMemCache would divide every throttle rate by that worker count.
CACHES = {
    "default": (
        {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": config("REDIS_URL", default=""),
        }
        if config("REDIS_URL", default="")
        else {
            "BACKEND": "django.core.cache.backends.db.DatabaseCache",
            "LOCATION": "django_cache",
        }
    )
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

# Refresh token lifetime granted when a customer logs in with "remember_me": true
REMEMBER_ME_REFRESH_TOKEN_LIFETIME = timedelta(days=30)

# The refresh token lives in an HttpOnly cookie rather than the response body
# or localStorage, so an XSS payload elsewhere in the app can't read it.
REFRESH_COOKIE_NAME = "vtc_refresh"
REFRESH_COOKIE_SAMESITE = "Lax"

# The storefront and the admin dashboard log in through the same endpoint but
# keep separate sessions: each sends `X-Auth-Client` and gets its own refresh
# cookie. With a single cookie, the two apps shared one session slot whenever
# they were served from the same host (cookies ignore the port), so signing in,
# refreshing or signing out in one replaced or ended the session of the other.
# A request without the header is treated as the storefront.
AUTH_CLIENT_HEADER = "X-Auth-Client"
AUTH_CLIENT_STOREFRONT = "storefront"
AUTH_CLIENT_DASHBOARD = "dashboard"
REFRESH_COOKIE_NAMES = {
    AUTH_CLIENT_STOREFRONT: REFRESH_COOKIE_NAME,
    AUTH_CLIENT_DASHBOARD: "vtc_refresh_admin",
}

CORS_ALLOW_CREDENTIALS = True
# A dashboard served from another origin sends X-Auth-Client on every request.
CORS_ALLOW_HEADERS = (*default_headers, "x-auth-client")

SPECTACULAR_SETTINGS = {
    "TITLE": "Django Foundation API",
    "DESCRIPTION": "Reusable authentication + CRUD foundation for future projects.",
    "VERSION": "1.0.0",
    # drf-spectacular serves the schema to anyone by default, which publishes a
    # complete map of every endpoint, parameter and field name — a free
    # reconnaissance document for anyone probing the deployment. Require a
    # login; `config.settings.local` opens it back up for development.
    "SERVE_PERMISSIONS": ["rest_framework.permissions.IsAuthenticated"],
    # The several `status` fields would otherwise collide into hash-suffixed
    # component names (`StatusB2fEnum`) in generated clients.
    "ENUM_NAME_OVERRIDES": {
        "SalesOrderStatusEnum": [
            ("pending", "Pending"),
            ("awaiting_payment", "Awaiting payment"),
            ("confirmed", "Confirmed"),
            ("shipped", "Shipped"),
            ("delivered", "Delivered"),
            ("cancelled", "Cancelled"),
            ("closed", "Closed"),
        ],
        "ReturnRMAStatusEnum": [
            ("requested", "Requested"),
            ("approved", "Approved"),
            ("rejected", "Rejected"),
            ("received", "Received"),
            ("closed", "Closed"),
        ],
    },
}

# Cap request bodies. Django's defaults leave the total size of an uploaded
# file unbounded, so the CSV/XLSX catalog import would happily stream a
# multi-gigabyte upload to disk and then parse it into memory.
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # 5 MB of non-file form data
DATA_UPLOAD_MAX_NUMBER_FIELDS = 1000
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB per uploaded file (enforced in code)

STOCK_RESERVATION_TTL_HOURS: int = config("STOCK_RESERVATION_TTL_HOURS", default=24, cast=int)

# Mirrors the storefront's src/data/business.ts; blank values are dropped, not printed.
BUSINESS_IDENTITY: dict[str, str] = {
    "name": config("BUSINESS_NAME", default="Kull Mart"),
    "legal_name": config("BUSINESS_LEGAL_NAME", default="Kull Mart"),
    "address": config("BUSINESS_ADDRESS", default="123 Demo Street, Demo City"),
    "phone": config("BUSINESS_PHONE", default="+1 (555) 000-0000"),
    "email": config("BUSINESS_EMAIL", default="admin@example.com"),
    "website": config("BUSINESS_WEBSITE", default="example.com"),
    "tax_id": config("BUSINESS_TAX_ID", default=""),
}

CURRENCY_SYMBOL: str = config("CURRENCY_SYMBOL", default="৳")

CORS_ALLOWED_ORIGINS: list[str] = cast(
    list[str],
    config("CORS_ALLOWED_ORIGINS", default="", cast=Csv()),
)

# Email configuration
EMAIL_BACKEND = config("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="noreply@example.com")
# Used when EMAIL_BACKEND is django.core.mail.backends.smtp.EmailBackend and no
# SMTP server is saved from the dashboard (see backend/docs/email.md). The
# defaults are Django's own, so an installation that never sets them behaves
# exactly as before.
EMAIL_HOST: str = config("EMAIL_HOST", default="localhost")
EMAIL_PORT: int = config("EMAIL_PORT", default=25, cast=int)
EMAIL_HOST_USER: str = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD: str = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS: bool = config("EMAIL_USE_TLS", default=False, cast=bool)
EMAIL_USE_SSL: bool = config("EMAIL_USE_SSL", default=False, cast=bool)
# Seconds. Email is sent inside the request, so a stalled SMTP server must not
# hold a worker indefinitely (Django's own default is no timeout at all).
EMAIL_TIMEOUT: int = config("EMAIL_TIMEOUT", default=10, cast=int)

# Newsletter campaigns (backend/docs/email-campaigns.md).
# Where this API is reached from the internet, e.g. https://api.example.com. The
# unsubscribe link in every campaign email points here, so a campaign cannot be
# sent without it (or without NEWSLETTER_UNSUBSCRIBE_URL).
PUBLIC_API_BASE_URL: str = config("PUBLIC_API_BASE_URL", default="").rstrip("/")
# Optional: a storefront page to send unsubscribe links to instead, with
# "{token}" where the token goes. That page must POST the token to
# /api/v1/public/marketing/unsubscribe/<token>/.
NEWSLETTER_UNSUBSCRIBE_URL: str = config("NEWSLETTER_UNSUBSCRIBE_URL", default="")
# Messages per `send_campaigns` run, across all campaigns. Keeps one run short
# and stays under the mail provider's hourly limits.
CAMPAIGN_BATCH_SIZE: int = config("CAMPAIGN_BATCH_SIZE", default=200, cast=int)
# Same, for SMS campaigns: each message is one paid provider call.
SMS_CAMPAIGN_BATCH_SIZE: int = config("SMS_CAMPAIGN_BATCH_SIZE", default=100, cast=int)

# Abandoned-cart SMS (backend/docs/sms-and-recovery.md). Off until staff turn
# it on in business settings.
STOREFRONT_BASE_URL: str = config("STOREFRONT_BASE_URL", default="").rstrip("/")
CART_RECOVERY_IDLE_HOURS: int = config("CART_RECOVERY_IDLE_HOURS", default=2, cast=int)
CART_RECOVERY_MAX_AGE_HOURS: int = config("CART_RECOVERY_MAX_AGE_HOURS", default=48, cast=int)
CART_RECOVERY_DAILY_CAP: int = config("CART_RECOVERY_DAILY_CAP", default=50, cast=int)

# Twilio configuration (SMS OTP and SMS campaigns)
TWILIO_ACCOUNT_SID: str = config("TWILIO_ACCOUNT_SID", default="")
TWILIO_AUTH_TOKEN: str = config("TWILIO_AUTH_TOKEN", default="")
TWILIO_PHONE_NUMBER: str = config("TWILIO_PHONE_NUMBER", default="")

# Telegram staff bot (order alerts and commands). Off while the token is blank.
TELEGRAM_BOT_TOKEN: str = config("TELEGRAM_BOT_TOKEN", default="")
# Telegram sends this back in a header on every webhook call; a request
# without it is refused. Any long random string.
TELEGRAM_WEBHOOK_SECRET: str = config("TELEGRAM_WEBHOOK_SECRET", default="")

# Encrypts credentials staff save through the dashboard (today: the conversion
# tracking secrets below). One or more Fernet keys, comma-separated: the first
# encrypts, every one decrypts, so a key can be rotated by putting the new one
# first. Generate one with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Without it nothing secret can be saved from the dashboard, and secrets saved
# earlier cannot be read (their provider then stops sending).
SECRETS_ENCRYPTION_KEYS: list[str] = config("SECRETS_ENCRYPTION_KEYS", default="", cast=Csv())

# Server-side Purchase conversions (apps.marketing.services.conversions). Each
# provider is off until both of its values are set. Server-only: never put
# these in the storefront's NEXT_PUBLIC_* settings. Settings saved in the
# dashboard take precedence over these; see backend/docs/conversion-tracking.md.
# GA4 Measurement Protocol: Admin > Data streams > (web stream) > Measurement
# Protocol API secrets.
GA4_MEASUREMENT_ID: str = config("GA4_MEASUREMENT_ID", default="")
GA4_API_SECRET: str = config("GA4_API_SECRET", default="")
# Meta Conversions API: Events Manager > (pixel) > Settings > Generate access token.
META_PIXEL_ID: str = config("META_PIXEL_ID", default="")
META_CAPI_ACCESS_TOKEN: str = config("META_CAPI_ACCESS_TOKEN", default="")
META_GRAPH_API_VERSION: str = config("META_GRAPH_API_VERSION", default="v21.0")
# Events Manager > Test events code; routes events to the test view only.
META_TEST_EVENT_CODE: str = config("META_TEST_EVENT_CODE", default="")
TIKTOK_PIXEL_ID: str = config("TIKTOK_PIXEL_ID", default="")
TIKTOK_EVENTS_ACCESS_TOKEN: str = config("TIKTOK_EVENTS_ACCESS_TOKEN", default="")
TIKTOK_TEST_EVENT_CODE: str = config("TIKTOK_TEST_EVENT_CODE", default="")

# Modern Storages (Django 4.2+)
STORAGES: dict[str, Any] = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}
