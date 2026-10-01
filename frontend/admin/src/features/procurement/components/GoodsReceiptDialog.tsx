import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2, PackageCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import { todayLocalISODate } from "@/lib/format"
import { useAppDispatch } from "@/app/hooks"

import { createGoodsReceipt } from "../slices/goodsReceiptSlice"
import type { GoodsReceipt, GRNLineCondition, PurchaseOrder } from "../types"
import { useAllPages } from "../hooks/useProcurement"

type LineState = { quantity: string; condition: GRNLineCondition }

/**
 * Records a goods received note against a submitted PO. Pass `purchaseOrder` to receive a
 * known PO; omit it to let the user pick one of the submitted POs first.
 */
export function GoodsReceiptDialog({
  open,
  onOpenChange,
  purchaseOrder,
  onReceived,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseOrder?: PurchaseOrder | null
  onReceived?: (grn: GoodsReceipt) => void
}) {
  const pickMode = !purchaseOrder
  const { items: submittedPos, isLoading: posLoading } = useAllPages<PurchaseOrder>(
    "/admin/procurement/purchase-orders/",
    { status: "submitted" },
    open && pickMode
  )
  const [picked, setPicked] = useState<PurchaseOrder | null>(null)
  const po = purchaseOrder ?? picked

  const handleOpenChange = (next: boolean) => {
    if (!next) setPicked(null)
    onOpenChange(next)
  }

  const handlePick = async (id: string) => {
    try {
      const res = await api.get(`/admin/procurement/purchase-orders/${id}/`)
      setPicked(unwrapItem<PurchaseOrder>(res.data))
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't load that purchase order"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />
            Receive Goods{po ? ` — ${po.po_number}` : ""}
          </DialogTitle>
          <DialogDescription>
            Accepted quantities go into stock at the PO unit cost and post to the ledger. Rejected quantities are
            logged on the receipt only.
          </DialogDescription>
        </DialogHeader>

        {pickMode && (
          <Field>
            <FieldLabel htmlFor="grn-po">Purchase order *</FieldLabel>
            <FieldContent>
              <Select value={picked?.id ?? ""} onValueChange={handlePick}>
                <SelectTrigger id="grn-po">
                  <SelectValue placeholder={posLoading ? "Loading..." : "Select a submitted PO"} />
                </SelectTrigger>
                <SelectContent>
                  {submittedPos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.po_number} · {p.supplier_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!posLoading && submittedPos.length === 0 && (
                <p className="text-xs text-muted-foreground">No submitted purchase orders are awaiting delivery.</p>
              )}
            </FieldContent>
          </Field>
        )}

        {/* Keyed by PO so quantities re-seed from that PO's outstanding amounts. */}
        {open && (
          <ReceiptForm
            key={po?.id ?? "none"}
            po={po}
            onCancel={() => handleOpenChange(false)}
            onReceived={(grn) => {
              onReceived?.(grn)
              handleOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReceiptForm({
  po,
  onCancel,
  onReceived,
}: {
  po: PurchaseOrder | null
  onCancel: () => void
  onReceived: (grn: GoodsReceipt) => void
}) {
  const dispatch = useAppDispatch()
  const [receivedDate, setReceivedDate] = useState(todayLocalISODate)
  const [lineState, setLineState] = useState<Record<string, LineState>>(() => {
    const initial: Record<string, LineState> = {}
    for (const line of po?.lines ?? []) {
      const remaining = line.quantity_ordered - line.quantity_received
      initial[line.id] = { quantity: remaining > 0 ? String(remaining) : "0", condition: "accepted" }
    }
    return initial
  })
  const [submitting, setSubmitting] = useState(false)

  const openLines = useMemo(
    () => (po?.lines ?? []).filter((l) => l.quantity_ordered - l.quantity_received > 0),
    [po]
  )

  const payloadLines = openLines
    .map((l) => ({
      purchase_order_line_id: l.id,
      quantity_received: Number(lineState[l.id]?.quantity || 0),
      condition: lineState[l.id]?.condition ?? ("accepted" as GRNLineCondition),
    }))
    .filter((l) => l.quantity_received > 0)

  const invalidLine = openLines.find((l) => {
    const q = Number(lineState[l.id]?.quantity || 0)
    return !Number.isInteger(q) || q < 0 || q > l.quantity_ordered - l.quantity_received
  })

  const handleSubmit = async () => {
    if (!po) return
    setSubmitting(true)
    try {
      const grn = await dispatch(
        createGoodsReceipt({ purchase_order_id: po.id, received_date: receivedDate, lines: payloadLines })
      ).unwrap()
      toast.success(
        grn.status === "qc_reject"
          ? "Receipt recorded — rejected lines were not added to stock"
          : "Goods received and added to stock"
      )
      onReceived(grn)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to record goods receipt"))
    } finally {
      setSubmitting(false)
    }
  }

  const setLine = (id: string, patch: Partial<LineState>) =>
    setLineState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  return (
    <>
      <div className="space-y-4 py-2">
        <Field className="max-w-xs">
          <FieldLabel htmlFor="grn-date">Received date *</FieldLabel>
          <FieldContent>
            <Input id="grn-date" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </FieldContent>
        </Field>

        {po && openLines.length === 0 && (
          <p className="text-sm text-muted-foreground">Every line on this purchase order has been fully received.</p>
        )}

        {po && openLines.length > 0 && (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PRODUCT</TableHead>
                  <TableHead className="text-right">OUTSTANDING</TableHead>
                  <TableHead className="w-[110px]">RECEIVE</TableHead>
                  <TableHead className="w-[140px]">CONDITION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openLines.map((line) => {
                  const remaining = line.quantity_ordered - line.quantity_received
                  const state = lineState[line.id]
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        <p className="text-sm font-medium">{line.product_name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{line.variant_sku}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{remaining}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          step={1}
                          aria-label={`Quantity received for ${line.variant_sku}`}
                          value={state?.quantity ?? "0"}
                          onChange={(e) => setLine(line.id, { quantity: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={state?.condition ?? "accepted"}
                          onValueChange={(v) => setLine(line.id, { condition: v as GRNLineCondition })}
                        >
                          <SelectTrigger aria-label={`Condition for ${line.variant_sku}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="accepted">Accepted</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {invalidLine && (
          <p className="text-sm text-destructive">
            {invalidLine.variant_sku}: quantity must be a whole number no greater than the outstanding amount.
          </p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!po || submitting || !!invalidLine || payloadLines.length === 0 || !receivedDate}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Record Receipt
        </Button>
      </DialogFooter>
    </>
  )
}
