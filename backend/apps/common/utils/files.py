import uuid
from pathlib import Path

from django.conf import settings

from apps.common.exceptions import BusinessRuleViolationError


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


def human_readable_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.0f}{unit}" if unit == "B" else f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}TB"
