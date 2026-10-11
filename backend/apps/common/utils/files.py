import uuid
from pathlib import Path

from django.conf import settings
from PIL import Image, UnidentifiedImageError

from apps.common.exceptions import BusinessRuleViolationError

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

# Keyed on the decoded format, never the filename or Content-Type: both are
# caller-supplied, and matching them rejected ".jfif" and extensionless uploads.
EXTENSION_BY_DECODED_FORMAT = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
    "GIF": ".gif",
    "AVIF": ".avif",
    "HEIF": ".heic",
    "MPO": ".jpg",
}

SUPPORTED_FORMAT_LABEL = "JPG, PNG, WEBP, GIF, AVIF or HEIC"


def unique_upload_path(instance, filename: str, subdir: str = "uploads") -> str:
    ext = Path(filename).suffix.lower()
    return f"{subdir.strip('/')}/{uuid.uuid4().hex}{ext}"


def validate_upload_size(uploaded_file, *, max_bytes: int | None = None) -> None:
    """Reject an upload larger than the configured ceiling.

    Django streams large uploads to a temp file rather than refusing them, so
    without an explicit check the catalog import would accept an arbitrarily
    large CSV/XLSX and then parse it into memory.
    """
    limit = max_bytes if max_bytes is not None else getattr(settings, "MAX_UPLOAD_SIZE", None)
    if limit is None:
        return
    size = getattr(uploaded_file, "size", None)
    if size is not None and size > limit:
        raise BusinessRuleViolationError(
            f"File is too large ({human_readable_size(size)}). "
            f"The maximum is {human_readable_size(limit)}.",
            code="file_too_large",
        )


def validate_image_upload(uploaded_file) -> str:
    """Check the size and the decoded bytes of an uploaded image, and return the
    extension its real format should be stored under. SVG never decodes, so it
    is rejected along with every other non-image."""
    validate_upload_size(uploaded_file)
    try:
        image = Image.open(uploaded_file)
        decoded_format = image.format
        image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        raise BusinessRuleViolationError(
            "That file is not a readable image.", code="invalid_image"
        ) from None
    extension = EXTENSION_BY_DECODED_FORMAT.get(decoded_format or "")
    if extension is None:
        raise BusinessRuleViolationError(
            f"Unsupported image type. Use {SUPPORTED_FORMAT_LABEL}.",
            code="unsupported_media_type",
        )
    uploaded_file.seek(0)
    return extension


def human_readable_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.0f}{unit}" if unit == "B" else f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}TB"
