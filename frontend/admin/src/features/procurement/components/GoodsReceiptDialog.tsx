import type { ColumnDef } from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, PackageCheck } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable } from "@/components/common/data-table"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { DialogActions } from "@/components/common/FormDialog"
import { DateField } from "@/components/common/form-fields"
import { getApiErrorMessage } from "@/lib/api/client"
import { todayLocalISODate } from "@/lib/format"
import { useAppDispatch } from "@/app/hooks"
import { useAllPages } from "@/hooks/use-all-pages"
import { useDelayedUnmount } from "@/hooks/use-dialog-presence"
import { useWarehouses } from "@/features/inventory/lib/useWarehouses"

import { createGoodsReceipt } from "../slices/goodsReceiptSlice"
import type { GoodsReceipt, GRNLineCondition, PurchaseOrder } from "../types"
import { usePurchaseOrderPick } from "../hooks/usePurchaseOrderPick"

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
    { status: "submitted", kind: "stock" },
    { enabled: open && pickMode }
  )
  const { picked, handleOpenChange, handlePick } = usePurchaseOrderPick(onOpenChange)
  const po = purchaseOrder ?? picked

  // The form resets by unmounting; it stays through the exit animation so the dialog doesn't empty first.
  const formMounted = useDelayedUnmount(open)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />
            Receive Goods{po ? ` — ${po.po_number}` : ""}
          </DialogTitle>
          <DialogDescription>
            Accepted quantities go into stock at the PO unit cost and post to the ledger.
            Rejected quantities are logged on the receipt only.
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
        {formMounted && (
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
  // Accepted goods go into this warehouse; empty means the default one.
  const { warehouses } = useWarehouses()
  const receivingWarehouses = warehouses.filter((w) => w.is_active && !w.deleted_at)
  const [warehouseId, setWarehouseId] = useState("")
  const chosenWarehouse =
    warehouseId || receivingWarehouses.find((w) => w.is_default)?.id || receivingWarehouses[0]?.id || ""
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
        createGoodsReceipt({
          purchase_order_id: po.id,
          received_date: receivedDate,
          ...(chosenWarehouse ? { warehouse_id: chosenWarehouse } : {}),
          lines: payloadLines,
        })
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

  const lineColumns: ColumnDef<PurchaseOrder["lines"][number]>[] = [
    {
      id: "product",
      header: "PRODUCT",
      cell: ({ row: { original: line } }) => (
        <div>
          <p className="text-sm font-medium">{line.product_name}</p>
          <p className="text-xs font-mono text-muted-foreground">{line.variant_sku}</p>
        </div>
      ),
    },
    {
      id: "outstanding",
      header: "OUTSTANDING",
      meta: { align: "right" },
      cell: ({ row: { original: line } }) => (
        <span className="tabular-nums">{line.quantity_ordered - line.quantity_received}</span>
      ),
    },
    {
      id: "receive",
      header: "RECEIVE",
      cell: ({ row: { original: line } }) => (
        <Input
          type="number"
          min={0}
          max={line.quantity_ordered - line.quantity_received}
          step={1}
          aria-label={`Quantity received for ${line.variant_sku}`}
          value={lineState[line.id]?.quantity ?? "0"}
          onChange={(e) => setLine(line.id, { quantity: e.target.value })}
        />
      ),
    },
    {
      id: "condition",
      header: "CONDITION",
      cell: ({ row: { original: line } }) => (
        <Select
          value={lineState[line.id]?.condition ?? "accepted"}
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
      ),
    },
  ]

  return (
    <>
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField
            label="Received date *"
            id="grn-date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
          />
          <Field>
            <FieldLabel htmlFor="grn-warehouse">Receive into</FieldLabel>
            <FieldContent>
              <Select value={chosenWarehouse} onValueChange={setWarehouseId}>
                <SelectTrigger id="grn-warehouse">
                  <SelectValue placeholder="Default warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {receivingWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      {w.is_default ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </div>

        {po && openLines.length === 0 && (
          <p className="text-sm text-muted-foreground">Every line on this purchase order has been fully received.</p>
        )}

        {po && openLines.length > 0 && (
          <DataTable
            surface="card"
            showPagination={false}
            selectable={false}
            columns={lineColumns}
            data={openLines}
            minWidth="0px"
            columnWidths={["auto", "120px", "110px", "140px"]}
          />
        )}
        {invalidLine && (
          <p className="text-sm text-destructive">
            {invalidLine.variant_sku}: quantity must be a whole number no greater than the outstanding amount.
          </p>
        )}
      </div>

      <DialogActions
        onCancel={onCancel}
        onSubmit={handleSubmit}
        submitLabel="Record Receipt"
        icon={CheckCircle2}
        submitting={submitting}
        submitDisabled={!po || !!invalidLine || payloadLines.length === 0 || !receivedDate}
      />
    </>
  )
}
