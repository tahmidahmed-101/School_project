from __future__ import annotations

from rest_framework import serializers

from api.v1.admin.catalog.fields import VariantTitleField


class SalesTrendPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    total = serializers.DecimalField(max_digits=14, decimal_places=2)


class LowStockItemSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    variant_id = serializers.UUIDField(read_only=True)
    variant_sku = serializers.CharField(source="variant.sku", read_only=True)
    variant_title = VariantTitleField()
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    product_code = serializers.CharField(source="variant.product.product_code", read_only=True)
    quantity_on_hand = serializers.IntegerField()
    quantity_reserved = serializers.IntegerField()
    available = serializers.IntegerField()
    reorder_point = serializers.IntegerField()


MEASURE_UNITS = ["currency", "count", "ratio"]
TREND_DIRECTIONS = ["up", "down", "flat"]


class DashboardKpiSerializer(serializers.Serializer):
    label = serializers.CharField()
    value = serializers.FloatField()
    unit = serializers.ChoiceField(choices=MEASURE_UNITS)
    delta_pct = serializers.FloatField(allow_null=True)
    sign = serializers.ChoiceField(choices=TREND_DIRECTIONS)
    good = serializers.BooleanField()
    spark = serializers.ListField(child=serializers.FloatField())


class RevenuePointSerializer(serializers.Serializer):
    label = serializers.CharField()
    current = serializers.FloatField()
    previous = serializers.FloatField()


class CategoryShareSerializer(serializers.Serializer):
    name = serializers.CharField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    pct = serializers.FloatField()


class DashboardOrderLineSerializer(serializers.Serializer):
    name = serializers.CharField()
    sku = serializers.CharField()
    quantity = serializers.IntegerField()


class DashboardOrderCustomerSerializer(serializers.Serializer):
    name = serializers.CharField()


class DashboardOrderSerializer(serializers.Serializer):
    id = serializers.CharField()
    order_id = serializers.UUIDField()
    customer = DashboardOrderCustomerSerializer()
    items = DashboardOrderLineSerializer(many=True)
    total_amount = serializers.CharField()
    payment_method = serializers.CharField()
    status = serializers.CharField()
    region = serializers.CharField()
    created_at = serializers.DateTimeField()


class TopProductSerializer(serializers.Serializer):
    rank = serializers.IntegerField()
    sku = serializers.CharField()
    name = serializers.CharField()
    units = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    stock = serializers.IntegerField()
    spark = serializers.ListField(child=serializers.FloatField())


class InventoryAlertSerializer(serializers.Serializer):
    sku = serializers.CharField()
    name = serializers.CharField()
    stock = serializers.IntegerField()
    reorder = serializers.IntegerField()
    level = serializers.ChoiceField(choices=["low", "critical"])


class LowStockCountsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    critical = serializers.IntegerField()


class CustomerSegmentSerializer(serializers.Serializer):
    name = serializers.CharField()
    count = serializers.IntegerField()
    pct = serializers.FloatField()
    color = serializers.CharField()


class FulfillmentMetricSerializer(serializers.Serializer):
    label = serializers.CharField()
    value = serializers.IntegerField()
    delta_pct = serializers.FloatField(allow_null=True)
    good = serializers.BooleanField()


class TickerItemSerializer(serializers.Serializer):
    label = serializers.CharField()
    value = serializers.FloatField()
    unit = serializers.ChoiceField(choices=MEASURE_UNITS)
    dir = serializers.ChoiceField(choices=TREND_DIRECTIONS)


class DashboardSerializer(serializers.Serializer):
    kpis = DashboardKpiSerializer(many=True)
    revenue = RevenuePointSerializer(many=True)
    categories = CategoryShareSerializer(many=True)
    orders = DashboardOrderSerializer(many=True)
    top_products = TopProductSerializer(many=True)
    inventory = InventoryAlertSerializer(many=True)
    low_stock = LowStockCountsSerializer()
    segments = CustomerSegmentSerializer(many=True)
    fulfillment = FulfillmentMetricSerializer(many=True)
    ticker = TickerItemSerializer(many=True)
