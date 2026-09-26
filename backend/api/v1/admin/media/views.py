from __future__ import annotations

import mimetypes
import uuid
from typing import ClassVar

from django.conf import settings
from django.core.files.storage import default_storage
from drf_spectacular.utils import extend_schema
from PIL import Image, UnidentifiedImageError

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import StaffPermissionCode
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.permissions import require_any_staff_permission
from apps.common.responses import error_from_exception
from apps.common.throttling import MediaUploadRateThrottle
from apps.common.utils.files import validate_upload_size

mimetypes.add_type("image/avif", ".avif")
mimetypes.add_type("image/heic", ".heic")

# Whoever may edit a record that stores an image URL may upload one.
MediaUploadPermission = require_any_staff_permission(
    StaffPermissionCode.CATALOG_MANAGE,
    StaffPermissionCode.SETTINGS_MANAGE,
)

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


class UploadedMediaSerializer(serializers.Serializer):
    url = serializers.CharField()
    path = serializers.CharField()


@extend_schema(tags=["Media"])
class AdminMediaUploadView(APIView):
    """Stores an uploaded image and hands back the URL that catalog/profile
    records keep in their plain `url` fields."""

    permission_classes: ClassVar[list] = [MediaUploadPermission]
    throttle_classes: ClassVar[list] = [MediaUploadRateThrottle]
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser]
    serializer_class = UploadedMediaSerializer

    def post(self, request) -> Response:
        uploaded = request.FILES.get("file")
        if uploaded is None:
            return error_from_exception(
                BusinessRuleViolationError("No file uploaded.", code="missing_file")
            )

        try:
            validate_upload_size(uploaded)
        except BusinessRuleViolationError as exc:
            return error_from_exception(exc)

        try:
            image = Image.open(uploaded)
            decoded_format = image.format
            image.verify()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
            return error_from_exception(
                BusinessRuleViolationError(
                    "That file is not a readable image.", code="invalid_image"
                )
            )

        extension = EXTENSION_BY_DECODED_FORMAT.get(decoded_format or "")
        if extension is None:
            return error_from_exception(
                BusinessRuleViolationError(
                    f"Unsupported image type. Use {SUPPORTED_FORMAT_LABEL}.",
                    code="unsupported_media_type",
                )
            )
        uploaded.seek(0)

        # Random name: the original is attacker-controlled, and two admins
        # uploading "photo.jpg" must not collide.
        name = default_storage.save(f"uploads/{uuid.uuid4().hex}{extension}", uploaded)
        url = request.build_absolute_uri(f"{settings.MEDIA_URL}{name}")
        return Response(
            {"data": {"url": url, "path": f"{settings.MEDIA_URL}{name}"}, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )
