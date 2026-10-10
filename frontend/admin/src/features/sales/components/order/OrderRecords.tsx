import { Link } from "react-router-dom"
import { CreditCard, Eye, ListOrdered, MapPin, RotateCcw, Truck, User } from "lucide-react"

import { paymentMethodLabel } from "@/features/payments/types"
import { KIND_PATHS, orderNoun } from "@/features/sales/shared/kindPaths"
import type { Order } from "@/features/sales/types"
import { ReturnOutcome } from "@/features/shipping/components/ReturnOutcome"
import { ShipmentActions } from "@/features/shipping/components/ShipmentActions"
import { RECEIVABLE_BACK_STATUSES } from "@/features/shipping/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DetailRow } from "@/components/common/DetailRow"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useCan } from "@/hooks/use-can"
import { formatCurrency } from "@/lib/format"

/** Who ordered and where it goes. */
export function OrderPartyCards({ order }: { order: Order }) {
  const kind = order.order_type
  const address = order.shipping_address
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Customer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <DetailRow label="Name">{order.customer_name || "—"}</DetailRow>
          <DetailRow label="Email">{order.customer_email || "—"}</DetailRow>
          <DetailRow label="Phone">{order.customer_phone || "—"}</DetailRow>
          {(order.contact_email || order.contact_phone) && (
            <p className="pt-1 text-xs text-muted-foreground">
              Contact details overridden on this {orderNoun(kind)}.
            </p>
          )}
          {order.notes && (
            <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-foreground">Notes</p>
              <p className="whitespace-pre-line text-xs text-muted-foreground">{order.notes}</p>
            </div>
          )}
          {/* A guest cart has no customer to list orders for. */}
          {order.customer_id && (
            <div className="pt-2">
              <Button variant="link" size="sm" className="px-0" asChild>
                <Link to={`${KIND_PATHS[kind].orders}?customer_id=${order.customer_id}`}>
                  <ListOrdered className="size-4" />
                  {kind === "preorder" ? "All pre-orders from this customer" : "All orders from this customer"}
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Ship to
          </CardTitle>
        </CardHeader>
        <CardContent>
          {address ? (
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{address.full_name || "—"}</p>
              {address.phone && <p className="text-muted-foreground">{address.phone}</p>}
              <p>{address.line1}</p>
              <p className="text-muted-foreground">{[address.postal_code, address.country].filter(Boolean).join(", ")}</p>
              {address.delivery_note && (
                <p className="mt-2 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">{address.delivery_note}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No shipping address on this {orderNoun(kind)}.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** The order's payments, shipments and returns. */
export function OrderRecords({ order, refresh }: { order: Order; refresh: () => void }) {
  const canReturn = useCan("returns.manage")
  const canRefund = useCan("refunds.approve")
  const noun = orderNoun(order.order_type)
  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payments ({order.payments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {order.payments.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded.</p>}
            {order.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {formatCurrency(p.amount)} · {paymentMethodLabel(p.method)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.gateway_reference ? `Ref ${p.gateway_reference}` : "No reference"}
                    {Number(p.refunded_amount) > 0 && ` · Refunded ${formatCurrency(p.refunded_amount)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={p.status} />
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/payment_detail/${p.id}`}>
                      <Eye className="size-4" />
                      {canRefund && p.status === "captured" ? "Refund" : "View"}
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              Shipments ({order.shipments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {order.shipments.length === 0 && <p className="text-sm text-muted-foreground">Nothing shipped yet.</p>}
            {order.shipments.map((s) => (
              <div key={s.id} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/shipment_detail/${s.id}`} className="font-semibold hover:underline">
                      {s.carrier_name || "Carrier not set"}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Tracking <span className="font-mono">{s.tracking_number || "—"}</span>
                      {s.courier_status && ` · ${s.courier_status}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Charge {formatCurrency(s.shipping_charge)} · COD {formatCurrency(s.cod_amount)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={s.status} />
                    <ReturnOutcome shipment={s} />
                  </div>
                </div>
                {s.unresolved_damaged_quantity > 0 && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {s.unresolved_damaged_quantity} damaged {s.unresolved_damaged_quantity === 1 ? "unit" : "units"} written off and still owed to the customer —{" "}
                    <Link to={`/shipment_detail/${s.id}`} className="underline">
                      replace them
                    </Link>
                    .
                  </p>
                )}
                {RECEIVABLE_BACK_STATUSES.includes(s.status) && !s.received_back_at && (
                  <p className="text-xs text-muted-foreground">
                    Not yet received back.{" "}
                    <Link to={`/shipment_detail/${s.id}`} className="text-primary hover:underline">
                      Receive it back
                    </Link>{" "}
                    once the parcel arrives.
                  </p>
                )}
                <ShipmentActions shipment={s} onChanged={refresh} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" />
            Returns ({order.rmas.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {order.rmas.length === 0 && <p className="text-sm text-muted-foreground">No returns for this {noun}.</p>}
          {order.rmas.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{r.rma_number}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.lines.reduce((n, l) => n + l.quantity, 0)} unit(s){r.reason ? ` · ${r.reason}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={r.status} />
                {canReturn && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/return_detail/${r.id}`}>
                      <Eye className="size-4" /> View
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
