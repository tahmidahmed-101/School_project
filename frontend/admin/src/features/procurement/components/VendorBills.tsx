import { useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Ban, Banknote, CheckCircle2, FileDown, FileText, Pencil, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeader } from "@/components/common/PageHeader"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DateCell, LinkCell, MoneyCell } from "@/components/common/cells"
import { DialogActions } from "@/components/common/FormDialog"
import { DateField, TextField } from "@/components/common/form-fields"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, formatDate, formatDateTime, fromDatetimeLocal, toDatetimeLocal } from "@/lib/format"
import { fromPaisa, sumMoney, toPaisa } from "@/lib/money"
import { parseAmount } from "@/lib/moneyInput"
import { useAppDispatch } from "@/app/hooks"
import type { Option } from "@/lib/types"
import { useKind } from "@/hooks/use-kind"
import { billsTitle, purchasingBase } from "../lib/kind"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"

import { fetchAll, fetchSingle, recordVendorPayment, vendorBillPdfUrl, voidVendorBill } from "../slices/vendorBillSlice"
import type { VendorBill } from "../types"
import { useCanWriteBills, useProcurementSelector } from "../hooks/useProcurement"
import { useStatusSortFilters } from "../hooks/useStatusSortFilters"
import { openPdf } from "../utils"
import { VendorBillFormDialog } from "./VendorBillFormDialog"

const PAYMENT_METHODS = ["Bank transfer", "Cash", "Cheque", "bKash", "Nagad", "Card"]

const paidOf = (bill: VendorBill) => sumMoney(bill.payments.map((p) => p.amount))
const outstandingOf = (bill: VendorBill) => {
  const left = toPaisa(bill.amount) - toPaisa(paidOf(bill))
  return fromPaisa(left > 0 ? left : BigInt(0))
}
const isOpen = (bill: VendorBill) => bill.status === "unpaid" || bill.status === "overdue"

function PaymentDialog({
  bill,
  open,
  onOpenChange,
  onRecorded,
}: {
  bill: VendorBill
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecorded: () => void
}) {
  const dispatch = useAppDispatch()
  const outstanding = outstandingOf(bill)
  const [amount, setAmount] = useState(outstanding)
  const [paidAt, setPaidAt] = useState(() => toDatetimeLocal(new Date().toISOString()))
  const [method, setMethod] = useState("Bank transfer")
  const [reference, setReference] = useState("")
  const [saving, setSaving] = useState(false)

  const typedPaisa = parseAmount(amount)
  const amountValid = typedPaisa !== null && typedPaisa > 0 && typedPaisa <= toPaisa(outstanding)

  const save = async () => {
    const paidAtIso = fromDatetimeLocal(paidAt)
    if (!paidAtIso) return
    setSaving(true)
    try {
      await dispatch(
        recordVendorPayment({
          billId: bill.id,
          payload: { amount, paid_at: paidAtIso, method: method.trim(), reference: reference.trim() },
        })
      ).unwrap()
      toast.success("Payment recorded")
      onRecorded()
      onOpenChange(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to record payment"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment — {bill.bill_number}</DialogTitle>
          <DialogDescription>
            {formatCurrency(outstanding)} outstanding. Posts a debit to Accounts Payable and a credit to Bank.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Amount *"
              id="pay-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={outstanding}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <DateField
              label="Paid at *"
              id="pay-at"
              withTime
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="pay-method">Method</FieldLabel>
              <FieldContent>
                <Input id="pay-method" list="vendor-pay-methods" value={method} onChange={(e) => setMethod(e.target.value)} />
                <datalist id="vendor-pay-methods">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </FieldContent>
            </Field>
            <TextField
              label="Reference"
              id="pay-ref"
              placeholder="e.g. BEFTN trace no."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>
        <DialogActions
          onCancel={() => onOpenChange(false)}
          onSubmit={save}
          submitLabel="Record Payment"
          icon={CheckCircle2}
          submitting={saving}
          submitDisabled={!amountValid || !paidAt}
        />
      </DialogContent>
    </Dialog>
  )
}

function BillDetailDialog({
  bill,
  canWrite,
  onClose,
  onChanged,
}: {
  bill: VendorBill | null
  canWrite: boolean
  onClose: () => void
  onChanged: (billId: string) => void
}) {
  const dispatch = useAppDispatch()
  const [payOpen, setPayOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)

  if (!bill) return null
  const open = isOpen(bill)
  const hasPayments = bill.payments.length > 0

  const handleVoid = async () => {
    setVoiding(true)
    try {
      await dispatch(voidVendorBill(bill.id)).unwrap()
      toast.success(`${bill.bill_number} voided`)
      onChanged(bill.id)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to void bill"))
    } finally {
      setVoiding(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="font-mono">{bill.bill_number}</span>
              <StatusBadge status={bill.status} />
            </DialogTitle>
            <DialogDescription>
              {bill.supplier_name} · PO{" "}
              <Link to={`${purchasingBase(bill.kind)}/orders/${bill.purchase_order_id}`} className="text-primary hover:underline">
                {bill.purchase_order_number}
              </Link>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/40 p-4">
            <div>
              <span className="text-xs text-muted-foreground block">Amount</span>
              <span className="text-lg font-bold tabular-nums">{formatCurrency(bill.amount)}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Paid</span>
              <span className="text-lg font-bold tabular-nums">{formatCurrency(paidOf(bill))}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Due {formatDate(bill.due_date)}</span>
              <span className="text-lg font-bold tabular-nums text-primary">
                {bill.status === "void" ? "—" : formatCurrency(outstandingOf(bill))}
              </span>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">Payments</p>
            {hasPayments ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {bill.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{formatDateTime(p.paid_at)}</p>
                      <p className="text-xs text-muted-foreground">
                        {[p.method, p.reference].filter(Boolean).join(" · ") || "No method recorded"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No payments recorded.</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => openPdf(vendorBillPdfUrl(bill.id))}>
              <FileDown className="size-4" /> PDF
            </Button>
            {canWrite && open && (
              <div className="flex flex-wrap gap-2">
                {!hasPayments && (
                  <>
                    <ConfirmDialog
                      title={`Void ${bill.bill_number}?`}
                      description="Voiding reverses the bill's ledger postings. It can't be undone."
                      confirmLabel="Void bill"
                      destructive
                      onConfirm={handleVoid}
                      trigger={
                        <Button variant="destructive" disabled={voiding}>
                          <Ban className="size-4" /> Void
                        </Button>
                      }
                    />
                    <Button variant="outline" onClick={() => setEditOpen(true)}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                  </>
                )}
                <Button onClick={() => setPayOpen(true)}>
                  <Banknote className="size-4" /> Record Payment
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {payOpen && (
        <PaymentDialog bill={bill} open={payOpen} onOpenChange={setPayOpen} onRecorded={() => onChanged(bill.id)} />
      )}
      <VendorBillFormDialog open={editOpen} onOpenChange={setEditOpen} bill={bill} onSaved={() => onChanged(bill.id)} />
    </>
  )
}

const STATUS_OPTIONS: Option[] = [
  { label: "Unpaid", value: "unpaid" },
  { label: "Overdue", value: "overdue" },
  { label: "Paid", value: "paid" },
  { label: "Void", value: "void" },
]

const SORT_OPTIONS: Option[] = [
  { label: "Due date: latest", value: "-due_date" },
  { label: "Due date: soonest", value: "due_date" },
  { label: "Recently created", value: "-created_at" },
]

const VendorBillsList = () => {
  const kind = useKind()
  const title = billsTitle(kind)
  useDocumentTitle(title)
  const dispatch = useAppDispatch()
  const state = useProcurementSelector((state) => state.vendorBills)
  const { data } = state
  const canWrite = useCanWriteBills()

  const filters = useStatusSortFilters(STATUS_OPTIONS, SORT_OPTIONS)
  const list = useListPage({ fetch: (p) => dispatch(fetchAll(p)), state, params: { ...filters.params, kind } })
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const viewing = data.find((b) => b.id === viewingId) ?? null

  // Payments/edits change totals and status server-side: refetch the bill, then the page.
  const handleChanged = async (billId: string) => {
    await dispatch(fetchSingle(billId))
    list.reload()
  }

  const columns: ColumnDef<VendorBill>[] = [
    {
      accessorKey: "bill_number",
      header: "BILL #",
      cell: ({ row }) => <span className="font-mono text-sm font-semibold text-primary">{row.original.bill_number}</span>,
    },
    {
      accessorKey: "supplier_name",
      header: "SUPPLIER",
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.supplier_name}</span>,
    },
    {
      accessorKey: "purchase_order_number",
      header: "PO",
      cell: ({ row }) => (
        <LinkCell
          to={`${purchasingBase(row.original.kind)}/orders/${row.original.purchase_order_id}`}
          className="font-mono text-muted-foreground hover:text-primary"
        >
          {row.original.purchase_order_number}
        </LinkCell>
      ),
    },
    {
      accessorKey: "amount",
      header: "AMOUNT",
      cell: ({ row }) => <MoneyCell value={row.original.amount} emphasis />,
    },
    {
      id: "outstanding",
      header: "OUTSTANDING",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.original.status === "void" ? "—" : formatCurrency(outstandingOf(row.original))}
        </span>
      ),
    },
    {
      accessorKey: "due_date",
      header: "DUE",
      cell: ({ row }) => <DateCell value={row.original.due_date} className="text-muted-foreground" />,
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => <TableActions itemName={row.original.bill_number} onView={() => setViewingId(row.original.id)} />,
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title={title}
        actions={
          canWrite && (
            <Button size="action" onClick={() => setCreateOpen(true)}>
              <Plus className="size-5" /> New Bill
            </Button>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search bill number..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={filters.filters}
      />

      <DataTable
        columns={columns}
        data={data}
        {...list.tableProps}
        onRowClick={(b) => setViewingId(b.id)}
        emptyIcon={FileText}
        emptyTitle={kind === "preorder" ? "No supplier bills" : "No vendor bills"}
        minWidth="1080px"
        columnWidths={["150px", "190px", "130px", "130px", "130px", "110px", "100px", "80px"]}
      />

      <BillDetailDialog bill={viewing} canWrite={canWrite} onClose={() => setViewingId(null)} onChanged={handleChanged} />
      <VendorBillFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(bill) => {
          list.reload()
          setViewingId(bill.id)
        }}
      />
    </div>
  )
}

const VendorBills = () => <VendorBillsList key={useKind()} />

export default VendorBills
