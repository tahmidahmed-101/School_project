import type { ComponentType, ReactNode } from "react"
import { Link } from "react-router-dom"
import { CreditCard, Eye, ListOrdered, Mail, MapPin, MessageSquare, Phone, RotateCcw, ShieldAlert, StickyNote, Truck, User } from "lucide-react"

import { paymentMethodLabel } from "@/features/payments/types"
import { KIND_PATHS, orderNoun } from "@/features/sales/shared/kindPaths"
import type { Order } from "@/features/sales/types"
import { ReturnOutcome } from "@/features/shipping/components/ReturnOutcome"
import { ShipmentActions } from "@/features/shipping/components/ShipmentActions"
import { RECEIVABLE_BACK_STATUSES } from "@/features/shipping/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { IconLine } from "@/components/common/IconLine"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useCan } from "@/hooks/use-can"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

const digits = (value: string) => value.replace(/\D/g, "")

/** Who ordered and where it goes, in one block; a name or phone already shown is not repeated. */
function OrderCustomerSection({ order }: { order: Order }) {
  const kind = order.order_type
  const address = order.shipping_address
  const name = order.customer_name
  const phone = order.customer_phone
  const recipient = address?.full_name && address.full_name !== name ? address.full_name : ""
  const recipientPhone = address?.phone && digits(address.phone) !== digits(phone || "") ? address.phone : ""
  const place = address ? [address.line1, [address.postal_code, address.country].filter(Boolean).join(", ")].filter(Boolean) : []
  const canViewRisk = useCan("risk.view")
  const ordersLabel = kind === "preorder" ? "All pre-orders from this customer" : "All orders from this customer"

  return (
    <section className="min-w-0 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <User className="h-4 w-4 text-primary" />
          {name || "Customer"}
        </h3>
        {/* A guest cart has no customer to list orders for. */}
        {order.customer_id && (
          <Button variant="ghost" size="icon" className="-my-1 size-8" asChild>
            <Link to={`${KIND_PATHS[kind].orders}?customer_id=${order.customer_id}`} title={ordersLabel} aria-label={ordersLabel}>
              <ListOrdered className="size-4" />
            </Link>
          </Button>
        )}
      </div>
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
      {order.risk && canViewRisk && (
        <IconLine icon={ShieldAlert} label="Fraud risk">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={order.risk.risk_level}
              tone={order.risk.risk_level === "low" ? "success" : order.risk.risk_level === "high" ? "destructive" : "warning"}
            />
            <span className="tabular-nums text-muted-foreground">{Number(order.risk.risk_score)}/100</span>
            {order.risk.auto_blocked && <span className="text-destructive">Blocked</span>}
          </div>
          {order.risk.risk_reasons.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {order.risk.risk_reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </IconLine>
      )}
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
    </section>
  )
}

/** A titled card for one kind of record (shipments, payments, returns), one row per record. */
function RecordCard({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <Card className="min-w-0 overflow-hidden shadow-sm">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" />
          {title}
          <span className="font-normal text-muted-foreground">({count})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">{children}</CardContent>
    </Card>
  )
}

const ROW = "flex items-center justify-between gap-3 py-3 text-sm"

function ShipmentsCard({ order, refresh }: { order: Order; refresh: () => void }) {
  return (
    <RecordCard icon={Truck} title="Shipments" count={order.shipments.length}>
      {order.shipments.map((s) => (
        <div key={s.id} className="@container py-3 text-sm">
          {/* Details on the left and the shipment's buttons beside them when the card is wide
              enough; in a narrower card (or on a phone) the buttons sit under the details. */}
          <div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/shipment_detail/${s.id}`} className="font-medium hover:underline">
                  {s.carrier_name || "Shipment"}
                </Link>
                <StatusBadge status={s.status} />
                <ReturnOutcome shipment={s} />
              </div>
              <p className="break-words text-xs text-muted-foreground">
                {[
                  s.tracking_number ? `Tracking ${s.tracking_number}` : "No tracking number yet",
                  s.courier_status && `Courier: ${s.courier_status}`,
                  Number(s.shipping_charge) > 0 && `Charge ${formatCurrency(s.shipping_charge)}`,
                  Number(s.cod_amount) > 0 && `COD ${formatCurrency(s.cod_amount)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="shrink-0">
              <ShipmentActions shipment={s} onChanged={refresh} />
            </div>
          </div>
          {s.unresolved_damaged_quantity > 0 && (
            <p role="alert" className="mt-2 text-xs font-medium text-destructive">
              {s.unresolved_damaged_quantity} damaged {s.unresolved_damaged_quantity === 1 ? "unit" : "units"} written off and still owed —{" "}
              <Link to={`/shipment_detail/${s.id}`} className="underline">
                replace them
              </Link>
            </p>
          )}
          {RECEIVABLE_BACK_STATUSES.includes(s.status) && !s.received_back_at && (
            <p className="mt-2 text-xs text-muted-foreground">
              Not yet received back.{" "}
              <Link to={`/shipment_detail/${s.id}`} className="text-primary hover:underline">
                Receive it back
              </Link>
            </p>
          )}
        </div>
      ))}
    </RecordCard>
  )
}

function PaymentsCard({ order }: { order: Order }) {
  const canRefund = useCan("refunds.approve")
  return (
    <RecordCard icon={CreditCard} title="Payments" count={order.payments.length}>
      {order.payments.map((p) => (
        <div key={p.id} className={ROW}>
          <div className="min-w-0">
            <p className="font-medium">
              {formatCurrency(p.amount)} · {paymentMethodLabel(p.method)}
            </p>
            {(p.gateway_reference || Number(p.refunded_amount) > 0) && (
              <p className="truncate text-xs text-muted-foreground">
                {[p.gateway_reference && `Ref ${p.gateway_reference}`, Number(p.refunded_amount) > 0 && `Refunded ${formatCurrency(p.refunded_amount)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <StatusBadge status={p.status} />
            <Button variant="ghost" size="icon" className="size-8" asChild>
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
    </RecordCard>
  )
}

function ReturnsCard({ order }: { order: Order }) {
  const canReturn = useCan("returns.manage")
  return (
    <RecordCard icon={RotateCcw} title="Returns" count={order.rmas.length}>
      {order.rmas.map((r) => (
        <div key={r.id} className={ROW}>
          <div className="min-w-0">
            <p className="font-medium">{r.rma_number}</p>
            <p className="truncate text-xs text-muted-foreground">
              {r.lines.reduce((n, l) => n + l.quantity, 0)} unit(s){r.reason ? ` · ${r.reason}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <StatusBadge status={r.status} />
            {canReturn && (
              <Button variant="ghost" size="icon" className="size-8" asChild>
                <Link to={`/return_detail/${r.id}`} title="View" aria-label="View return">
                  <Eye className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      ))}
    </RecordCard>
  )
}

/** Who ordered and where it goes, beside what it costs: two cards side by side on wide screens. */
export function OrderOverview({ order, money }: { order: Order; money: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="min-w-0 shadow-sm">
        <CardContent>
          <OrderCustomerSection order={order} />
        </CardContent>
      </Card>
      <Card className="min-w-0 shadow-sm">
        <CardContent>{money}</CardContent>
      </Card>
    </div>
  )
}

/**
 * The order's shipments and payments side by side on desktop, returns after them. A kind with
 * no records is left out, and one left on its own takes the full width.
 */
export function OrderRecords({ order, refresh }: { order: Order; refresh: () => void }) {
  const cards = [
    order.shipments.length > 0 && <ShipmentsCard key="shipments" order={order} refresh={refresh} />,
    order.payments.length > 0 && <PaymentsCard key="payments" order={order} />,
    order.rmas.length > 0 && <ReturnsCard key="returns" order={order} />,
  ].filter(Boolean)
  if (cards.length === 0) return null
  return (
    <div
      className={cn(
        // Cards in one row stretch to the same height.
        "grid grid-cols-1 gap-6",
        cards.length > 1 && "lg:grid-cols-2",
        // An odd card out spans the row instead of leaving a hole beside it.
        cards.length === 3 && "lg:[&>*:last-child]:col-span-2"
      )}
    >
      {cards}
    </div>
  )
}
