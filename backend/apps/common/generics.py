from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from django.apps import apps
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.db.models import Q, QuerySet
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import DomainError
from apps.common.pagination import DefaultPageNumberPagination
from apps.common.params import get_bool, get_search
from apps.common.responses import error_from_exception, error_response, not_found
from apps.common.services.soft_delete import restore_instance


def apply_ordering(
    queryset: QuerySet,
    request,
    *,
    ordering_fields: Iterable[str] = (),
    default_ordering: str | None = None,
) -> QuerySet:
    ordering = request.query_params.get("ordering")
    if ordering and ordering.lstrip("-") in ordering_fields:
        return queryset.order_by(ordering)
    if default_ordering:
        return queryset.order_by(default_ordering)
    return queryset


def filter_search(
    queryset: QuerySet,
    request,
    search_fields: Iterable[str] = (),
    *,
    product_code_field: str | None = None,
) -> QuerySet:
    """`?search=` as a case-insensitive substring match on `search_fields`.

    On a list of product rows (or rows that point at a product), name the path to
    the product code in `product_code_field`: a search that is exactly some
    product's code then lists that product's rows only. A substring match would
    also pull in other products whose SKU or name happens to hold the same digits,
    and a product with no rows here gives an empty list rather than someone else's.
    """
    search = get_search(request.query_params)
    if not search:
        return queryset
    if product_code_field:
        code = search.strip()
        Product = apps.get_model("catalog", "Product")
        if Product.objects.filter(product_code=code).exists():
            return queryset.filter(**{product_code_field: code}).distinct()
    if not search_fields:
        return queryset
    query = Q()
    for field in search_fields:
        query |= Q(**{f"{field}__icontains": search})
    return queryset.filter(query)


def list_response(
    request,
    queryset: QuerySet,
    serializer_class: type,
    *,
    pagination_class: type = DefaultPageNumberPagination,
    view=None,
    serializer_kwargs: dict | None = None,
    context_fn: Callable[[list], dict] | None = None,
) -> Response:
    """Paginate `queryset` into the standard `{"data": {results, count, next, previous}}`.

    `context_fn` receives the page's objects and returns serializer context —
    the hook for batching per-row lookups (stock levels, counts) into one
    query instead of one per serialized row.
    """
    paginator = pagination_class()
    page = paginator.paginate_queryset(queryset, request, view=view)
    items = page if page is not None else list(queryset)
    # paginate_queryset has already run the COUNT; asking the queryset for it
    # again doubles the query count of every list endpoint in the project.
    total_count = paginator.page.paginator.count if page is not None else len(items)

    kwargs = dict(serializer_kwargs or {})
    if "context" not in kwargs:
        context = {"request": request}
        if context_fn is not None:
            context.update(context_fn(list(items)) or {})
        kwargs["context"] = context
    serializer = serializer_class(items, many=True, **kwargs)

    return Response(
        {
            "data": {
                "results": serializer.data,
                "count": total_count,
                "next": paginator.get_next_link() if page is not None else None,
                "previous": paginator.get_previous_link() if page is not None else None,
            },
            "message": "Success",
        }
    )


class GenericListAPIView(APIView):
    """Reusable list endpoint: search + ordering + pagination with minimal code.

    Subclasses set `serializer_class` and `queryset_fn` (usually a selector
    function) plus optional `search_fields`/`ordering_fields`, then call
    `self.list_response(request)` from `get()`. See
    `docs/creating-a-crud-module.md` for a worked example.
    """

    serializer_class: type | None = None
    queryset_fn: Callable[[], QuerySet] | None = None
    search_fields: Iterable[str] = ()
    # Path to the product code on a list of product rows; see `filter_search`.
    product_code_field: str | None = None
    ordering_fields: Iterable[str] = ()
    default_ordering: str | None = None
    pagination_class = DefaultPageNumberPagination

    def get_queryset(self) -> QuerySet:
        if self.queryset_fn is None:
            raise ImproperlyConfigured("Set queryset_fn on the view.")
        return self.queryset_fn()

    def filter_search(self, queryset: QuerySet, request) -> QuerySet:
        return filter_search(
            queryset, request, self.search_fields, product_code_field=self.product_code_field
        )

    def apply_ordering(self, queryset: QuerySet, request) -> QuerySet:
        return apply_ordering(
            queryset,
            request,
            ordering_fields=self.ordering_fields,
            default_ordering=self.default_ordering,
        )

    def get_filtered_queryset(self, request) -> QuerySet:
        queryset = self.get_queryset()
        queryset = self.filter_deleted_only(queryset, request)
        queryset = self.filter_search(queryset, request)
        return self.apply_ordering(queryset, request)

    def filter_deleted_only(self, queryset: QuerySet, request) -> QuerySet:
        """`?deleted_only=true` narrows a soft-delete list to its deleted rows (the
        dashboard's restore lists). It only ever narrows: whether deleted rows are
        in the queryset at all is still decided by the view's `include_deleted`
        handling and its permission, so on its own it returns nothing."""
        if not get_bool(request.query_params, "deleted_only", default=False):
            return queryset
        if not any(field.name == "deleted_at" for field in queryset.model._meta.get_fields()):
            return queryset
        return queryset.filter(deleted_at__isnull=False)

    def get_serializer_context(self, items: list) -> dict:
        """Override to batch per-row lookups for the page being serialized."""
        return {}

    def list_response(self, request) -> Response:
        return list_response(
            request,
            self.get_filtered_queryset(request),
            self.serializer_class,  # type: ignore[arg-type]
            pagination_class=self.pagination_class,
            view=self,
            context_fn=self.get_serializer_context,
        )


class IncludeDeletedMixin:
    """Adds `?include_deleted=true` to an admin list endpoint.

    Deleted rows are invisible to a view-only role by design, so requesting
    them escalates the endpoint to the module's manage permission rather than
    widening the base one.
    """

    include_deleted_permission: type | None = None
    # Supplied by the APIView this mixin is always combined with.
    request: Any

    def include_deleted(self) -> bool:
        return bool(get_bool(self.request.query_params, "include_deleted", default=False))

    def get_permissions(self):
        permissions = super().get_permissions()
        if self.include_deleted_permission is None:
            return permissions
        try:
            requested = self.include_deleted()
        except ValidationError:
            # Let the malformed value surface as a 400 from get_queryset instead.
            return permissions
        if requested:
            return [*permissions, self.include_deleted_permission()]
        return permissions


class RestoreAPIView(APIView):
    """`POST <resource>/<id>/restore/` for any soft-delete model.

    Subclasses set `get_object_fn` (a selector accepting `include_deleted=True`),
    `serializer_class` and the not-found code/message. Set `restore_fn` when
    restoring must also bring back records that were deleted along with it.
    """

    get_object_fn: Callable[..., Any] | None = None
    restore_fn: Callable[..., Any] | None = None
    serializer_class: type | None = None
    not_found_code = "not_found"
    not_found_message = "Not found."

    def post(self, request, **kwargs) -> Response:
        get_object_fn = type(self).get_object_fn
        if get_object_fn is None:
            raise ImproperlyConfigured("Set get_object_fn on the view.")
        object_id = next(iter(kwargs.values()))
        instance = get_object_fn(object_id, include_deleted=True)
        if instance is None:
            return not_found(self.not_found_code, self.not_found_message)
        try:
            (type(self).restore_fn or restore_instance)(instance)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {
                "data": self.serializer_class(  # type: ignore[misc]
                    instance, context={"request": request}
                ).data,
                "message": "Success",
            }
        )


MAX_BULK_IDS = 500


class BulkActionMixin:
    """Adds a generic `{"ids": [...]}` bulk-action handler to any APIView.

    Call `self.bulk_action(request, queryset_fn=..., action_fn=..., update_fields=[...])`
    from a `post`/`delete` method. `action_fn(obj)` mutates the object in
    memory and the whole batch is written with a single `bulk_update`. Omit
    `update_fields` only when `action_fn` must do its own write (a service
    call with side effects beyond the row itself).
    """

    def bulk_action(
        self,
        request,
        *,
        queryset_fn: Callable[[], QuerySet],
        action_fn: Callable[[Any], None],
        update_fields: Iterable[str] | None = None,
        batch_size: int = 500,
    ) -> Response:
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not ids:
            return error_response("invalid_ids", "Provide a non-empty list of ids.")
        # DATA_UPLOAD_MAX_NUMBER_FIELDS does not apply to a JSON body, so
        # without this a single request can load an unbounded result set into
        # memory and hold a transaction open around it.
        if len(ids) > MAX_BULK_IDS:
            return error_response(
                "too_many_ids", f"Provide at most {MAX_BULK_IDS} ids per request."
            )

        # All-or-nothing: a service-backed action that rejects the 3rd of 5 targets
        # must not leave the first two applied.
        with transaction.atomic():
            objects = list(queryset_fn().filter(id__in=ids))
            for obj in objects:
                action_fn(obj)
            if update_fields is not None and objects:
                type(objects[0]).objects.bulk_update(
                    objects, list(update_fields), batch_size=batch_size
                )
        return Response({"data": {"affected": len(objects)}, "message": "Success"})
