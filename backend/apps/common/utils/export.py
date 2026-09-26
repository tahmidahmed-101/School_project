from __future__ import annotations

import csv
import io
from collections.abc import Iterable, Sequence
from typing import Any

from django.http import HttpResponse
from rest_framework.renderers import BaseRenderer, JSONRenderer

CSV_CONTENT_TYPE = "text/csv"

# Excel, LibreOffice and Sheets treat a cell opening with any of these as a
# formula, so an exported product name of `=cmd|'/c calc'!A1` runs on the
# machine of whoever opens the file. Prefixing with a quote keeps the value
# readable while forcing it to be parsed as text.
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize_cell(value: Any) -> Any:
    """Neutralise spreadsheet formula injection in an exported cell."""
    if not isinstance(value, str):
        return value
    return f"'{value}" if value.startswith(FORMULA_PREFIXES) else value


class CsvRenderer(BaseRenderer):
    """Lets DRF negotiate `Accept: text/csv` — the browser client asks for it on every
    export, and without this the request 406s before the view runs."""

    media_type = CSV_CONTENT_TYPE
    format = "csv"
    charset = None

    def render(self, data, _accepted_media_type=None, _renderer_context=None):
        # Success returns an HttpResponse and never reaches here; errors carry a dict.
        return data if isinstance(data, bytes) else JSONRenderer().render(data)


def build_csv(columns: Sequence[str], rows: Iterable[Sequence[Any]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(columns)
    writer.writerows([sanitize_cell(cell) for cell in row] for row in rows)
    return buffer.getvalue().encode("utf-8")


def csv_response(
    filename: str, columns: Sequence[str], rows: Iterable[Sequence[Any]]
) -> HttpResponse:
    response = HttpResponse(build_csv(columns, rows), content_type=CSV_CONTENT_TYPE)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
