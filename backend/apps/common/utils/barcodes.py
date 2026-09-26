from __future__ import annotations

import io


def generate_barcode(data: str, *, barcode_type: str = "code128") -> bytes:
    """Return PNG bytes for a 1D barcode encoding `data`. Requires the
    `python-barcode` package."""
    try:
        import barcode
        from barcode.writer import ImageWriter
    except ImportError as exc:  # pragma: no cover - exercised only if python-barcode missing
        raise ImportError(
            "generate_barcode() requires python-barcode. "
            "Install it with `pip install python-barcode[images]`."
        ) from exc

    writer_class = barcode.get_barcode_class(barcode_type)
    instance = writer_class(data, writer=ImageWriter())
    buffer = io.BytesIO()
    instance.write(buffer)
    return buffer.getvalue()
