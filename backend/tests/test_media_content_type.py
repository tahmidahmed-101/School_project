import pytest


@pytest.mark.parametrize(("name", "expected"), [("a.webp", "image/webp"), ("a.avif", "image/avif")])
def test_media_serves_modern_image_types(client, settings, tmp_path, name, expected):
    settings.MEDIA_ROOT = tmp_path
    (tmp_path / name).write_bytes(b"x")
    assert client.get(f"/media/{name}")["Content-Type"] == expected
