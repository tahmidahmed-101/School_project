from __future__ import annotations

from rest_framework import serializers

from apps.orders.models import SalesOrder, Shipment


class PublicTrackOrderItemSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_name = serializers.CharField()
    variant_sku = serializers.CharField()
    quantity = serializers.IntegerField()
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)


class PublicTrackShipmentSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    carrier_name = serializers.CharField(source="carrier.name", read_only=True, allow_null=True)
    tracking_number = serializers.CharField(read_only=True)
    status = serializers.ChoiceField(choices=Shipment.Status.choices, read_only=True)
    shipped_at = serializers.DateTimeField(read_only=True, allow_null=True)
    delivered_at = serializers.DateTimeField(read_only=True, allow_null=True)


class PublicTrackOrderSerializer(serializers.Serializer):
    order_number = serializers.CharField(read_only=True)
    status = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(read_only=True)
    items = serializers.SerializerMethodField()
    shipments = serializers.SerializerMethodField()
    delivery_info = serializers.SerializerMethodField()
    tracking_timeline = serializers.SerializerMethodField()
    preorder_stage = serializers.CharField(read_only=True)
    preorder_timeline = serializers.SerializerMethodField()

    def get_status(self, obj) -> str:
        if obj.status == SalesOrder.Status.PENDING:
            return "Placed"
        if obj.status == SalesOrder.Status.AWAITING_PAYMENT:
            return "Placed"
        if obj.status == SalesOrder.Status.CONFIRMED:
            return "Confirmed"
        if obj.status == SalesOrder.Status.SHIPPED:
            # Check if there's a shipment with actual movement
            latest_shipment = obj.shipments.filter(deleted_at__isnull=True).first()
            if latest_shipment and latest_shipment.status in (
                Shipment.Status.SHIPPED,
                Shipment.Status.IN_TRANSIT,
                Shipment.Status.OUT_FOR_DELIVERY,
            ):
                return "Shipped"
            return "Packed"
        if obj.status == SalesOrder.Status.DELIVERED:
            return "Delivered"
        if obj.status == SalesOrder.Status.CANCELLED:
            return "Cancelled"
        if obj.status == SalesOrder.Status.CLOSED:
            return "Delivered"
        return obj.status

    def get_preorder_timeline(self, obj) -> list[dict]:
        return [
            {"stage": event.stage, "at": event.created_at}
            for event in obj.preorder_stage_events.all()
        ]

    def get_items(self, obj) -> list[dict]:
        return PublicTrackOrderItemSerializer(obj.lines.all(), many=True).data

    def get_shipments(self, obj) -> list[dict]:
        return PublicTrackShipmentSerializer(obj.shipments.all(), many=True).data

    def get_delivery_info(self, obj) -> dict | None:
        """Return delivery address snapshot without sensitive customer info."""
        snapshot = obj.shipping_address_snapshot or {}
        if not snapshot:
            return None
        return {
            "full_name": snapshot.get("full_name", ""),
            "phone": snapshot.get("phone", ""),
            "line1": snapshot.get("line1", ""),
            "line2": snapshot.get("line2", ""),
            "city": snapshot.get("city", ""),
            "state": snapshot.get("state", ""),
            "postal_code": snapshot.get("postal_code", ""),
            "country": snapshot.get("country", ""),
        }

    def get_tracking_timeline(self, obj) -> list[dict]:
        timeline = []

        # Order placed
        timeline.append({
            "status": "Placed",
            "timestamp": obj.created_at,
            "description": "Order placed",
        })

        # Order confirmed
        if obj.status in (
            SalesOrder.Status.CONFIRMED,
            SalesOrder.Status.SHIPPED,
            SalesOrder.Status.DELIVERED,
            SalesOrder.Status.CLOSED,
        ):
            timeline.append({
                "status": "Confirmed",
                "timestamp": obj.updated_at,
                "description": "Order confirmed",
            })

        # Order packed (when shipped but no shipment movement yet)
        if obj.status in (
            SalesOrder.Status.SHIPPED,
            SalesOrder.Status.DELIVERED,
            SalesOrder.Status.CLOSED,
        ):
            latest_shipment = obj.shipments.filter(deleted_at__isnull=True).first()
            if latest_shipment and latest_shipment.status in (
                Shipment.Status.SHIPPED,
                Shipment.Status.IN_TRANSIT,
                Shipment.Status.OUT_FOR_DELIVERY,
                Shipment.Status.DELIVERED,
            ):
                timeline.append({
                    "status": "Packed",
                    "timestamp": obj.updated_at,
                    "description": "Order packed and ready for shipment",
                })

        # Shipment events
        for shipment in obj.shipments.filter(deleted_at__isnull=True).order_by("created_at"):
            if shipment.status == Shipment.Status.SHIPPED:
                timeline.append({
                    "status": "Shipped",
                    "timestamp": shipment.shipped_at or shipment.created_at,
                    "description": (
                        f"Shipped via {shipment.carrier.name if shipment.carrier else 'carrier'}"
                    ),
                    "tracking_number": shipment.tracking_number,
                })
            elif shipment.status == Shipment.Status.IN_TRANSIT:
                timeline.append({
                    "status": "In Transit",
                    "timestamp": shipment.updated_at,
                    "description": "Package in transit",
                    "tracking_number": shipment.tracking_number,
                })
            elif shipment.status == Shipment.Status.OUT_FOR_DELIVERY:
                timeline.append({
                    "status": "Out for Delivery",
                    "timestamp": shipment.updated_at,
                    "description": "Out for delivery",
                    "tracking_number": shipment.tracking_number,
                })
            elif shipment.status == Shipment.Status.DELIVERED:
                timeline.append({
                    "status": "Delivered",
                    "timestamp": shipment.delivered_at or shipment.updated_at,
                    "description": "Delivered",
                    "tracking_number": shipment.tracking_number,
                })

        # If delivered but no shipment events
        if obj.status == SalesOrder.Status.DELIVERED and not any(
            e["status"] == "Delivered" for e in timeline
        ):
            timeline.append({
                "status": "Delivered",
                "timestamp": obj.updated_at,
                "description": "Order delivered",
            })

        return timeline