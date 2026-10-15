import type { ComponentType, ReactNode } from "react"
import { Link } from "react-router-dom"
import { CreditCard, Eye, ListOrdered, Mail, MapPin, MessageSquare, Phone, RotateCcw, StickyNote, Truck, User } from "lucide-react"

import { paymentMethodLabel } from "@/features/payments/types"
import { KIND_PATHS, orderNoun } from "@/features/sales/shared/kindPaths"
import type { Order } from "@/features/sales/types"
import { ReturnOutcome } from "@/features/shipping/components/ReturnOutcome"
import { ShipmentActions } from "@/features/shipping/components/ShipmentActions"
import { RECEIVABLE_BACK_STATUSES } from "@/features/shipping/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useCan } from "@/hooks/use-can"
import { formatCurrency } from "@/lib/format"

const digits = (value: string) => value.replace(/\D/g, "")

function IconLine({ icon: Icon, label, children }: { icon: ComponentType<{ className?: string }>; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span title={label} className="mt-0.5 shrink-0 text-muted-foreground">
        <Icon className="size-4" />
        <span className="sr-only">{label}</span>
      </span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}

/** Who ordered and where it goes, in one place; a name or phone already shown is not repeated. */
export function OrderCustomerCard({ order }: { order: Order }) {
  const kind = order.order_type
  const address = order.shipping_address
  const name = order.customer_name
  const phone = order.customer_phone
  const recipient = address?.full_name && address.full_name !== name ? address.full_name : ""
  const recipientPhone = address?.phone && digits(address.phone) !== digits(phone || "") ? address.phone : ""
  const place = address ? [address.line1, [address.postal_code, address.country].filter(Boolean).join(", ")].filter(Boolean) : []
  const ordersLabel = kind === "preorder" ? "All pre-orders from this customer" : "All orders from this customer"

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-primary" />
            {name || "Customer"}
          </CardTitle>
          {/* A guest cart has no customer to list orders for. */}
          {order.customer_id && (
            <Button variant="ghost" size="icon" asChild>
              <Link to={`${KIND_PATHS[kind].orders}?customer_id=${order.customer_id}`} title={ordersLabel} aria-label={ordersLabel}>
                <ListOrdered className="size-4" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {order.customer_email && (
          <IconLine icon={Mail} label="Email">
            {order.customer_email}
          </IconLine>
        )}
        {phone && (
          <IconLine icon={Phone} label="Phone">
            {phone}
          </IconLine>
        )}
        <IconLine icon={MapPin} label="Ship to">
          {address ? (
            <>
              {recipient && <p className="font-medium">{recipient}</p>}
              {recipientPhone && <p className="text-muted-foreground">{recipientPhone}</p>}
              {place.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </>
          ) : (
            <span className="text-muted-foreground">No shipping address on this {orderNoun(kind)}.</span>
          )}
        </IconLine>
        {address?.delivery_note && (
          <IconLine icon={StickyNote} label="Delivery note">
            {address.delivery_note}
          </IconLine>
        )}
        {order.notes && (
          <IconLine icon={MessageSquare} label="Notes">
            <span className="whitespace-pre-line">{order.notes}</span>
          </IconLine>
        )}
      </CardContent>
    </Card>
  )
}

function SectionTitle({ icon: Icon, label, count }: { icon: ComponentType<{ className?: string }>; label: string; count: number }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="size-4 text-primary" />
      {label}
      <span className="font-normal text-muted-foreground">{count}</span>
    </p>
  )
}

/** The order's payments, shipments and returns in one card; a section with nothing in it is left out. */
export function OrderRecords({ order, refresh }: { order: Order; refresh: () => void }) {
  const canReturn = useCan("returns.manage")
  const canRefund = useCan("refunds.approve")
  const none = order.payments.length === 0 && order.shipments.length === 0 && order.rmas.length === 0

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4 text-primary" />
          Payments & shipping
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {none && <p className="text-sm text-muted-foreground">No payments or shipments yet.</p>}

        {order.payments.length > 0 && (
          <section className="space-y-3">
            <SectionTitle icon={CreditCard} label="Payments" count={order.payments.length} />
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
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                      to={`/payment_detail/${p.id}`}
                      title={canRefund && p.status === "captured" ? "Refund" : "View"}
                      aria-label={canRefund && p.status === "captured" ? "Refund" : "View payment"}
                    >
                      <Eye className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}

        {order.shipments.length > 0 && (
          <section className="space-y-3">
            <SectionTitle icon={Truck} label="Shipments" count={order.shipments.length} />
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
          </section>
        )}

        {order.rmas.length > 0 && (
          <section className="space-y-3">
            <SectionTitle icon={RotateCcw} label="Returns" count={order.rmas.length} />
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
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/return_detail/${r.id}`} title="View" aria-label="View return">
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  )
}
