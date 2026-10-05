import { useCallback, useEffect } from "react"
import { Link, useParams } from "react-router-dom"
import { Boxes, Truck } from "lucide-react"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchShipment } from "@/features/shipping/slices/shipmentSlice"
import type { Shipment } from "@/features/shipping/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DetailPageState } from "@/components/common/DetailPageState"
import { DetailRow } from "@/components/common/DetailRow"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { ReturnOutcome } from "./ReturnOutcome"
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
        badges={
          <>
            <StatusBadge status={shipment.status} />
            <ReturnOutcome shipment={shipment} />
          </>
        }
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
          {shipment.received_back_at && (
            <DetailRow label="Received back at">{formatDateTime(shipment.received_back_at)}</DetailRow>
          )}
        </CardContent>
      </Card>

      {shipment.lines && shipment.lines.length > 0 && (
        <Card className="max-w-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Boxes className="h-4 w-4 text-primary" />
              Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Shipped</th>
                    <th className="px-3 py-2 text-right font-medium">Damaged</th>
                    <th className="px-3 py-2 text-right font-medium">Replaced</th>
                    <th className="py-2 pl-3 text-right font-medium">Still owed</th>
                  </tr>
                </thead>
                <tbody>
                  {shipment.lines.map((line) => (
                    <tr key={line.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="block font-medium">{line.product_name}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{line.sku}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{line.quantity}</td>
                      <td className="px-3 py-2 text-right">{line.damaged_quantity}</td>
                      <td className="px-3 py-2 text-right">{line.replaced_quantity}</td>
                      <td
                        className={`py-2 pl-3 text-right font-semibold ${
                          line.unresolved_damaged_quantity > 0 ? "text-destructive" : ""
                        }`}
                      >
                        {line.unresolved_damaged_quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shipment.unresolved_damaged_quantity > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Damaged units were written off and are still owed to the customer. The order cannot be delivered until
                they are replaced.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default ShipmentDetail
