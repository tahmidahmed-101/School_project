import { useCallback, useEffect } from "react"
import { Link, useParams } from "react-router-dom"
import { Truck } from "lucide-react"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchShipment } from "@/features/shipping/slices/shipmentSlice"
import type { Shipment } from "@/features/shipping/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DetailPageState } from "@/components/common/DetailPageState"
import { DetailRow } from "@/components/common/DetailRow"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { ShipmentActions } from "./ShipmentActions"

const ShipmentDetail = () => {
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()

  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.shipments)
  const shipment = singleData && (singleData as Shipment).id === id ? (singleData as Shipment) : null

  useDocumentTitle(shipment?.tracking_number ? `${shipment.tracking_number} — Shipment` : "Shipment Details")

  const load = useCallback(() => (id ? dispatch(fetchShipment(id)) : undefined), [dispatch, id])
  useEffect(() => {
    const request = load()
    return () => request?.abort()
  }, [load])

  const pageState = resolveDetailState(singleStatus, singleError, !!shipment)
  if (pageState || !shipment) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Shipment"
        backTo="/shipments"
        backLabel="Back to Shipments"
        error={singleError}
        onRetry={() => {
          load()
        }}
      />
    )
  }

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title={shipment.tracking_number || "Untracked shipment"}
        badges={<StatusBadge status={shipment.status} />}
        description={
          <Link to={`/order_detail/${shipment.order_id}`} className="text-primary hover:underline">
            View order
          </Link>
        }
        back={{ to: "/shipments", label: "Back to shipments" }}
        actions={<ShipmentActions shipment={shipment} size="default" />}
      />

      <Card className="max-w-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            Consignment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DetailRow label="Carrier">{shipment.carrier_name || "Not set (auto-selected on dispatch)"}</DetailRow>
          <DetailRow label="Tracking number">
            <span className="font-mono">{shipment.tracking_number || "—"}</span>
          </DetailRow>
          <DetailRow label="Courier status">{shipment.courier_status || "—"}</DetailRow>
          <DetailRow label="Shipping charge">{formatCurrency(shipment.shipping_charge)}</DetailRow>
          <DetailRow label="COD amount">{formatCurrency(shipment.cod_amount)}</DetailRow>
          <DetailRow label="Shipped at">{formatDateTime(shipment.shipped_at)}</DetailRow>
          <DetailRow label="Delivered at">{formatDateTime(shipment.delivered_at)}</DetailRow>
        </CardContent>
      </Card>
    </div>
  )
}

export default ShipmentDetail
