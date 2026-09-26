from __future__ import annotations

import io


def generate_qr_code(data: str) -> bytes:
    """Return PNG bytes for a QR code encoding `data`. Requires the `qrcode` package."""
    try:
        import qrcode
    except ImportError as exc:  # pragma: no cover - exercised only if qrcode missing
        raise ImportError(
            "generate_qr_code() requires qrcode. Install it with `pip install qrcode[pil]`."
        ) from exc

    image = qrcode.make(data)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
