from __future__ import annotations

import re

from drf_spectacular.openapi import AutoSchema

_CAMEL_BOUNDARY = re.compile(r"(?<!^)(?=[A-Z])")


class ViewNamedAutoSchema(AutoSchema):
    """Derive `operationId` from the view class rather than the URL path.

    Every endpoint here is a hand-rolled `APIView`, so drf-spectacular cannot
    tell a list view from a detail view and names both after the path — giving
    two `..._retrieve` ids on `/products/` and `/products/{slug}/`, which it
    then disambiguates with numeral suffixes. Generated clients end up with
    `products_retrieve` and `products_retrieve_2`. The view class name is
    already unique and meaningful, so use it.
    """

    def get_operation_id(self) -> str:
        name = self.view.__class__.__name__.removesuffix("View")
        base = _CAMEL_BOUNDARY.sub("_", name).lower()
        # One generic class can be mounted at several action paths
        # (approve/reject/receive), so fold in the trailing static segment.
        tail = self._path_suffix()
        if tail and tail not in base:
            base = f"{base}_{tail}"
        method = self.method.lower()
        return base if method == "get" else f"{base}_{method}"

    def _path_suffix(self) -> str:
        segments = [s for s in self.path.strip("/").split("/") if s and not s.startswith("{")]
        return segments[-1].replace("-", "_") if segments else ""
