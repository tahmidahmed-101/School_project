from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError

from apps.accounts.models import User
from apps.accounts.tests.helpers import create_user as make_user
from apps.common.utils.barcodes import generate_barcode
from apps.common.utils.codes import generate_numeric_code, hash_code
from apps.common.utils.files import human_readable_size
from apps.common.utils.qr_codes import generate_qr_code
from apps.common.utils.text import generate_slug, unique_slug_for
from apps.common.utils.validators import validate_phone_number

pytestmark = pytest.mark.django_db


def test_generate_numeric_code_is_zero_padded_and_in_range():
    code = generate_numeric_code(6)

    assert len(code) == 6
    assert code.isdigit()


def test_hash_code_is_deterministic_sha256():
    assert hash_code("123456") == hash_code("123456")
    assert hash_code("123456") != hash_code("654321")


def test_generate_slug():
    assert generate_slug("Hello World!") == "hello-world"


def test_unique_slug_for_appends_suffix_on_collision():
    user = make_user(email="taken@example.com")
    user.username = "taken-slug"
    user.save(update_fields=["username"])

    slug = unique_slug_for(model=User, text="Taken Slug", field="username")

    assert slug == "taken-slug-2"

    fresh_slug = unique_slug_for(model=User, text="brand-new-user", field="username")
    assert fresh_slug == "brand-new-user"


def test_validate_phone_number_accepts_e164_and_rejects_garbage():
    validate_phone_number("+15551234567")

    with pytest.raises(ValidationError):
        validate_phone_number("not-a-phone")


def test_human_readable_size():
    assert human_readable_size(500) == "500B"
    assert human_readable_size(2048) == "2.0KB"


def test_generate_qr_code_returns_png_bytes():
    data = generate_qr_code("https://example.com")

    assert data[:8] == b"\x89PNG\r\n\x1a\n"


def test_generate_barcode_returns_png_bytes():
    data = generate_barcode("123456789012")

    assert data[:8] == b"\x89PNG\r\n\x1a\n"
