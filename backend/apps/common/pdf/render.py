from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from django.conf import settings
from django.http import HttpResponse
from django.template.loader import render_to_string
from rest_framework.renderers import BaseRenderer, JSONRenderer

logger = logging.getLogger(__name__)

FONT_DIR = Path(__file__).resolve().parent / "fonts"

PDF_CONTENT_TYPE = "application/pdf"


class PdfRenderer(BaseRenderer):
    """Lets DRF negotiate `Accept: application/pdf` — without it the request 406s
    before the view runs, since no default renderer advertises PDF."""

    media_type = PDF_CONTENT_TYPE
    format = "pdf"
    charset = None

    def render(self, data, _accepted_media_type=None, _renderer_context=None):
        # Success returns an HttpResponse and never reaches here; errors carry a dict.
        return data if isinstance(data, bytes) else JSONRenderer().render(data)


def business_identity() -> dict[str, str]:
    """Saved profile first, `settings.BUSINESS_IDENTITY` per blank field. Empty
    values are dropped so the templates keep omitting the line entirely."""
    from apps.business.selectors import get_business_profile

    profile = get_business_profile()
    saved = {
        "name": profile.name,
        "legal_name": profile.legal_name,
        "address": profile.formatted_address,
        "phone": profile.phone,
        "email": profile.email,
        "website": profile.website,
        "tax_id": profile.tax_id,
    }
    merged = {**settings.BUSINESS_IDENTITY, **{k: v for k, v in saved.items() if v}}
    return {key: value for key, value in merged.items() if value}


def render_pdf(template_name: str, context: dict[str, Any]) -> bytes:
    from apps.business.selectors import get_currency_symbol

    biz = business_identity()
    curr = get_currency_symbol()

    try:
        from weasyprint import HTML

        html = render_to_string(
            template_name,
            {
                "business": biz,
                "currency": curr,
                "font_dir": FONT_DIR.as_uri(),
                **context,
            },
        )
        return HTML(string=html, base_url=str(FONT_DIR)).write_pdf()
    except (ImportError, OSError) as exc:
        logger.warning("WeasyPrint unavailable (%s), falling back to FPDF2 renderer", exc)
        from .fpdf_renderer import render_fpdf_document

        return render_fpdf_document(context, business=biz, currency=curr)


def pdf_response(*, filename: str, template_name: str, context: dict[str, Any]) -> HttpResponse:
    response = HttpResponse(render_pdf(template_name, context), content_type=PDF_CONTENT_TYPE)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
