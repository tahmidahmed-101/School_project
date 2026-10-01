import { useCallback, useEffect, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Truck } from "lucide-react"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchShipment } from "@/features/shipping/slices/shipmentSlice"
import type { Shipment } from "@/features/shipping/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DetailPageState } from "@/components/common/DetailPageState"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { ShipmentActions } from "./ShipmentActions"

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex justify-between gap-4 border-b border-border/50 py-2 text-sm last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{children}</span>
  </div>
)

const ShipmentDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="back" size="icon" onClick={() => navigate("/shipments")} aria-label="Back to shipments">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                {shipment.tracking_number || "Untracked shipment"}
              </h1>
              <StatusBadge status={shipment.status} />
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              <Link to={`/order_detail/${shipment.order_id}`} className="text-primary hover:underline">
                View order
              </Link>
            </p>
          </div>
        </div>
        <ShipmentActions shipment={shipment} size="default" />
      </div>

      <Card className="max-w-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            Consignment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Carrier">{shipment.carrier_name || "Not set (auto-selected on dispatch)"}</Row>
          <Row label="Tracking number">
            <span className="font-mono">{shipment.tracking_number || "—"}</span>
          </Row>
          <Row label="Courier status">{shipment.courier_status || "—"}</Row>
          <Row label="Shipping charge">{formatCurrency(shipment.shipping_charge)}</Row>
          <Row label="COD amount">{formatCurrency(shipment.cod_amount)}</Row>
          <Row label="Shipped at">{formatDateTime(shipment.shipped_at)}</Row>
          <Row label="Delivered at">{formatDateTime(shipment.delivered_at)}</Row>
        </CardContent>
      </Card>
    </div>
  )
}

export default ShipmentDetail
