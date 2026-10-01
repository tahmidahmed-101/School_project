import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  FileDown,
  FileText,
  ImageOff,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DeleteModal } from "@/components/common/DeleteModal"
import { DetailPageState } from "@/components/common/DetailPageState"
import { resolveDetailState } from "@/lib/detailState"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { formatCurrency, formatDate } from "@/lib/format"
import { useAppDispatch } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import {
  addPurchaseOrderLine,
  cancelPurchaseOrder,
  deleteData,
  fetchSingle,
  purchaseOrderPdfUrl,
  removePurchaseOrderLine,
  submitPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderLine,
} from "../slices/purchaseOrderSlice"
import type { GoodsReceipt, PurchaseOrder, PurchaseOrderLine, Supplier } from "../types"
import { useAllPages, useCanManagePurchasing, useCanWriteBills, useProcurementSelector } from "../hooks/useProcurement"
import {
  GRN_STATUS_LABEL,
  GRN_STATUS_TONE,
  PO_STATUS_TONE,
  openPdf,
  poOrderedTotal,
  poReceivedTotal,
  poUnitsOrdered,
  poUnitsReceived,
} from "../utils"
import { ConfirmAction } from "./ConfirmAction"
import { GoodsReceiptDialog } from "./GoodsReceiptDialog"
import { VendorBillFormDialog } from "./VendorBillFormDialog"
import { VariantPicker, type PickedVariant } from "./VariantPicker"

// ---- Dialogs -------------------------------------------------------------------------------

function HeaderEditDialog({
  open,
  onOpenChange,
  po,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: PurchaseOrder
}) {
  const dispatch = useAppDispatch()
  const { items: suppliers } = useAllPages<Supplier>("/admin/procurement/suppliers/", undefined, open)
  const [supplierId, setSupplierId] = useState(po.supplier_id)
  const [orderDate, setOrderDate] = useState(po.order_date)
  const [notes, setNotes] = useState(po.notes)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await dispatch(
        updatePurchaseOrder({ id: po.id, payload: { supplier_id: supplierId, order_date: orderDate, notes } })
      ).unwrap()
      toast.success("Purchase order updated")
      onOpenChange(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update purchase order"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {po.po_number}</DialogTitle>
          <DialogDescription>Header details can only change while the order is a draft.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="poe-supplier">Supplier</FieldLabel>
            <FieldContent>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="poe-supplier">
                  <SelectValue placeholder={po.supplier_name} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers
                    .filter((s) => s.is_active || s.id === po.supplier_id)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="poe-date">Order date</FieldLabel>
            <FieldContent>
              <Input id="poe-date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="poe-notes">Notes</FieldLabel>
            <FieldContent>
              <Textarea id="poe-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FieldContent>
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !orderDate}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LineDialog({
  open,
  onOpenChange,
  po,
  line,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: PurchaseOrder
  /** Line to edit; null adds a new one. */
  line: PurchaseOrderLine | null
  onSaved: () => void
}) {
  const dispatch = useAppDispatch()
  const [variant, setVariant] = useState<PickedVariant | null>(
    line ? { id: line.variant_id, label: line.product_name, sku: line.variant_sku, cost_price: null } : null
  )
  const [quantity, setQuantity] = useState(line ? String(line.quantity_ordered) : "1")
  const [unitCost, setUnitCost] = useState(line ? Number(line.unit_cost).toFixed(2) : "")
  const [saving, setSaving] = useState(false)

  const qtyValid = Number.isInteger(Number(quantity)) && Number(quantity) >= 1
  const costValid = unitCost !== "" && Number(unitCost) >= 0

  const save = async () => {
    if (!variant) return
    setSaving(true)
    const payload = { variant_id: variant.id, quantity_ordered: Number(quantity), unit_cost: unitCost }
    try {
      if (line) {
        await dispatch(updatePurchaseOrderLine({ poId: po.id, lineId: line.id, payload })).unwrap()
        toast.success("Line updated")
      } else {
        await dispatch(addPurchaseOrderLine({ poId: po.id, payload })).unwrap()
        toast.success("Line added")
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save line"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{line ? "Edit Line" : "Add Line"}</DialogTitle>
          <DialogDescription>{po.po_number}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="line-variant">Variant *</FieldLabel>
            <FieldContent>
              <VariantPicker
                id="line-variant"
                value={variant}
                onChange={(v) => {
                  setVariant(v)
                  if (v.cost_price && !unitCost) setUnitCost(Number(v.cost_price).toFixed(2))
                }}
              />
            </FieldContent>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="line-qty">Quantity *</FieldLabel>
              <FieldContent>
                <Input
                  id="line-qty"
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  aria-invalid={!qtyValid}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="line-cost">Unit cost *</FieldLabel>
              <FieldContent>
                <Input
                  id="line-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={unitCost}
                  aria-invalid={!costValid}
                  onChange={(e) => setUnitCost(e.target.value)}
                />
              </FieldContent>
            </Field>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !variant || !qtyValid || !costValid}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Page ----------------------------------------------------------------------------------

function SummaryStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

const PurchaseOrderDetail = () => {
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { singleData, singleStatus, singleError } = useProcurementSelector((state) => state.purchaseOrders)
  const loaded = singleData as PurchaseOrder | null
  const po = loaded && loaded.id === id ? loaded : null
  const canManage = useCanManagePurchasing()
  const canBill = useCanWriteBills()

  const [headerOpen, setHeaderOpen] = useState(false)
  const [lineDialog, setLineDialog] = useState<{ open: boolean; line: PurchaseOrderLine | null }>({
    open: false,
    line: null,
  })
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [billOpen, setBillOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([])
  const [receiptsKey, setReceiptsKey] = useState(0)

  useDocumentTitle(po ? `${po.po_number} — Purchase Order` : "Purchase Order")

  const load = useCallback(() => dispatch(fetchSingle(id)), [dispatch, id])
  useEffect(() => {
    load()
  }, [load])

  const poNumber = po?.po_number
  useEffect(() => {
    if (!poNumber) return
    const controller = new AbortController()
    const run = async () => {
      try {
        const res = await api.get("/admin/procurement/goods-receipts/", {
          params: { search: poNumber, page_size: 50 },
          signal: controller.signal,
        })
        setReceipts(unwrapList<GoodsReceipt>(res.data, 1, 50).items.filter((g) => g.purchase_order_number === poNumber))
      } catch {
        // Receipts panel is supplementary; leave it empty on failure.
      }
    }
    run()
    return () => controller.abort()
  }, [poNumber, receiptsKey])

  const linesById = useMemo(() => new Map((po?.lines ?? []).map((l) => [l.id, l])), [po])

  const state = resolveDetailState(singleStatus, singleError, !!po)
  if (state || !po) {
    return (
      <DetailPageState
        state={state ?? "loading"}
        entity="Purchase order"
        backTo="/purchasing/orders"
        backLabel="Back to purchase orders"
        error={singleError}
        onRetry={load}
      />
    )
  }

  const isDraft = po.status === "draft"
  const hasOutstanding = po.lines.some((l) => l.quantity_received < l.quantity_ordered)
  const receivedValue = poReceivedTotal(po)

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await action()
      toast.success(success)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Action failed"))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = () =>
    runAction(async () => {
      await dispatch(deleteData(po.id)).unwrap()
      navigate("/purchasing/orders")
    }, `${po.po_number} deleted`)

  return (
    <div className="section-container space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Button variant="back" size="sm" asChild>
            <Link to="/purchasing/orders">
              <ArrowLeft className="size-4" /> Purchase orders
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-mono">{po.po_number}</h1>
            <StatusBadge status={po.status} tone={PO_STATUS_TONE[po.status]} />
          </div>
          <p className="text-sm text-muted-foreground">
            {po.supplier_name} · ordered {formatDate(po.order_date)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="action" onClick={() => openPdf(purchaseOrderPdfUrl(po.id))}>
            <FileDown className="size-4" /> PDF
          </Button>
          {canManage && isDraft && (
            <Button variant="primary" size="action" onClick={() => setHeaderOpen(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}
          {canManage && isDraft && (
            <ConfirmAction
              title={`Submit ${po.po_number}?`}
              description="Submitting locks the order's lines and header. Goods can then be received against it."
              confirmLabel="Submit order"
              onConfirm={() => runAction(() => dispatch(submitPurchaseOrder(po.id)).unwrap(), "Purchase order submitted")}
              trigger={
                <Button size="action" disabled={busy}>
                  <Send className="size-4" /> Submit
                </Button>
              }
            />
          )}
          {canManage && po.status === "submitted" && hasOutstanding && (
            <Button size="action" onClick={() => setReceiveOpen(true)}>
              <PackageCheck className="size-4" /> Receive Goods
            </Button>
          )}
          {canBill && (po.status === "submitted" || po.status === "received") && receivedValue > 0 && (
            <Button variant="primary" size="action" onClick={() => setBillOpen(true)}>
              <FileText className="size-4" /> Create Bill
            </Button>
          )}
          {canManage && (po.status === "draft" || po.status === "submitted") && (
            <ConfirmAction
              title={`Cancel ${po.po_number}?`}
              description="The order will be marked cancelled. Stock already received stays in inventory."
              confirmLabel="Cancel order"
              destructive
              onConfirm={() => runAction(() => dispatch(cancelPurchaseOrder(po.id)).unwrap(), "Purchase order cancelled")}
              trigger={
                <Button variant="destructive" size="action" disabled={busy}>
                  <Ban className="size-4" /> Cancel
                </Button>
              }
            />
          )}
          {canManage && (po.status === "draft" || po.status === "cancelled") && (
            <DeleteModal
              title={`Delete ${po.po_number}?`}
              description="Only draft or cancelled orders can be deleted."
              onConfirm={handleDelete}
              trigger={
                <Button variant="destructive" size="action" disabled={busy}>
                  <Trash2 className="size-4" /> Delete
                </Button>
              }
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat label="Order value" value={formatCurrency(poOrderedTotal(po))} sub={`${po.lines.length} lines`} />
        <SummaryStat label="Received value" value={formatCurrency(receivedValue)} sub="What a vendor bill must match" />
        <SummaryStat label="Units received" value={`${poUnitsReceived(po)} / ${poUnitsOrdered(po)}`} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Lines</CardTitle>
          {canManage && isDraft && (
            <Button size="sm" variant="outline" onClick={() => setLineDialog({ open: true, line: null })}>
              <Plus className="size-4" /> Add line
            </Button>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>PRODUCT</TableHead>
                <TableHead className="text-right">ORDERED</TableHead>
                <TableHead className="text-right">RECEIVED</TableHead>
                <TableHead className="text-right">UNIT COST</TableHead>
                <TableHead className="text-right">LINE TOTAL</TableHead>
                {canManage && isDraft && <TableHead className="w-[90px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
                        {line.product_image ? (
                          <img src={line.product_image} alt="" className="size-full object-cover" loading="lazy" />
                        ) : (
                          <ImageOff className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{line.product_name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{line.variant_sku}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.quantity_ordered}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span
                      className={
                        line.quantity_received >= line.quantity_ordered ? "text-green-600 dark:text-green-500" : undefined
                      }
                    >
                      {line.quantity_received}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(line.unit_cost)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrency(Number(line.unit_cost) * line.quantity_ordered)}
                  </TableCell>
                  {canManage && isDraft && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${line.variant_sku}`}
                          onClick={() => setLineDialog({ open: true, line })}
                        >
                          <Pencil className="size-4 text-blue-600" />
                        </Button>
                        <DeleteModal
                          title="Remove this line?"
                          description={`${line.product_name} (${line.variant_sku}) will be removed from the order.`}
                          onConfirm={() =>
                            runAction(async () => {
                              await dispatch(removePurchaseOrderLine({ poId: po.id, lineId: line.id })).unwrap()
                              await load()
                            }, "Line removed")
                          }
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`Remove ${line.variant_sku}`} disabled={po.lines.length <= 1}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{poUnitsOrdered(po)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{poUnitsReceived(po)}</TableCell>
                <TableCell />
                <TableCell className="text-right font-bold tabular-nums">{formatCurrency(poOrderedTotal(po))}</TableCell>
                {canManage && isDraft && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Goods receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing received against this order yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {receipts.map((grn) => (
                  <li key={grn.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{formatDate(grn.received_date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {grn.lines.reduce((s, l) => s + l.quantity_received, 0)} units across {grn.lines.length} lines
                        {grn.lines.some((l) => l.condition === "rejected") &&
                          ` · ${grn.lines
                            .filter((l) => l.condition === "rejected")
                            .map((l) => linesById.get(l.purchase_order_line_id)?.variant_sku ?? "line")
                            .join(", ")} rejected`}
                      </p>
                    </div>
                    <StatusBadge status={grn.status} tone={GRN_STATUS_TONE[grn.status]} label={GRN_STATUS_LABEL[grn.status]} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{po.notes || "No notes."}</p>
          </CardContent>
        </Card>
      </div>

      {headerOpen && <HeaderEditDialog open={headerOpen} onOpenChange={setHeaderOpen} po={po} />}
      {lineDialog.open && (
        <LineDialog
          open={lineDialog.open}
          onOpenChange={(open) => setLineDialog((s) => ({ ...s, open }))}
          po={po}
          line={lineDialog.line}
          onSaved={() => {
            load()
          }}
        />
      )}
      <GoodsReceiptDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        purchaseOrder={po}
        onReceived={() => {
          load()
          setReceiptsKey((k) => k + 1)
        }}
      />
      <VendorBillFormDialog
        open={billOpen}
        onOpenChange={setBillOpen}
        purchaseOrder={po}
        onSaved={() => navigate("/purchasing/bills")}
      />
    </div>
  )
}

export default PurchaseOrderDetail
