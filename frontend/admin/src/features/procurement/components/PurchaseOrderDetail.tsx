import type { ColumnDef } from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  Ban,
  FileDown,
  FileText,
  ImageOff,
  PackageCheck,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/common/data-table"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DeleteModal } from "@/components/common/DeleteModal"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { FormDialog } from "@/components/common/FormDialog"
import { PageHeader } from "@/components/common/PageHeader"
import { DetailPageState } from "@/components/common/DetailPageState"
import { Thumbnail } from "@/components/common/cells"
import { DateField, TextField, TextareaField } from "@/components/common/form-fields"
import { TableActions } from "@/components/common/TableActions"
import { resolveDetailState } from "@/lib/detailState"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { formatCurrency, formatDate } from "@/lib/format"
import { useAppDispatch } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useAllPages } from "@/hooks/use-all-pages"
import { useDelayedUnmount } from "@/hooks/use-dialog-presence"

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
import { useCanManagePurchasing, useCanWriteBills, useProcurementSelector } from "../hooks/useProcurement"
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
import { GoodsReceiptDialog } from "./GoodsReceiptDialog"
import { VendorBillFormDialog } from "./VendorBillFormDialog"
import { VariantPicker, type PickedVariant } from "@/components/common/VariantPicker"
import { toPaisa } from "@/lib/money"

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
  const { items: suppliers } = useAllPages<Supplier>("/admin/procurement/suppliers/", undefined, { enabled: open })
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${po.po_number}`}
      description="Header details can only change while the order is a draft."
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      submitting={saving}
      submitLabel="Save"
      submitDisabled={!orderDate}
    >
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
      <DateField label="Order date" id="poe-date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
      <TextareaField label="Notes" id="poe-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </FormDialog>
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
    line
      ? { id: line.variant_id, product_name: line.product_name, label: line.product_name, sku: line.variant_sku, cost_price: null }
      : null
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={line ? "Edit Line" : "Add Line"}
      description={po.po_number}
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      submitting={saving}
      submitLabel="Save"
      submitDisabled={!variant || !qtyValid || !costValid}
    >
      <Field>
        <FieldLabel htmlFor="line-variant">Variant *</FieldLabel>
        <FieldContent>
          <VariantPicker
            variant="combobox"
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
        <TextField
          label="Quantity *"
          id="line-qty"
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <TextField
          label="Unit cost *"
          id="line-cost"
          type="number"
          min={0}
          step="0.01"
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
        />
      </div>
    </FormDialog>
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
  const headerMounted = useDelayedUnmount(headerOpen)
  const lineMounted = useDelayedUnmount(lineDialog.open)
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

  const canEditLines = canManage && isDraft
  const lineColumns: ColumnDef<PurchaseOrderLine>[] = [
    {
      id: "product",
      header: "PRODUCT",
      cell: ({ row: { original: line } }) => (
        <div className="flex items-center gap-3">
          <Thumbnail src={line.product_image} icon={ImageOff} className="size-10 rounded" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{line.product_name}</p>
            <p className="font-mono text-xs text-muted-foreground">{line.variant_sku}</p>
          </div>
        </div>
      ),
    },
    {
      id: "ordered",
      header: "ORDERED",
      meta: { align: "right" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.quantity_ordered}</span>,
    },
    {
      id: "received",
      header: "RECEIVED",
      meta: { align: "right" },
      cell: ({ row: { original: line } }) => (
        <span
          className={
            line.quantity_received >= line.quantity_ordered
              ? "tabular-nums text-green-600 dark:text-green-500"
              : "tabular-nums"
          }
        >
          {line.quantity_received}
        </span>
      ),
    },
    {
      id: "unit_cost",
      header: "UNIT COST",
      meta: { align: "right" },
      cell: ({ row }) => <span className="tabular-nums">{formatCurrency(row.original.unit_cost)}</span>,
    },
    {
      id: "line_total",
      header: "LINE TOTAL",
      meta: { align: "right" },
      cell: ({ row: { original: line } }) => (
        <span className="font-semibold tabular-nums">
          {formatCurrency(line.line_total)}
        </span>
      ),
    },
    ...(canEditLines
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row: { original: line } }) => (
              <TableActions
                itemName={`${line.product_name} (${line.variant_sku})`}
                onEdit={() => setLineDialog({ open: true, line })}
                // An order must keep at least one line.
                onDelete={
                  po.lines.length > 1
                    ? () =>
                        runAction(async () => {
                          await dispatch(removePurchaseOrderLine({ poId: po.id, lineId: line.id })).unwrap()
                          await load()
                        }, "Line removed")
                    : undefined
                }
              />
            ),
          } satisfies ColumnDef<PurchaseOrderLine>,
        ]
      : []),
  ]

  return (
    <div className="section-container space-y-6">
      <PageHeader
        back={{ to: "/purchasing/orders", label: "Back to purchase orders" }}
        title={<span className="font-mono">{po.po_number}</span>}
        badges={<StatusBadge status={po.status} tone={PO_STATUS_TONE[po.status]} />}
        description={`${po.supplier_name} · ordered ${formatDate(po.order_date)}`}
        actions={
          <>
            <Button variant="primary" size="action" onClick={() => openPdf(purchaseOrderPdfUrl(po.id))}>
              <FileDown className="size-4" /> PDF
            </Button>
            {canManage && isDraft && (
              <Button variant="primary" size="action" onClick={() => setHeaderOpen(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            {canManage && isDraft && (
              <ConfirmDialog
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
            {canBill && (po.status === "submitted" || po.status === "received") && toPaisa(receivedValue) > 0 && (
              <Button variant="primary" size="action" onClick={() => setBillOpen(true)}>
                <FileText className="size-4" /> Create Bill
              </Button>
            )}
            {canManage && (po.status === "draft" || po.status === "submitted") && (
              <ConfirmDialog
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
          </>
        }
      />

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
        <CardContent>
          <DataTable
            embedded
            showPagination={false}
            columns={lineColumns}
            data={po.lines}
            minWidth="720px"
            columnWidths={["auto", "110px", "110px", "130px", "140px", ...(canEditLines ? ["80px"] : [])]}
            unlabelledColumns={["actions"]}
            footer={["Total", poUnitsOrdered(po), poUnitsReceived(po), null, formatCurrency(poOrderedTotal(po))]}
          />
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

      {/* Unmounted when closed so each opening starts fresh, but only after the exit animation. */}
      {headerMounted && <HeaderEditDialog open={headerOpen} onOpenChange={setHeaderOpen} po={po} />}
      {lineMounted && (
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
