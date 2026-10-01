import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Ban, Banknote, CheckCircle2, FileDown, FileText, Loader2, Pencil, Plus } from "lucide-react"

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
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, formatDate, formatDateTime, fromDatetimeLocal, toDatetimeLocal } from "@/lib/format"
import { useAppDispatch } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { fetchAll, fetchSingle, recordVendorPayment, vendorBillPdfUrl, voidVendorBill } from "../slices/vendorBillSlice"
import type { VendorBill } from "../types"
import { useCanWriteBills, useDebouncedValue, useProcurementSelector } from "../hooks/useProcurement"
import { BILL_STATUS_TONE, openPdf } from "../utils"
import { ConfirmAction } from "./ConfirmAction"
import { VendorBillFormDialog } from "./VendorBillFormDialog"

const PAGE_SIZE = 20
type Option = { label: string; value: string }

const PAYMENT_METHODS = ["Bank transfer", "Cash", "Cheque", "bKash", "Nagad", "Card"]

const paidOf = (bill: VendorBill) => bill.payments.reduce((s, p) => s + Number(p.amount), 0)
const outstandingOf = (bill: VendorBill) => Math.max(0, Math.round((Number(bill.amount) - paidOf(bill)) * 100) / 100)
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
  const [amount, setAmount] = useState(outstanding.toFixed(2))
  const [paidAt, setPaidAt] = useState(() => toDatetimeLocal(new Date().toISOString()))
  const [method, setMethod] = useState("Bank transfer")
  const [reference, setReference] = useState("")
  const [saving, setSaving] = useState(false)

  const amountValid = Number(amount) > 0 && Number(amount) <= outstanding + 0.001

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
            <Field>
              <FieldLabel htmlFor="pay-amount">Amount *</FieldLabel>
              <FieldContent>
                <Input
                  id="pay-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={outstanding}
                  value={amount}
                  aria-invalid={!amountValid}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="pay-at">Paid at *</FieldLabel>
              <FieldContent>
                <Input id="pay-at" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </FieldContent>
            </Field>
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
            <Field>
              <FieldLabel htmlFor="pay-ref">Reference</FieldLabel>
              <FieldContent>
                <Input id="pay-ref" placeholder="e.g. BEFTN trace no." value={reference} onChange={(e) => setReference(e.target.value)} />
              </FieldContent>
            </Field>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !amountValid || !paidAt}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Record Payment
          </Button>
        </DialogFooter>
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
              <StatusBadge status={bill.status} tone={BILL_STATUS_TONE[bill.status]} />
            </DialogTitle>
            <DialogDescription>
              {bill.supplier_name} · PO{" "}
              <Link to={`/purchasing/orders/${bill.purchase_order_id}`} className="text-primary hover:underline">
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
                    <ConfirmAction
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

const VendorBills = () => {
  useDocumentTitle("Vendor Bills")
  const dispatch = useAppDispatch()
  const { data, isFetchingList, error, totalItems, meta } = useProcurementSelector((state) => state.vendorBills)
  const canWrite = useCanWriteBills()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)
  const [status, setStatus] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const viewing = data.find((b) => b.id === viewingId) ?? null

  const load = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(status ? { status: status.value } : {}),
          ...(ordering ? { ordering: ordering.value } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, status, ordering]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  // Payments/edits change totals and status server-side: refetch the bill, then the page.
  const handleChanged = async (billId: string) => {
    await dispatch(fetchSingle(billId))
    load()
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
        <Link
          to={`/purchasing/orders/${row.original.purchase_order_id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-sm text-muted-foreground hover:text-primary hover:underline"
        >
          {row.original.purchase_order_number}
        </Link>
      ),
    },
    {
      accessorKey: "amount",
      header: "AMOUNT",
      cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.original.amount)}</span>,
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
      cell: ({ row }) => <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(row.original.due_date)}</span>,
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.status} tone={BILL_STATUS_TONE[row.original.status]} />,
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => <TableActions itemName={row.original.bill_number} onView={() => setViewingId(row.original.id)} />,
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Vendor Bills" description="Supplier invoices matched to received purchase orders (accounts payable)." />
        {canWrite && (
          <Button size="action" onClick={() => setCreateOpen(true)}>
            <Plus className="size-5" /> New Bill
          </Button>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search bill number..."
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={STATUS_OPTIONS}
                placeholder="Status"
                value={status}
                onValueChange={(v) => {
                  setStatus(v)
                  setPage(1)
                }}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={[
                  { label: "Due date: latest", value: "-due_date" },
                  { label: "Due date: soonest", value: "due_date" },
                  { label: "Recently created", value: "-created_at" },
                ]}
                placeholder="Sort"
                value={ordering}
                onValueChange={(v) => {
                  setOrdering(v)
                  setPage(1)
                }}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isFetchingList}
        error={error}
        onRetry={() => {
          load()
        }}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        onRowClick={(b) => setViewingId(b.id)}
        emptyIcon={FileText}
        emptyTitle="No vendor bills"
        minWidth="1080px"
        columnWidths={["150px", "190px", "130px", "130px", "130px", "110px", "100px", "80px"]}
      />

      <BillDetailDialog bill={viewing} canWrite={canWrite} onClose={() => setViewingId(null)} onChanged={handleChanged} />
      <VendorBillFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(bill) => {
          load()
          setViewingId(bill.id)
        }}
      />
    </div>
  )
}

export default VendorBills
