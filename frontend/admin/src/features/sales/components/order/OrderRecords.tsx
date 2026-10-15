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
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useCan } from "@/hooks/use-can"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

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

function SectionTitle({ icon: Icon, label, count }: { icon: ComponentType<{ className?: string }>; label: string; count: number }) {
  return (
    <p className="flex items-center gap-2 pb-1 text-sm font-semibold">
      <Icon className="size-4 text-primary" />
      {label}
      <span className="font-normal text-muted-foreground">{count}</span>
    </p>
  )
}

const ROW = "flex items-center justify-between gap-3 py-2 text-sm"

/** The order's payments, shipments and returns as plain rows; a section with nothing in it is left out. */
function OrderRecordsSection({ order, refresh }: { order: Order; refresh: () => void }) {
  const canReturn = useCan("returns.manage")
  const canRefund = useCan("refunds.approve")

  return (
    <div className="min-w-0 space-y-4">
      {order.payments.length > 0 && (
        <section>
          <SectionTitle icon={CreditCard} label="Payments" count={order.payments.length} />
          <div className="divide-y divide-border">
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
          </div>
        </section>
      )}

      {order.shipments.length > 0 && (
        <section>
          <SectionTitle icon={Truck} label="Shipments" count={order.shipments.length} />
          <div className="divide-y divide-border">
            {order.shipments.map((s) => (
              <div key={s.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/shipment_detail/${s.id}`} className="font-medium hover:underline">
                      {s.carrier_name || "Shipment"}
                    </Link>
                    <p className="break-words text-xs text-muted-foreground">
                      {s.tracking_number && <span className="font-mono">{s.tracking_number}</span>}
                      {s.tracking_number && (Number(s.shipping_charge) > 0 || Number(s.cod_amount) > 0) && " · "}
                      {[
                        Number(s.shipping_charge) > 0 && `Charge ${formatCurrency(s.shipping_charge)}`,
                        Number(s.cod_amount) > 0 && `COD ${formatCurrency(s.cod_amount)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ReturnOutcome shipment={s} />
                    <StatusBadge status={s.status} />
                    <ShipmentActions shipment={s} onChanged={refresh} />
                  </div>
                </div>
                {s.unresolved_damaged_quantity > 0 && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    {s.unresolved_damaged_quantity} damaged {s.unresolved_damaged_quantity === 1 ? "unit" : "units"} written off and still owed —{" "}
                    <Link to={`/shipment_detail/${s.id}`} className="underline">
                      replace them
                    </Link>
                  </p>
                )}
                {RECEIVABLE_BACK_STATUSES.includes(s.status) && !s.received_back_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Not yet received back.{" "}
                    <Link to={`/shipment_detail/${s.id}`} className="text-primary hover:underline">
                      Receive it back
                    </Link>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {order.rmas.length > 0 && (
        <section>
          <SectionTitle icon={RotateCcw} label="Returns" count={order.rmas.length} />
          <div className="divide-y divide-border">
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
          </div>
        </section>
      )}
    </div>
  )
}

/** One card: customer, the money, and the payment, shipment and return rows side by side; the last column drops out when there are none. */
export function OrderSummaryCard({ order, refresh, money }: { order: Order; refresh: () => void; money: ReactNode }) {
  const hasRecords = order.payments.length > 0 || order.shipments.length > 0 || order.rmas.length > 0
  return (
    <Card className="shadow-sm">
      <CardContent className={cn("grid grid-cols-1 gap-x-8 gap-y-6 py-4", hasRecords ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        <OrderCustomerSection order={order} />
        {money}
        {hasRecords && <OrderRecordsSection order={order} refresh={refresh} />}
      </CardContent>
    </Card>
  )
}
